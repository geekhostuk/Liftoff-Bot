import { useEffect, useRef, useState } from 'react';

const WS_HEARTBEAT_MS = 60_000;
const RECONNECT_MS = 3_000;

/**
 * WebSocket hook that connects to /ws/live with heartbeat and auto-reconnect.
 *
 * @param {(event: object) => void} onEvent – called for every parsed event
 * @param {boolean} enabled – set false to skip connecting (default true)
 * @returns {{ connected: boolean }}
 */
export default function useWebSocket(onEvent, enabled = true) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    let ws;
    let heartbeat;
    let lastMsgAt;
    let unmounted = false;
    let reconnectTimer;

    function connect() {
      if (unmounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws/live`);

      ws.onopen = () => {
        lastMsgAt = Date.now();
        setConnected(true);
        heartbeat = setInterval(() => {
          if (Date.now() - lastMsgAt > WS_HEARTBEAT_MS) {
            ws.close();
          }
        }, 10_000);
      };

      ws.onclose = () => {
        setConnected(false);
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, RECONNECT_MS);
        }
      };

      ws.onmessage = ({ data }) => {
        lastMsgAt = Date.now();
        try {
          const event = JSON.parse(data);
          if (event.event_type === 'keepalive') return;
          onEventRef.current(event);
        } catch { /* ignore parse errors */ }
      };
    }

    connect();

    return () => {
      unmounted = true;
      if (heartbeat) clearInterval(heartbeat);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [enabled]);

  return { connected };
}
