import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.js';
import { fmtIdleTime } from '../lib/fmt.js';
import { ShieldCheck, ShieldOff, UserX, Clock, Plus, X } from 'lucide-react';

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' },
  topRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' },
  card: {
    background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
    padding: 'var(--space-lg)', border: '1px solid var(--border-color)',
  },
  cardTitle: { fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-md)' },
  toggle: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: 'var(--space-sm) 0',
  },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--text-primary)', fontSize: '0.9rem' },
  toggleDesc: { color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '2px' },
  switchTrack: (on) => ({
    width: 44, height: 24, borderRadius: 12, cursor: 'pointer', border: 'none',
    background: on ? '#FF7A00' : 'var(--border-color)', position: 'relative',
    transition: 'background 0.2s',
  }),
  switchThumb: (on) => ({
    width: 18, height: 18, borderRadius: '50%', background: '#fff',
    position: 'absolute', top: 3, left: on ? 23 : 3, transition: 'left 0.2s',
  }),
  infoRow: {
    display: 'flex', justifyContent: 'space-between', padding: 'var(--space-xs) 0',
    fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)',
  },
  infoLabel: { fontWeight: 500, color: 'var(--text-primary)' },
  whitelistInput: {
    display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)',
  },
  input: {
    flex: 1, padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: '0.9rem',
  },
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)',
    padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-sm)',
    border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
    background: '#FF7A00', color: '#fff',
  },
  btnDanger: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', padding: '2px',
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)',
    padding: '4px 10px', borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-raised, rgba(255,122,0,0.1))', fontSize: '0.85rem',
    color: 'var(--text-primary)', border: '1px solid var(--border-color)',
  },
  chipList: { display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: 'var(--space-sm)', fontSize: '0.8rem',
    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border-color)', fontWeight: 500,
  },
  td: { padding: 'var(--space-sm)', borderBottom: '1px solid var(--border-color)', fontSize: '0.9rem', color: 'var(--text-primary)' },
  badge: (color) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
    fontSize: '0.75rem', fontWeight: 600, background: color, color: '#fff',
  }),
  empty: { color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: 'var(--space-md) 0' },
};

