import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import { useApi } from '../hooks/useApi.js';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import StatusDot from '../components/feedback/StatusDot.jsx';
import RunnerBar from '../components/feedback/RunnerBar.jsx';
import { fmtIdleTime, fmtDateTime } from '../lib/fmt.js';
import { Users, Plug, MapPin, Play, MessageSquare } from 'lucide-react';

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-lg)',
    padding: 'var(--space-lg)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 'var(--space-md)',
  },
  card: {
    background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-lg)',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xs)',
  },
  cardValue: {
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  cardLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: 500,
  },
  cardIcon: {
    color: '#FF7A00',
    opacity: 0.8,
  },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--space-md)',
  },
  panel: {
    background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-md)',
    padding: 'var(--space-lg)',
    border: '1px solid var(--border-color)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 'var(--space-md)',
  },
  panelTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  panelLink: {
    fontSize: '0.8rem',
    color: '#FF7A00',
    textDecoration: 'none',
  },
  miniRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 'var(--space-sm) 0',
    borderBottom: '1px solid var(--border-color)',
  },
  nick: {
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  idle: {
    fontSize: '0.85rem',
    color: 'var(--text-muted)',
  },
  chatRow: {
    padding: 'var(--space-sm) 0',
    borderBottom: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  chatMeta: {
    display: 'flex',
    gap: 'var(--space-sm)',
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  chatNick: {
    color: '#FF7A00',
    fontWeight: 600,
  },
  chatMsg: {
    fontSize: '0.85rem',
    color: 'var(--text-primary)',
  },
  runnerSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
  },
  empty: {
    color: 'var(--text-muted)',
    fontSize: '0.85rem',
    fontStyle: 'italic',
    padding: 'var(--space-md) 0',
  },
};

export default function Dashboard() {
  const { apiFetch } = useApi();

  const [pluginConnected, setPluginConnected] = useState(false);
  const [players, setPlayers] = useState([]);
  const [idleTimes, setIdleTimes] = useState({});
  const [playlistState, setPlaylistState] = useState(null);
  const [tagRunnerState, setTagRunnerState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [status, playlist, tagRunner, idleStatus] = await Promise.all([
        apiFetch('GET', '/api/status'),
        apiFetch('GET', '/api/admin/playlist/state'),
        apiFetch('GET', '/api/admin/tag-runner/state').catch(() => null),
        apiFetch('GET', '/api/admin/idle-kick/status'),
      ]);
      setPluginConnected(status.plugin_connected);
      setPlayers(status.online_players || []);
      setPlaylistState(playlist);
      setTagRunnerState(tagRunner);
      setIdleTimes(idleStatus?.idleTimes || {});
    } catch {
      // errors silenced — dashboard is best-effort
    }
  }, [apiFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // WebSocket events
  useWsEvent('player_entered', (data) => {
    setPlayers((prev) => {
      if (prev.some((p) => p.actor === data.actor)) return prev;
      return [...prev, { actor: data.actor, nick: data.nick }];
    });
  });

  useWsEvent('player_left', (data) => {
    setPlayers((prev) => prev.filter((p) => p.actor !== data.actor));
  });

  useWsEvent('player_list', (data) => {
    setPlayers(data.players || data || []);
  });

  useWsEvent('state_snapshot', (data) => {
    if (data.online_players) setPlayers(data.online_players);
    if (data.plugin_connected !== undefined) setPluginConnected(data.plugin_connected);
  });

  useWsEvent('chat_message', (msg) => {
    setChatMessages((prev) => [msg, ...prev].slice(0, 5));
  });

  useWsEvent('playlist_state', (data) => {
    setPlaylistState(data);
  });

  useWsEvent('tag_runner_state', (data) => {
    setTagRunnerState(data);
  });

  const displayPlayers = useMemo(
    () => players.filter((p) => p.actor !== 'jmt_bot').slice(0, 8),
    [players],
  );

  const currentTrack = playlistState?.current_track
    ? `${playlistState.current_track.env} / ${playlistState.current_track.track}`
    : 'None';

  return (
    <div style={styles.page}>
      {/* Stats cards */}
      <div style={styles.statsGrid}>
        <div style={styles.card}>
          <div style={styles.cardValue}>
            <Users size={24} style={styles.cardIcon} />
            {players.filter((p) => p.actor !== 'jmt_bot').length}
          </div>
          <div style={styles.cardLabel}>Players Online</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>
            <Plug size={24} style={styles.cardIcon} />
            <StatusDot status={pluginConnected ? 'connected' : 'disconnected'} />
          </div>
          <div style={styles.cardLabel}>Plugin Status</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>
            <MapPin size={24} style={styles.cardIcon} />
            <span style={{ fontSize: '1rem', fontWeight: 500 }}>{currentTrack}</span>
          </div>
          <div style={styles.cardLabel}>Current Track</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardValue}>
            <Play size={24} style={styles.cardIcon} />
            <span style={{ fontSize: '1rem', fontWeight: 500 }}>
              {playlistState?.running ? 'Running' : 'Stopped'}
            </span>
          </div>
          <div style={styles.cardLabel}>Runner Status</div>
        </div>
      </div>

      {/* Two-column: players + chat */}
      <div style={styles.twoCol}>
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>Players Online</span>
            <Link to="/admin/players" style={styles.panelLink}>
              View all &rarr;
            </Link>
          </div>
          {displayPlayers.length === 0 ? (
            <div style={styles.empty}>No players online</div>
          ) : (
            displayPlayers.map((p) => (
              <div key={p.actor} style={styles.miniRow}>
                <span style={styles.nick}>{p.nick}</span>
                <span style={styles.idle}>
                  {idleTimes[p.actor] != null
                    ? fmtIdleTime(idleTimes[p.actor])
                    : '--'}
                </span>
              </div>
            ))
          )}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>
              <MessageSquare size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Recent Chat
            </span>
          </div>
          {chatMessages.length === 0 ? (
            <div style={styles.empty}>No recent messages</div>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} style={styles.chatRow}>
                <div style={styles.chatMeta}>
                  <span>{fmtDateTime(msg.timestamp || msg.ts)}</span>
                  <span style={styles.chatNick}>{msg.nick}</span>
                </div>
                <div style={styles.chatMsg}>{msg.message || msg.text}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Runner bars */}
      <div style={styles.runnerSection}>
        {playlistState && (
          <RunnerBar state={playlistState} label="Playlist" />
        )}
        {tagRunnerState && (
          <RunnerBar state={tagRunnerState} label="Tag Runner" />
        )}
      </div>
    </div>
  );
}
