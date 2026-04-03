import { useState, useCallback } from 'react';
import useWebSocket from './useWebSocket';

const PLAYERS_PER_LOBBY = 8;

/**
 * Tracks the live lobby player count via WebSocket.
 * Returns { count, max, connected } where max scales with connected bots.
 */
export default function useLobbyCount() {
  const [count, setCount] = useState(0);
  const [botCount, setBotCount] = useState(1);

  const { connected } = useWebSocket(useCallback((event) => {
    switch (event.event_type) {
      case 'state_snapshot':
        setCount(event.online_players ? event.online_players.length : 0);
        if (event.connected_bots) setBotCount(event.connected_bots);
        break;
      case 'player_list':
        setCount(event.players ? event.players.length : 0);
        break;
      case 'player_entered':
        setCount(c => c + 1);
        break;
      case 'player_left':
        setCount(c => Math.max(0, c - 1));
        break;
    }
  }, []));

  return { count, max: PLAYERS_PER_LOBBY * Math.max(botCount, 1), connected };
}
