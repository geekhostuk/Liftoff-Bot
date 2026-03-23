import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import useWebSocket from '../../hooks/useWebSocket';
import useCountdown from '../../hooks/useCountdown';
import { getStatus } from '../../lib/api';
import Badge from '../ui/Badge';
import './LiveStatus.css';

const isBot = (nick) => String(nick || '').toLowerCase() === 'jmt_bot';

export default function LiveStatus() {
  const [track, setTrack] = useState(null);
  const [players, setPlayers] = useState([]);
  const [playlist, setPlaylist] = useState(null);
  const [pluginConnected, setPluginConnected] = useState(null);

  const playerCount = players.filter(p => !isBot(p.nick)).length;

  const { connected } = useWebSocket(useCallback((event) => {
    switch (event.event_type) {
      case 'state_snapshot': {
        if (event.current_track?.track) setTrack(event.current_track);
        setPlayers(event.online_players || []);
        if (event.playlist?.running) setPlaylist(event.playlist);
        break;
      }
      case 'track_changed':
        setTrack({ env: event.env, track: event.track, race: event.race });
        break;
      case 'playlist_state':
        setPlaylist(event.running ? event : null);
        break;
      case 'player_list':
        setPlayers(event.players || []);
        break;
      case 'player_entered':
        setPlayers(prev => {
          if (prev.some(p => p.actor === event.actor)) return prev;
          return [...prev, { actor: event.actor, nick: event.nick }];
        });
        break;
      case 'player_left':
        setPlayers(prev => prev.filter(p => p.actor !== event.actor));
        break;
    }
  }, []));

  // REST fallback for initial load
  useEffect(() => {
    getStatus().then(d => {
      if (d.current_track?.track) setTrack(t => t || d.current_track);
      if (d.playlist?.running) setPlaylist(p => p || d.playlist);
      setPluginConnected(d.plugin_connected ?? null);
    }).catch(() => {});
  }, []);

  const countdown = useCountdown(playlist?.next_change_at);

  let countdownStr = '';
  if (playlist && !countdown.expired) {
    const parts = [];
    if (countdown.hours > 0) parts.push(`${countdown.hours}h`);
    parts.push(`${countdown.minutes}m`);
    countdownStr = parts.join(' ');
  }

  return (
    <section className="live-status">
      <div className="live-status-inner">
        <div className="live-status-indicator">
          <span className={`live-status-dot ${connected ? 'connected' : ''}`} />
          <span className="live-status-label">{connected ? 'Server Live' : 'Connecting…'}</span>
        </div>

        <div className="live-status-items">
          {track && (
            <div className="live-status-item">
              <span className="live-status-item-label">Track</span>
              <span className="live-status-item-value">{track.track}</span>
            </div>
          )}

          {playlist && (
            <div className="live-status-item">
              <span className="live-status-item-label">Playlist</span>
              <span className="live-status-item-value">
                {playlist.playlist_name}
                {countdownStr && <span className="live-status-countdown"> — next in {countdownStr}</span>}
              </span>
            </div>
          )}

          <div className="live-status-item">
            <span className="live-status-item-label">Players</span>
            <span className="live-status-item-value">
              {playerCount}/8
              {playerCount >= 7 && <Badge variant="warning">FULL</Badge>}
            </span>
          </div>
        </div>

        <Link to="/live" className="btn btn-outline btn-sm live-status-link">
          Watch Live
        </Link>
      </div>
    </section>
  );
}
