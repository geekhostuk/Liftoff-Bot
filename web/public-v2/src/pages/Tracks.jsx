import { useState, useEffect, useRef, useCallback } from 'react';
import useApi from '../hooks/useApi';
import { getTracks } from '../lib/api';
import { Loading, ErrorState, Empty } from '../components/ui/EmptyState';
import './Tracks.css';

export default function Tracks() {
  const { data, loading, error, refetch } = useApi(() => getTracks(), []);

  // WebSocket for live updates
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    let reconnectTimer;

    function connect() {
      ws = new WebSocket(`${proto}//${location.host}/ws/live`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event_type === 'playlist_state' || msg.event_type === 'track_changed') {
            refetch();
          }
        } catch {}
      };
      ws.onclose = () => { reconnectTimer = setTimeout(connect, 3000); };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [refetch]);

  if (loading) return <Loading message="Loading tracks..." />;
  if (error) return <ErrorState message="Failed to load tracks." onRetry={refetch} />;

  return (
    <div className="tracks-page">
      <h1 className="tracks-title"><span className="accent">Tracks</span></h1>
      <p className="tracks-subtitle">Active playlists, upcoming tracks, and recently played.</p>

      <NowPlaying track={data.current_track} nextChangeAt={data.next_change_at} />

      <div className="tracks-two-col">
        <div className="tracks-section">
          <div className="tracks-section-header">Coming Up Next</div>
          {data.upcoming.length === 0 ? (
            <div className="tracks-empty">No upcoming tracks</div>
          ) : (
            <ul className="track-list">
              {data.upcoming.map((t, i) => (
                <li key={i} className="track-item">
                  <span className="track-index">{i + 1}</span>
                  <span className="track-name">{t.track}</span>
                  <span className="track-env">{t.env}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tracks-section">
          <div className="tracks-section-header">Recently Played</div>
          {data.recent_tracks.length === 0 ? (
            <div className="tracks-empty">No recent tracks</div>
          ) : (
            <table className="recent-table">
              <thead>
                <tr><th>Track</th><th>Environment</th><th>Last Played</th></tr>
              </thead>
              <tbody>
                {data.recent_tracks.map((t, i) => (
                  <tr key={i}>
                    <td>{t.track}</td>
                    <td>{t.env}</td>
                    <td className="time-ago">{timeAgo(t.last_played)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="tracks-section">
        <div className="tracks-section-header">Active Playlists</div>
        {data.active_playlists.length === 0 ? (
          <div className="tracks-empty">No active playlists</div>
        ) : (
          data.active_playlists.map((pl) => (
            <PlaylistCard
              key={pl.playlist_id}
              playlist={pl}
              defaultOpen={false}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Now Playing Banner ────────────────────────────────────────────────────

function NowPlaying({ track, nextChangeAt }) {
  const [countdown, setCountdown] = useState('—');

  useEffect(() => {
    if (!nextChangeAt) { setCountdown('—'); return; }
    const target = new Date(nextChangeAt).getTime();

    function tick() {
      const remain = target - Date.now();
      if (remain <= 0) { setCountdown('0:00'); return; }
      const m = Math.floor(remain / 60000);
      const s = Math.floor((remain % 60000) / 1000);
      setCountdown(`${m}:${String(s).padStart(2, '0')}`);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextChangeAt]);

  const hasTrack = track && (track.track || track.env);

  return (
    <div className="now-playing-banner">
      <div className="now-playing-info">
        <div className="now-playing-label">Now Playing</div>
        <div className="now-playing-track">{hasTrack ? track.track : 'No track loaded'}</div>
        {hasTrack && track.env && <div className="now-playing-env">{track.env}</div>}
      </div>
      <div className="now-playing-timer">
        <div className="now-playing-countdown">{countdown}</div>
        <div className="now-playing-timer-label">until next track</div>
      </div>
    </div>
  );
}

// ── Playlist Accordion ────────────────────────────────────────────────────

function PlaylistCard({ playlist, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const tracks = playlist.tracks || [];

  return (
    <div className={`playlist-card${open ? ' open' : ''}`}>
      <div className="playlist-header" onClick={() => setOpen(o => !o)}>
        <span className="playlist-chevron">&#9654;</span>
        <span className="playlist-name">{playlist.playlist_name}</span>
        {playlist.is_current && <span className="playlist-badge">Playing</span>}
        <span className="playlist-track-count">
          {tracks.length} track{tracks.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="playlist-tracks">
        <ul className="track-list">
          {tracks.map((t, i) => {
            const isCurrent = playlist.is_current && i === playlist.current_index;
            return (
              <li key={i} className={`track-item${isCurrent ? ' current' : ''}`}>
                <span className="track-index">{i + 1}</span>
                <span className="track-name">{t.track}</span>
                <span className="track-env">{t.env}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