export default function IdleKick() {
  const { apiFetch, apiCall } = useApi();
  const [idleTimes, setIdleTimes] = useState({});
  const [warned, setWarned] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [registrationStatus, setRegistrationStatus] = useState({});
  const [unregKickEnabled, setUnregKickEnabled] = useState(true);
  const [newNick, setNewNick] = useState('');
  const [players, setPlayers] = useState([]);

  const fetchStatus = useCallback(async () => {
    try {
      const [idle, status] = await Promise.all([
        apiFetch('GET', '/api/admin/idle-kick/status'),
        apiFetch('GET', '/api/status'),
      ]);
      setIdleTimes(idle.idleTimes || {});
      setWarned(idle.warned || []);
      setWhitelist(idle.whitelist || []);
      setRegistrationStatus(idle.registrationStatus || {});
      setUnregKickEnabled(idle.unregKickEnabled ?? true);
      setPlayers(status.online_players || []);
    } catch { /* best-effort */ }
  }, [apiFetch]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const iv = setInterval(fetchStatus, 10_000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const handleUnregToggle = useCallback(async () => {
    const next = !unregKickEnabled;
    try {
      await apiCall('POST', '/api/admin/idle-kick/unreg-kick', { enabled: next },
        next ? 'Unregistered kick enabled' : 'Unregistered kick disabled');
      setUnregKickEnabled(next);
    } catch { /* handled */ }
  }, [unregKickEnabled, apiCall]);

  const handleAddWhitelist = useCallback(async (e) => {
    e.preventDefault();
    if (!newNick.trim()) return;
    try {
      await apiCall('POST', '/api/admin/idle-kick/whitelist', { nick: newNick.trim() },
        `Added ${newNick.trim()} to whitelist`);
      setWhitelist((prev) => [...prev, newNick.trim()]);
      setNewNick('');
    } catch { /* handled */ }
  }, [newNick, apiCall]);

  const handleRemoveWhitelist = useCallback(async (nick) => {
    try {
      await apiCall('DELETE', '/api/admin/idle-kick/whitelist', { nick },
        `Removed ${nick} from whitelist`);
      setWhitelist((prev) => prev.filter((n) => n.toLowerCase() !== nick.toLowerCase()));
    } catch { /* handled */ }
  }, [apiCall]);

  const warnedSet = new Set(warned);
  const playerByActor = new Map();
  for (const p of players) playerByActor.set(p.actor, p);

  const sortedActors = Object.entries(idleTimes)
    .sort(([, a], [, b]) => b - a)
    .map(([actor]) => Number(actor));

  return (
    <div style={styles.page}>
      {/* Settings + Info */}
      <div style={styles.topRow}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Settings</div>

          <div style={styles.toggle}>
            <div>
              <div style={styles.toggleLabel}>
                {unregKickEnabled ? <ShieldCheck size={16} /> : <ShieldOff size={16} />}
                Aggressive unregistered kick
              </div>
              <div style={styles.toggleDesc}>
                Unregistered players get 30s idle + 10s grace (vs 5min + 1min for registered)
              </div>
            </div>
            <button style={styles.switchTrack(unregKickEnabled)} onClick={handleUnregToggle}>
              <div style={styles.switchThumb(unregKickEnabled)} />
            </button>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Timers</div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Registered idle timeout</span>
            <span>5 minutes</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Registered grace period</span>
            <span>1 minute</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Unregistered idle timeout</span>
            <span>30 seconds</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Unregistered grace period</span>
            <span>10 seconds</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Lobby full threshold</span>
            <span>8 players</span>
          </div>
          <div style={{ ...styles.infoRow, borderBottom: 'none' }}>
            <span style={styles.infoLabel}>Sweep interval</span>
            <span>30 seconds</span>
          </div>
        </div>
      </div>

      {/* Whitelist */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Whitelist</div>
        <form onSubmit={handleAddWhitelist} style={styles.whitelistInput}>
          <input
            style={styles.input}
            placeholder="Player nickname"
            value={newNick}
            onChange={(e) => setNewNick(e.target.value)}
          />
          <button type="submit" style={styles.btn}><Plus size={14} /> Add</button>
        </form>
        {whitelist.length === 0 ? (
          <div style={styles.empty}>No whitelisted players</div>
        ) : (
          <div style={styles.chipList}>
            {whitelist.map((nick) => (
              <span key={nick} style={styles.chip}>
                {nick}
                <button style={styles.btnDanger} onClick={() => handleRemoveWhitelist(nick)} title="Remove">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Active idle timers */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          <Clock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Active Idle Timers
        </div>
        {sortedActors.length === 0 ? (
          <div style={styles.empty}>No players being tracked</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Player</th>
                <th style={styles.th}>Idle Time</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Registered</th>
              </tr>
            </thead>
            <tbody>
              {sortedActors.map((actor) => {
                const player = playerByActor.get(actor);
                const nick = player?.nick || `Actor ${actor}`;
                const isWarned = warnedSet.has(actor);
                const isRegistered = registrationStatus[actor];
                const isWhitelisted = whitelist.some((w) => w.toLowerCase() === nick.toLowerCase());
                return (
                  <tr key={actor}>
                    <td style={styles.td}>{nick}</td>
                    <td style={styles.td}>{fmtIdleTime(idleTimes[actor])}</td>
                    <td style={styles.td}>
                      {isWhitelisted
                        ? <span style={styles.badge('#4CAF50')}>Immune</span>
                        : isWarned
                          ? <span style={styles.badge('#f44336')}>Warned</span>
                          : <span style={styles.badge('#666')}>Active</span>}
                    </td>
                    <td style={styles.td}>
                      {isRegistered
                        ? <span style={styles.badge('#2196F3')}>Yes</span>
                        : <span style={styles.badge('#9E9E9E')}>No</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
