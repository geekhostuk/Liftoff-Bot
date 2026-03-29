import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';
import {
  Trophy, Plus, Archive, RotateCcw, ChevronDown, ChevronRight,
  Pencil, Trash2, RefreshCw, BarChart3, ListMusic, Check, X,
  ChevronUp, Play,
} from 'lucide-react';

const styles = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', padding: 'var(--space-lg)' },
  panel: { background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: 'var(--space-lg)', border: '1px solid var(--border-color)' },
  panelActive: { borderColor: '#FF7A00' },
  panelTitle: { fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm) 0', borderBottom: '1px solid var(--border-color)' },
  label: { fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 },
  value: { fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 },
  btnRow: { display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)', flexWrap: 'wrap' },
  formRow: { display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 'var(--space-sm)' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  formLabel: { fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem' },
  thRight: { textAlign: 'right', padding: '8px 10px', borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem' },
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' },
  tdNum: { padding: '8px 10px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  tdActions: { padding: '8px 10px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 4, justifyContent: 'flex-end' },
  empty: { color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: 'var(--space-md) 0' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 600 },
  badgeActive: { background: 'rgba(34,197,94,0.15)', color: '#22c55e' },
  badgeArchived: { background: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
  badgeScheduled: { background: 'rgba(0,209,255,0.15)', color: '#00D1FF' },
  badgeFinalised: { background: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
  compCard: { display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'border-color 0.15s', marginBottom: 'var(--space-sm)' },
  compCardSelected: { borderColor: '#FF7A00', background: 'rgba(255,122,0,0.05)' },
  compInfo: { flex: 1 },
  compName: { fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' },
  compMeta: { fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 },
  compActions: { display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' },
  iconBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 'var(--radius-sm)', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' },
  subPanel: { background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-md)', border: '1px solid var(--border-color)', marginTop: 'var(--space-sm)' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' },
  playlistRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '6px 0', borderBottom: '1px solid var(--border-color)' },
  playlistName: { flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' },
  playlistPos: { fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, minWidth: 24 },
  playlistInterval: { fontSize: '0.75rem', color: 'var(--text-muted)' },
};

function fmtDate(iso) {
  if (!iso) return '--';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toInputDate(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

function StatusBadge({ status }) {
  const map = { active: styles.badgeActive, archived: styles.badgeArchived, scheduled: styles.badgeScheduled, finalised: styles.badgeFinalised };
  return <span style={{ ...styles.badge, ...(map[status] || {}) }}>{status}</span>;
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function Competitions() {
  const { apiFetch, apiCall } = useApi();

  // Competition list
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompId, setSelectedCompId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createStartDate, setCreateStartDate] = useState('');
  const [createWeekCount, setCreateWeekCount] = useState(4);
  const [loading, setLoading] = useState(true);

  // Weeks
  const [weeks, setWeeks] = useState([]);
  const [editingWeekId, setEditingWeekId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [expandedWeekId, setExpandedWeekId] = useState(null);
  const [expandedView, setExpandedView] = useState(null); // 'playlists' | 'standings'

  // Add weeks form
  const [showAddWeeks, setShowAddWeeks] = useState(false);
  const [addWeeksCount, setAddWeeksCount] = useState(4);
  const [addWeeksStart, setAddWeeksStart] = useState('');

  // Week detail data
  const [weekPlaylists, setWeekPlaylists] = useState([]);
  const [weekStandings, setWeekStandings] = useState([]);
  const [allPlaylists, setAllPlaylists] = useState([]);
  const [addPlaylistId, setAddPlaylistId] = useState('');
  const [addIntervalMs, setAddIntervalMs] = useState(900000);

  // Season standings
  const [seasonStandings, setSeasonStandings] = useState([]);
  const [showSeason, setShowSeason] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchCompetitions = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/competitions');
      setCompetitions(data);
    } catch { /* toast handled */ }
    setLoading(false);
  }, [apiFetch]);

  const fetchWeeks = useCallback(async (compId) => {
    if (!compId) return;
    try {
      const data = await apiFetch('GET', `/api/admin/competition/${compId}/weeks`);
      setWeeks(data);
    } catch { setWeeks([]); }
  }, [apiFetch]);

  const fetchWeekPlaylists = useCallback(async (weekId) => {
    try {
      const data = await apiFetch('GET', `/api/admin/competition/week/${weekId}/playlists`);
      setWeekPlaylists(data);
    } catch { setWeekPlaylists([]); }
  }, [apiFetch]);

  const fetchWeekStandings = useCallback(async (weekId) => {
    try {
      const data = await apiFetch('GET', `/api/admin/competition/week/${weekId}/standings`);
      setWeekStandings(data);
    } catch { setWeekStandings([]); }
  }, [apiFetch]);

  const fetchAllPlaylists = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/playlists');
      setAllPlaylists(data);
    } catch { setAllPlaylists([]); }
  }, [apiFetch]);

  const fetchSeasonStandings = useCallback(async (compId) => {
    try {
      const data = await apiFetch('GET', `/api/admin/competition/${compId}/season-standings`);
      setSeasonStandings(data);
    } catch { setSeasonStandings([]); }
  }, [apiFetch]);

  useEffect(() => { fetchCompetitions(); }, [fetchCompetitions]);

  useEffect(() => {
    if (selectedCompId) {
      fetchWeeks(selectedCompId);
      setExpandedWeekId(null);
      setExpandedView(null);
      setShowSeason(false);
    }
  }, [selectedCompId, fetchWeeks]);

  // ── WebSocket events ──────────────────────────────────────────────────────

  const handleWsWeekEvent = useCallback(() => {
    if (selectedCompId) fetchWeeks(selectedCompId);
  }, [selectedCompId, fetchWeeks]);

  const handleStandingsUpdate = useCallback((evt) => {
    if (expandedView === 'standings' && expandedWeekId && evt.week_id === expandedWeekId) {
      fetchWeekStandings(expandedWeekId);
    }
  }, [expandedView, expandedWeekId, fetchWeekStandings]);

  useWsEvent('competition_week_started', handleWsWeekEvent);
  useWsEvent('competition_week_finalised', handleWsWeekEvent);
  useWsEvent('competition_standings_update', handleStandingsUpdate);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createName.trim()) return;
    const comp = await apiCall('POST', '/api/admin/competition', { name: createName.trim() }, 'Competition created');
    if (!comp) return;
    if (createStartDate && createWeekCount > 0) {
      await apiCall('POST', `/api/admin/competition/${comp.id}/weeks`, { count: createWeekCount, start_date: createStartDate }, `${createWeekCount} weeks generated`);
    }
    setCreateName('');
    setCreateStartDate('');
    setCreateWeekCount(4);
    setShowCreateForm(false);
    await fetchCompetitions();
    setSelectedCompId(comp.id);
  };

  const handleArchive = async (id) => {
    await apiCall('POST', `/api/admin/competition/${id}/archive`, null, 'Competition archived');
    fetchCompetitions();
    if (selectedCompId === id) setSelectedCompId(null);
  };

  const handleActivate = async (id) => {
    await apiCall('POST', `/api/admin/competition/${id}/activate`, null, 'Competition activated');
    fetchCompetitions();
  };

  const handleDeleteComp = async (id) => {
    await apiCall('DELETE', `/api/admin/competition/${id}`, null, 'Competition deleted');
    fetchCompetitions();
    if (selectedCompId === id) setSelectedCompId(null);
  };

  const handleSelectComp = (id) => {
    setSelectedCompId(selectedCompId === id ? null : id);
  };

  // Week editing
  const startEditWeek = (w) => {
    setEditingWeekId(w.id);
    setEditForm({ week_number: w.week_number, starts_at: toInputDate(w.starts_at), ends_at: toInputDate(w.ends_at) });
  };

  const saveEditWeek = async () => {
    const body = {};
    if (editForm.week_number !== undefined) body.week_number = editForm.week_number;
    if (editForm.starts_at) body.starts_at = new Date(editForm.starts_at + 'T00:00:00Z').toISOString();
    if (editForm.ends_at) body.ends_at = new Date(editForm.ends_at + 'T23:59:59Z').toISOString();
    await apiCall('PUT', `/api/admin/competition/week/${editingWeekId}`, body, 'Week updated');
    setEditingWeekId(null);
    fetchWeeks(selectedCompId);
  };

  const handleDeleteWeek = async (weekId) => {
    await apiCall('DELETE', `/api/admin/competition/week/${weekId}`, null, 'Week deleted');
    if (expandedWeekId === weekId) { setExpandedWeekId(null); setExpandedView(null); }
    fetchWeeks(selectedCompId);
  };

  const handleRecalculate = async (weekId) => {
    await apiCall('POST', `/api/admin/competition/recalculate/${weekId}`, null, 'Week recalculated');
    if (expandedView === 'standings' && expandedWeekId === weekId) fetchWeekStandings(weekId);
  };

  const handleAddWeeks = async () => {
    if (!addWeeksStart) return;
    await apiCall('POST', `/api/admin/competition/${selectedCompId}/weeks`, { count: addWeeksCount, start_date: addWeeksStart }, `${addWeeksCount} weeks added`);
    setShowAddWeeks(false);
    fetchWeeks(selectedCompId);
  };

  const toggleWeekDetail = (weekId, view) => {
    if (expandedWeekId === weekId && expandedView === view) {
      setExpandedWeekId(null);
      setExpandedView(null);
    } else {
      setExpandedWeekId(weekId);
      setExpandedView(view);
      if (view === 'playlists') { fetchWeekPlaylists(weekId); fetchAllPlaylists(); }
      if (view === 'standings') fetchWeekStandings(weekId);
    }
  };

  // Playlist management
  const handleAddPlaylist = async () => {
    if (!addPlaylistId) return;
    await apiCall('POST', `/api/admin/competition/week/${expandedWeekId}/playlists`, { playlist_id: Number(addPlaylistId), interval_ms: Number(addIntervalMs) }, 'Playlist added');
    setAddPlaylistId('');
    fetchWeekPlaylists(expandedWeekId);
  };

  const handleRemovePlaylist = async (wpId) => {
    await apiCall('DELETE', `/api/admin/competition/week/${expandedWeekId}/playlists/${wpId}`, null, 'Playlist removed');
    fetchWeekPlaylists(expandedWeekId);
  };

  const handleMovePlaylist = async (wpId, direction) => {
    await apiCall('POST', `/api/admin/competition/week/${expandedWeekId}/playlists/${wpId}/move`, { direction }, 'Reordered');
    fetchWeekPlaylists(expandedWeekId);
  };

  const handleChangeWeekStatus = async (weekId, status) => {
    await apiCall('PUT', `/api/admin/competition/week/${weekId}`, { status }, `Week ${status}`);
    fetchWeeks(selectedCompId);
  };

  const toggleSeason = () => {
    if (!showSeason && selectedCompId) fetchSeasonStandings(selectedCompId);
    setShowSeason(!showSeason);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={styles.page}><p style={styles.empty}>Loading...</p></div>;

  const selectedComp = competitions.find(c => c.id === selectedCompId);

  return (
    <div style={styles.page}>

      {/* ── Competition List ──────────────────────────────────────────────── */}
      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <div style={styles.panelTitle}><Trophy size={18} /> Competitions</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus size={14} /> New Competition
          </button>
        </div>

        {showCreateForm && (
          <div style={{ ...styles.subPanel, marginBottom: 'var(--space-md)' }}>
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Name</label>
                <input className="form-input" style={{ width: 200 }} value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Season 1" />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Start Date</label>
                <input className="form-input" type="date" value={createStartDate} onChange={e => setCreateStartDate(e.target.value)} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Weeks</label>
                <input className="form-input" type="number" style={{ width: 70 }} min={1} max={52} value={createWeekCount} onChange={e => setCreateWeekCount(Number(e.target.value))} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!createName.trim()}>Create</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreateForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {competitions.length === 0 ? (
          <p style={styles.empty}>No competitions yet. Create one to get started.</p>
        ) : (
          competitions.map(comp => (
            <div
              key={comp.id}
              style={{ ...styles.compCard, ...(selectedCompId === comp.id ? styles.compCardSelected : {}) }}
              onClick={() => handleSelectComp(comp.id)}
            >
              {selectedCompId === comp.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <div style={styles.compInfo}>
                <div style={styles.compName}>{comp.name}</div>
                <div style={styles.compMeta}>
                  Created {fmtDate(comp.created_at)} &middot; ID: {comp.id}
                </div>
              </div>
              <StatusBadge status={comp.status} />
              <div style={styles.compActions} onClick={e => e.stopPropagation()}>
                {comp.status === 'active' && (
                  <ConfirmButton className="btn btn-outline btn-sm" confirmText="Archive?" onConfirm={() => handleArchive(comp.id)}>
                    <Archive size={14} /> Archive
                  </ConfirmButton>
                )}
                {comp.status === 'archived' && (
                  <>
                    <button className="btn btn-outline btn-sm" onClick={() => handleActivate(comp.id)}>
                      <RotateCcw size={14} /> Reactivate
                    </button>
                    {comp.id !== 0 && (
                      <ConfirmButton className="btn btn-danger btn-sm" confirmText="Delete forever?" onConfirm={() => handleDeleteComp(comp.id)}>
                        <Trash2 size={14} /> Delete
                      </ConfirmButton>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Selected Competition Detail ───────────────────────────────────── */}
      {selectedComp && (
        <div style={{ ...styles.panel, ...(selectedComp.status === 'active' ? styles.panelActive : {}) }}>
          <div style={styles.headerRow}>
            <div style={styles.panelTitle}>
              <Trophy size={18} /> {selectedComp.name} — Weeks
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button className="btn btn-outline btn-sm" onClick={toggleSeason}>
                <BarChart3 size={14} /> {showSeason ? 'Hide' : 'Show'} Season Standings
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddWeeks(!showAddWeeks)}>
                <Plus size={14} /> Add Weeks
              </button>
            </div>
          </div>

          {showAddWeeks && (
            <div style={{ ...styles.subPanel, marginBottom: 'var(--space-md)' }}>
              <div style={styles.formRow}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Start Date</label>
                  <input className="form-input" type="date" value={addWeeksStart} onChange={e => setAddWeeksStart(e.target.value)} />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Count</label>
                  <input className="form-input" type="number" style={{ width: 70 }} min={1} max={52} value={addWeeksCount} onChange={e => setAddWeeksCount(Number(e.target.value))} />
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleAddWeeks} disabled={!addWeeksStart}>Generate</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddWeeks(false)}>Cancel</button>
              </div>
            </div>
          )}

          {weeks.length === 0 ? (
            <p style={styles.empty}>No weeks yet. Add weeks to schedule this competition.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Week</th>
                  <th style={styles.th}>Start</th>
                  <th style={styles.th}>End</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Playlists</th>
                  <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map(w => (
                  <WeekRow
                    key={w.id}
                    w={w}
                    editing={editingWeekId === w.id}
                    editForm={editForm}
                    setEditForm={setEditForm}
                    onStartEdit={() => startEditWeek(w)}
                    onSaveEdit={saveEditWeek}
                    onCancelEdit={() => setEditingWeekId(null)}
                    onDelete={() => handleDeleteWeek(w.id)}
                    onRecalculate={() => handleRecalculate(w.id)}
                    onTogglePlaylists={() => toggleWeekDetail(w.id, 'playlists')}
                    onToggleStandings={() => toggleWeekDetail(w.id, 'standings')}
                    onChangeStatus={handleChangeWeekStatus}
                    expandedWeekId={expandedWeekId}
                    expandedView={expandedView}
                    weekPlaylists={weekPlaylists}
                    weekStandings={weekStandings}
                    allPlaylists={allPlaylists}
                    addPlaylistId={addPlaylistId}
                    setAddPlaylistId={setAddPlaylistId}
                    addIntervalMs={addIntervalMs}
                    setAddIntervalMs={setAddIntervalMs}
                    onAddPlaylist={handleAddPlaylist}
                    onRemovePlaylist={handleRemovePlaylist}
                    onMovePlaylist={handleMovePlaylist}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Season Standings ──────────────────────────────────────────────── */}
      {selectedComp && showSeason && (
        <div style={styles.panel}>
          <div style={styles.panelTitle}><BarChart3 size={18} /> Season Standings — {selectedComp.name}</div>
          <StandingsTable standings={seasonStandings} />
        </div>
      )}
    </div>
  );
}

// ── Week Row ────────────────────────────────────────────────────────────────

function WeekRow({
  w, editing, editForm, setEditForm, onStartEdit, onSaveEdit, onCancelEdit,
  onDelete, onRecalculate, onTogglePlaylists, onToggleStandings, onChangeStatus,
  expandedWeekId, expandedView,
  weekPlaylists, weekStandings, allPlaylists,
  addPlaylistId, setAddPlaylistId, addIntervalMs, setAddIntervalMs,
  onAddPlaylist, onRemovePlaylist, onMovePlaylist,
}) {
  const isExpanded = expandedWeekId === w.id;

  return (
    <>
      <tr style={isExpanded ? { background: 'rgba(255,122,0,0.03)' } : undefined}>
        {editing ? (
          <>
            <td style={styles.td}>
              <input className="form-input" type="number" style={{ width: 60 }} value={editForm.week_number} onChange={e => setEditForm({ ...editForm, week_number: Number(e.target.value) })} />
            </td>
            <td style={styles.td}>
              <input className="form-input" type="date" value={editForm.starts_at} onChange={e => setEditForm({ ...editForm, starts_at: e.target.value })} />
            </td>
            <td style={styles.td}>
              <input className="form-input" type="date" value={editForm.ends_at} onChange={e => setEditForm({ ...editForm, ends_at: e.target.value })} />
            </td>
            <td style={styles.td}><StatusBadge status={w.status} /></td>
            <td style={styles.td}>{w.playlist_count ?? 0}</td>
            <td style={styles.tdActions}>
              <button className="btn btn-primary btn-sm" onClick={onSaveEdit}><Check size={14} /></button>
              <button className="btn btn-ghost btn-sm" onClick={onCancelEdit}><X size={14} /></button>
            </td>
          </>
        ) : (
          <>
            <td style={{ ...styles.td, fontWeight: 600 }}>{w.week_number}</td>
            <td style={styles.td}>{fmtDate(w.starts_at)}</td>
            <td style={styles.td}>{fmtDate(w.ends_at)}</td>
            <td style={styles.td}><StatusBadge status={w.status} /></td>
            <td style={styles.td}>{w.playlist_count ?? 0}</td>
            <td style={styles.tdActions}>
              {w.status === 'scheduled' && (
                <button className="btn btn-ghost btn-sm" onClick={() => onChangeStatus(w.id, 'active')} title="Activate">
                  <Play size={14} />
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={onStartEdit} title="Edit dates">
                <Pencil size={14} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onTogglePlaylists} title="Manage playlists"
                style={isExpanded && expandedView === 'playlists' ? { color: '#FF7A00' } : undefined}>
                <ListMusic size={14} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onToggleStandings} title="View standings"
                style={isExpanded && expandedView === 'standings' ? { color: '#FF7A00' } : undefined}>
                <BarChart3 size={14} />
              </button>
              {(w.status === 'active' || w.status === 'finalised') && (
                <ConfirmButton className="btn btn-ghost btn-sm" confirmText="Recalc?" onConfirm={onRecalculate}>
                  <RefreshCw size={14} />
                </ConfirmButton>
              )}
              {w.status === 'scheduled' && (
                <ConfirmButton className="btn btn-danger btn-sm" confirmText="Delete?" onConfirm={onDelete}>
                  <Trash2 size={14} />
                </ConfirmButton>
              )}
            </td>
          </>
        )}
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr>
          <td colSpan={6} style={{ padding: 'var(--space-md)', background: 'rgba(255,122,0,0.03)', borderBottom: '1px solid var(--border-color)' }}>
            {expandedView === 'playlists' && (
              <PlaylistManager
                playlists={weekPlaylists}
                allPlaylists={allPlaylists}
                addPlaylistId={addPlaylistId}
                setAddPlaylistId={setAddPlaylistId}
                addIntervalMs={addIntervalMs}
                setAddIntervalMs={setAddIntervalMs}
                onAdd={onAddPlaylist}
                onRemove={onRemovePlaylist}
                onMove={onMovePlaylist}
              />
            )}
            {expandedView === 'standings' && (
              <StandingsTable standings={weekStandings} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Playlist Manager ────────────────────────────────────────────────────────

function PlaylistManager({ playlists, allPlaylists, addPlaylistId, setAddPlaylistId, addIntervalMs, setAddIntervalMs, onAdd, onRemove, onMove }) {
  return (
    <div>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-sm)' }}>
        <ListMusic size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Week Playlists
      </div>

      {playlists.length === 0 ? (
        <p style={styles.empty}>No playlists assigned to this week.</p>
      ) : (
        playlists.map(pl => (
          <div key={pl.id} style={styles.playlistRow}>
            <span style={styles.playlistPos}>#{pl.position}</span>
            <span style={styles.playlistName}>{pl.playlist_name || `Playlist ${pl.playlist_id}`}</span>
            <span style={styles.playlistInterval}>{Math.round(pl.interval_ms / 60000)}min</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onMove(pl.id, 'up')} title="Move up"><ChevronUp size={14} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => onMove(pl.id, 'down')} title="Move down"><ChevronDown size={14} /></button>
            <ConfirmButton className="btn btn-danger btn-sm" confirmText="Remove?" onConfirm={() => onRemove(pl.id)}>
              <Trash2 size={14} />
            </ConfirmButton>
          </div>
        ))
      )}

      <div style={{ ...styles.formRow, marginTop: 'var(--space-md)' }}>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Playlist</label>
          <select className="form-select" style={{ minWidth: 180 }} value={addPlaylistId} onChange={e => setAddPlaylistId(e.target.value)}>
            <option value="">Select playlist...</option>
            {allPlaylists.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>Interval (min)</label>
          <input className="form-input" type="number" style={{ width: 80 }} min={1} value={Math.round(addIntervalMs / 60000)} onChange={e => setAddIntervalMs(Number(e.target.value) * 60000)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={!addPlaylistId}>
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

// ── Standings Table ─────────────────────────────────────────────────────────

function StandingsTable({ standings }) {
  if (!standings || standings.length === 0) return <p style={styles.empty}>No standings data.</p>;

  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>#</th>
          <th style={styles.th}>Pilot</th>
          <th style={styles.thRight}>Total</th>
          <th style={styles.thRight}>Position</th>
          <th style={styles.thRight}>Laps</th>
          <th style={styles.thRight}>Consistency</th>
          <th style={styles.thRight}>Streak</th>
          <th style={styles.thRight}>Improved</th>
          <th style={styles.thRight}>Participation</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s, i) => (
          <tr key={s.pilot_key}>
            <td style={styles.td}>{s.rank ?? i + 1}</td>
            <td style={styles.td}>{s.display_name}</td>
            <td style={{ ...styles.tdNum, fontWeight: 700 }}>{s.total_points}</td>
            <td style={styles.tdNum}>{s.position_points || 0}</td>
            <td style={styles.tdNum}>{s.laps_points || 0}</td>
            <td style={styles.tdNum}>{s.consistency_points || 0}</td>
            <td style={styles.tdNum}>{s.streak_points || 0}</td>
            <td style={styles.tdNum}>{s.improved_points || 0}</td>
            <td style={styles.tdNum}>{s.participation_points || 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
