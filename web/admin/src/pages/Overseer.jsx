import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import RunnerBar from '../components/feedback/RunnerBar.jsx';
import { Play, Square, SkipForward, Clock, Plus, Trash2, ArrowUp, ArrowDown, ListMusic, Tag } from 'lucide-react';

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' },
  panel: { background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', border: '1px solid var(--border-color)' },
  panelTitle: { fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm) 0', borderBottom: '1px solid var(--border-color)' },
  label: { fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 },
  value: { fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 },
  btnRow: { display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' },
  btn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 },
  btnPrimary: { background: '#FF7A00', color: '#fff', border: 'none' },
  btnDanger: { background: 'var(--bg-surface)', color: '#ef4444', border: '1px solid #ef4444' },
  select: { padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem', flex: 1 },
  input: { padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem', width: '80px' },
  empty: { color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: 'var(--space-md) 0' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 },
  badgeGreen: { background: '#22c55e22', color: '#22c55e' },
  badgeYellow: { background: '#eab30822', color: '#eab308' },
  badgeGray: { background: '#64748b22', color: '#64748b' },
  trackItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' },
  trackName: { color: 'var(--text-primary)', fontWeight: 500 },
  trackEnv: { color: 'var(--text-muted)', fontSize: '0.8rem' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' },
  historyTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
};

function fmtRemaining(nextChangeAt) {
  if (!nextChangeAt) return '--';
  const ms = new Date(nextChangeAt).getTime() - Date.now();
  if (ms <= 0) return '0:00';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function modeBadge(state) {
  if (!state?.running) return <span style={{ ...styles.badge, ...styles.badgeGray }}>Idle</span>;
  if (state.mode === 'playlist') return <span style={{ ...styles.badge, ...styles.badgeGreen }}>Playlist</span>;
  if (state.mode === 'tag') return <span style={{ ...styles.badge, ...styles.badgeYellow }}>Tags</span>;
  return null;
}

export default function Overseer() {
  const { apiFetch, apiCall } = useApi();

  const [os, setOs] = useState(null);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [tags, setTags] = useState([]);

  // Start form
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const [intervalMin, setIntervalMin] = useState(15);
  const [nextPlaylistId, setNextPlaylistId] = useState('');
  const [nextIntervalMin, setNextIntervalMin] = useState(15);
  const [selectedTags, setSelectedTags] = useState([]);
  const [tagIntervalMin, setTagIntervalMin] = useState(10);

  const fetchAll = useCallback(async () => {
    try {
      const [osData, queueData, historyData, playlistData, tagData] = await Promise.all([
        apiFetch('GET', '/api/admin/overseer/state'),
        apiFetch('GET', '/api/admin/queue'),
        apiFetch('GET', '/api/admin/tracks/history?limit=20'),
        apiFetch('GET', '/api/admin/playlists'),
        apiFetch('GET', '/api/admin/tags'),
      ]);
      setOs(osData);
      setQueue(queueData);
      setHistory(historyData);
      setPlaylists(playlistData);
      setTags(tagData);
      if (!selectedPlaylist && playlistData.length > 0) setSelectedPlaylist(String(playlistData[0].id));
    } catch {}
  }, [apiFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Live updates
  useWsEvent('overseer_state', setOs);

  // Countdown timer
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Actions
  const startPlaylist = () => {
    if (!selectedPlaylist) return;
    apiCall('POST', '/api/admin/overseer/start-playlist', {
      playlist_id: Number(selectedPlaylist),
      interval_ms: intervalMin * 60 * 1000,
    }, 'Playlist started').then(fetchAll);
  };

  const startTags = () => {
    if (selectedTags.length === 0) return;
    apiCall('POST', '/api/admin/overseer/start-tags', {
      tag_names: selectedTags,
      interval_ms: tagIntervalMin * 60 * 1000,
    }, 'Tag mode started').then(fetchAll);
  };

  const queueNextPlaylist = () => {
    if (!nextPlaylistId) return;
    apiCall('POST', '/api/admin/overseer/next-playlist', {
      playlist_id: Number(nextPlaylistId),
      interval_ms: nextIntervalMin * 60 * 1000,
    }, 'Next playlist queued').then(fetchAll);
  };

  const clearNextPlaylist = () => {
    apiCall('DELETE', '/api/admin/overseer/next-playlist', {}, 'Next playlist cleared').then(fetchAll);
  };

  const stop = () => apiCall('POST', '/api/admin/overseer/stop', {}, 'Stopped').then(fetchAll);
  const skip = () => apiCall('POST', '/api/admin/overseer/skip', {}, 'Skipped').then(fetchAll);
  const extend = () => apiCall('POST', '/api/admin/overseer/extend', { ms: 300000 }, 'Extended +5m').then(fetchAll);

  const removeQueue = (id) => apiCall('DELETE', `/api/admin/queue/${id}`, {}, 'Removed').then(fetchAll);
  const moveQueue = (id, dir) => apiCall('POST', `/api/admin/queue/${id}/move`, { direction: dir }).then(fetchAll);
  const clearQueueAll = () => apiCall('DELETE', '/api/admin/queue', {}, 'Queue cleared').then(fetchAll);

  const toggleTag = (name) => {
    setSelectedTags(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);
  };

  return (
    <div style={styles.page}>
      {/* Status + Runner bar */}
      {os && <RunnerBar state={os} label={os.mode === 'tag' ? 'Tag Mode' : 'Track Overseer'} />}

      {/* Status card */}
      <div style={styles.panel}>
        <div style={styles.panelTitle}>Status</div>
        <div style={styles.row}>
          <span style={styles.label}>Mode</span>
          {modeBadge(os)}
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Current Track</span>
          <span style={styles.value}>
            {os?.current_track ? `${os.current_track.env} / ${os.current_track.track}` : '--'}
          </span>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Time Remaining</span>
          <span style={styles.value}>{fmtRemaining(os?.next_change_at)}</span>
        </div>
        {os?.mode === 'playlist' && (
          <div style={styles.row}>
            <span style={styles.label}>Playlist</span>
            <span style={styles.value}>{os.playlist_name} ({os.current_index + 1}/{os.track_count})</span>
          </div>
        )}
        {os?.mode === 'tag' && (
          <div style={styles.row}>
            <span style={styles.label}>Tags</span>
            <span style={styles.value}>{os.tag_names?.join(', ')}</span>
          </div>
        )}
        {os?.next_playlist && (
          <div style={styles.row}>
            <span style={styles.label}>Up Next</span>
            <span style={styles.value}>{os.next_playlist.playlistName} ({os.next_playlist.trackCount} tracks)</span>
          </div>
        )}

        <div style={{ ...styles.btnRow, marginTop: 'var(--space-md)' }}>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={skip} disabled={!os?.running}>
            <SkipForward size={14} /> Skip
          </button>
          <button style={styles.btn} onClick={extend} disabled={!os?.running}>
            <Clock size={14} /> +5 min
          </button>
          <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={stop} disabled={!os?.running}>
            <Square size={14} /> Stop
          </button>
        </div>
      </div>

      <div style={styles.grid2}>
        {/* Start Playlist */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}><ListMusic size={16} /> Start Playlist</div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
            <select style={styles.select} value={selectedPlaylist} onChange={e => setSelectedPlaylist(e.target.value)}>
              {playlists.map(p => <option key={p.id} value={p.id}>{p.name} ({p.track_count} tracks)</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <span style={styles.label}>Interval:</span>
            <input type="number" style={styles.input} value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))} min={1} /> min
          </div>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={startPlaylist}>
            <Play size={14} /> Start Playlist
          </button>

          {/* Queue Next Playlist */}
          {os?.running && os?.mode === 'playlist' && (
            <div style={{ marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-sm)' }}>Queue Next Playlist</div>
              {os.next_playlist ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    Up next: <strong>{os.next_playlist.playlistName}</strong> ({os.next_playlist.trackCount} tracks)
                  </span>
                  <button style={{ ...styles.btn, ...styles.btnDanger, marginLeft: 'auto' }} onClick={clearNextPlaylist}>
                    <Trash2 size={14} /> Clear
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                    <select style={styles.select} value={nextPlaylistId} onChange={e => setNextPlaylistId(e.target.value)}>
                      <option value="">Select playlist...</option>
                      {playlists.filter(p => p.id !== os.playlist_id).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.track_count} tracks)</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-sm)' }}>
                    <span style={styles.label}>Interval:</span>
                    <input type="number" style={styles.input} value={nextIntervalMin} onChange={e => setNextIntervalMin(Number(e.target.value))} min={1} /> min
                  </div>
                  <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={queueNextPlaylist} disabled={!nextPlaylistId}>
                    <Plus size={14} /> Queue Next
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Start Tags */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}><Tag size={16} /> Start Tag Mode</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--space-sm)' }}>
            {tags.map(t => (
              <button key={t.id} onClick={() => toggleTag(t.name)}
                style={{ ...styles.btn, ...(selectedTags.includes(t.name) ? styles.btnPrimary : {}) }}>
                {t.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <span style={styles.label}>Interval:</span>
            <input type="number" style={styles.input} value={tagIntervalMin} onChange={e => setTagIntervalMin(Number(e.target.value))} min={1} /> min
          </div>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={startTags} disabled={selectedTags.length === 0}>
            <Play size={14} /> Start Tags
          </button>
        </div>
      </div>

      <div style={styles.grid2}>
        {/* Queue */}
        <div style={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
            <span style={styles.panelTitle}>Queue ({queue.length})</span>
            {queue.length > 0 && (
              <button style={{ ...styles.iconBtn, color: '#ef4444' }} onClick={clearQueueAll} title="Clear all">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {queue.length === 0 ? (
            <div style={styles.empty}>Queue is empty — tracks play from rotation</div>
          ) : (
            queue.map((q, i) => (
              <div key={q.id} style={styles.trackItem}>
                <div>
                  <span style={styles.trackName}>{q.track}</span>
                  <span style={styles.trackEnv}> ({q.env})</span>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button style={styles.iconBtn} onClick={() => moveQueue(q.id, 'up')} disabled={i === 0}><ArrowUp size={14} /></button>
                  <button style={styles.iconBtn} onClick={() => moveQueue(q.id, 'down')} disabled={i === queue.length - 1}><ArrowDown size={14} /></button>
                  <button style={{ ...styles.iconBtn, color: '#ef4444' }} onClick={() => removeQueue(q.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Upcoming */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Upcoming Tracks</div>
          {os?.running && os?.mode === 'playlist' && os.tracks?.length > 0 ? (
            (() => {
              const upcoming = [];
              const count = Math.min(5, os.tracks.length - 1);
              for (let i = 1; i <= count; i++) {
                const idx = (os.current_index + i) % os.tracks.length;
                upcoming.push(os.tracks[idx]);
              }
              return upcoming.map((t, i) => (
                <div key={i} style={styles.trackItem}>
                  <div>
                    <span style={styles.trackName}>{t.track}</span>
                    <span style={styles.trackEnv}> ({t.env})</span>
                  </div>
                  <span style={{ ...styles.badge, ...styles.badgeGray }}>#{i + 1}</span>
                </div>
              ));
            })()
          ) : (
            <div style={styles.empty}>
              {os?.mode === 'tag' ? 'Tag mode picks tracks randomly' : 'Start a playlist to see upcoming tracks'}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div style={styles.panel}>
        <div style={styles.panelTitle}>Recent Track History</div>
        {history.length === 0 ? (
          <div style={styles.empty}>No track history yet</div>
        ) : (
          <table style={styles.historyTable}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>Track</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>Environment</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>Source</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>Skips</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>Extends</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>Started</th>
              </tr>
            </thead>
            <tbody>
              {history.map(h => (
                <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '6px 4px', color: 'var(--text-primary)', fontWeight: 500 }}>{h.track}</td>
                  <td style={{ padding: '6px 4px', color: 'var(--text-muted)' }}>{h.env}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <span style={{ ...styles.badge, ...(h.source === 'queue' ? styles.badgeYellow : styles.badgeGray) }}>{h.source}</span>
                  </td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', color: h.skip_count > 0 ? '#ef4444' : 'var(--text-muted)' }}>{h.skip_count}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', color: h.extend_count > 0 ? '#22c55e' : 'var(--text-muted)' }}>{h.extend_count}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {new Date(h.started_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
