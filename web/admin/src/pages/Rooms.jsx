import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.js';
import { DoorOpen, Plus, Trash2, Bot, ArrowRight } from 'lucide-react';

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 'var(--space-md)' },
  card: {
    background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
    padding: 'var(--space-lg)', border: '1px solid var(--border-color)',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' },
  cardTitle: { fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' },
  cardMeta: { fontSize: '0.8rem', color: 'var(--text-muted)' },
  row: {
    display: 'flex', justifyContent: 'space-between', padding: 'var(--space-xs) 0',
    fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)',
  },
  label: { fontWeight: 500, color: 'var(--text-primary)' },
  botList: { display: 'flex', flexDirection: 'column', gap: '4px', marginTop: 'var(--space-sm)' },
  botItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '4px 8px', background: 'var(--bg-page)', borderRadius: 'var(--radius-sm)',
    fontSize: '0.85rem', color: 'var(--text-primary)',
  },
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-xs)',
    padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-sm)',
    border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
    background: '#FF7A00', color: '#fff',
  },
  btnSmall: {
    padding: '4px 8px', fontSize: '0.8rem', background: 'var(--bg-page)',
    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
    cursor: 'pointer', color: 'var(--text-primary)',
  },
  btnDanger: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#ef4444', padding: '4px',
  },
  formRow: { display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' },
  input: {
    padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: '0.9rem', flex: 1, minWidth: 120,
  },
  select: {
    padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
    color: 'var(--text-primary)', fontSize: '0.9rem',
  },
  section: { marginTop: 'var(--space-md)' },
  sectionTitle: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' },
  overseerStatus: (running) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600,
    background: running ? '#22c55e22' : '#64748b22',
    color: running ? '#22c55e' : '#64748b',
  }),
};

export default function Rooms() {
  const { apiFetch, apiCall } = useApi();
  const [rooms, setRooms] = useState([]);
  const [bots, setBots] = useState([]);
  const [newRoom, setNewRoom] = useState({ id: '', label: '', scoring_mode: 'room' });
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    const [roomData, botData] = await Promise.all([
      apiFetch('GET', '/api/admin/rooms'),
      apiFetch('GET', '/api/admin/bots'),
    ]);
    setRooms(roomData);
    setBots(botData);
  }, [apiFetch]);

  useEffect(() => { refresh(); }, [refresh]);

  const createRoom = async () => {
    if (!newRoom.id.trim()) return;
    await apiCall('POST', '/api/admin/rooms', newRoom, `Room "${newRoom.id}" created`);
    setNewRoom({ id: '', label: '', scoring_mode: 'room' });
    setShowCreate(false);
    refresh();
  };

  const deleteRoom = async (id) => {
    if (!confirm(`Delete room "${id}"? Bots must be reassigned first.`)) return;
    await apiCall('DELETE', `/api/admin/rooms/${id}`, null, `Room "${id}" deleted`);
    refresh();
  };

  const assignBot = async (botId, roomId) => {
    await apiCall('POST', `/api/admin/rooms/${roomId}/assign-bot`, { bot_id: botId }, `Bot "${botId}" assigned to room "${roomId}"`);
    refresh();
  };

  const updateScoringMode = async (roomId, mode) => {
    await apiCall('PUT', `/api/admin/rooms/${roomId}`, { scoring_mode: mode });
    refresh();
  };

  // Bots not assigned to any room shown in the list
  const unassignedBots = bots.filter(b => {
    const room = rooms.find(r => r.bot_ids?.includes(b.id));
    return !room;
  });

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}><DoorOpen size={20} style={{ verticalAlign: 'text-bottom' }} /> Rooms</h1>
        <button style={styles.btn} onClick={() => setShowCreate(!showCreate)}>
          <Plus size={16} /> New Room
        </button>
      </div>

      {showCreate && (
        <div style={styles.card}>
          <div style={{ ...styles.cardTitle, marginBottom: 'var(--space-sm)' }}>Create Room</div>
          <div style={styles.formRow}>
            <input style={styles.input} placeholder="Room ID (slug)" value={newRoom.id}
              onChange={e => setNewRoom({ ...newRoom, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
            <input style={styles.input} placeholder="Label" value={newRoom.label}
              onChange={e => setNewRoom({ ...newRoom, label: e.target.value })} />
            <select style={styles.select} value={newRoom.scoring_mode}
              onChange={e => setNewRoom({ ...newRoom, scoring_mode: e.target.value })}>
              <option value="room">Own Competition</option>
              <option value="global">Global Competition</option>
            </select>
            <button style={styles.btn} onClick={createRoom}>Create</button>
          </div>
        </div>
      )}

      <div style={styles.grid}>
        {rooms.map(room => (
          <div key={room.room_id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.cardTitle}>{room.label || room.room_id}</div>
                <div style={styles.cardMeta}>ID: {room.room_id}</div>
              </div>
              {room.room_id !== 'default' && (
                <button style={styles.btnDanger} title="Delete room" onClick={() => deleteRoom(room.room_id)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            <div style={styles.row}>
              <span style={styles.label}>Scoring</span>
              <select style={{ ...styles.select, padding: '2px 8px', fontSize: '0.8rem' }}
                value={room.scoring_mode} onChange={e => updateScoringMode(room.room_id, e.target.value)}>
                <option value="room">Own Competition</option>
                <option value="global">Global Competition</option>
              </select>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>Players Online</span>
              <span>{room.online_players?.length || 0}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>Current Track</span>
              <span>{room.current_track?.track || 'None'}</span>
            </div>

            <div style={styles.row}>
              <span style={styles.label}>Overseer</span>
              <span style={styles.overseerStatus(room.overseer?.running)}>
                {room.overseer?.running ? `${room.overseer.mode} (${room.overseer.playlist_name || room.overseer.tag_names?.join(', ') || ''})` : 'Idle'}
              </span>
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}><Bot size={14} /> Bots ({room.bot_ids?.length || 0})</div>
              <div style={styles.botList}>
                {(room.bot_ids || []).map(bid => {
                  const bot = bots.find(b => b.id === bid);
                  return (
                    <div key={bid} style={styles.botItem}>
                      <span>{bot?.label || bid} {bot?.connected && <span style={{ color: '#22c55e' }}>(online)</span>}</span>
                    </div>
                  );
                })}
                {(!room.bot_ids || room.bot_ids.length === 0) && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No bots assigned</div>
                )}
              </div>
            </div>

            {/* Assign bot dropdown */}
            {bots.length > 0 && (
              <div style={{ marginTop: 'var(--space-sm)', display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
                <select style={{ ...styles.select, flex: 1, fontSize: '0.8rem' }} id={`assign-${room.room_id}`}>
                  <option value="">Assign bot...</option>
                  {bots.filter(b => !room.bot_ids?.includes(b.id)).map(b => (
                    <option key={b.id} value={b.id}>{b.label || b.id}</option>
                  ))}
                </select>
                <button style={styles.btnSmall} onClick={() => {
                  const sel = document.getElementById(`assign-${room.room_id}`);
                  if (sel.value) assignBot(sel.value, room.room_id);
                }}>
                  <ArrowRight size={14} /> Assign
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
