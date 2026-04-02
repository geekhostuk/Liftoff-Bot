import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const wsRef = useRef(null);
  const listenersRef = useRef(new Map());
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef(null);
  const backoffRef = useRef(3000);
  const failCountRef = useRef(0);
  const { logout } = useAuth();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/admin`);

    ws.onopen = () => {
      setConnected(true);
      backoffRef.current = 3000;
      failCountRef.current = 0;
    };
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      failCountRef.current += 1;

      // 3 consecutive failures without a successful open = session is dead
      if (failCountRef.current >= 3) {
        logout();
        return;
      }

      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, 30000);
    };
    ws.onmessage = ({ data }) => {
      try {
        const event = JSON.parse(data);
        const type = event.event_type;
        if (type && listenersRef.current.has(type)) {
          for (const cb of listenersRef.current.get(type)) {
            cb(event);
          }
        }
        // Also fire wildcard listeners
        if (listenersRef.current.has('*')) {
          for (const cb of listenersRef.current.get('*')) {
            cb(event);
          }
        }
      } catch {}
    };

    wsRef.current = ws;
  }, [logout]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((eventType, callback) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType).add(callback);
    return () => {
      listenersRef.current.get(eventType)?.delete(callback);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ connected, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWs() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error('useWs must be used within WebSocketProvider');
  return ctx;
}

export function useWsEvent(eventType, callback) {
  const { subscribe } = useWs();
  useEffect(() => subscribe(eventType, callback), [subscribe, eventType, callback]);
}
