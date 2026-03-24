import { useState, useEffect, useCallback } from 'react';
import { Trophy, Plus, Trash2, ChevronUp, ChevronDown, Play, Square, Edit, Calculator, RefreshCw } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import Badge from '../components/feedback/Badge.jsx';
import RunnerBar from '../components/feedback/RunnerBar.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';
import EmptyState from '../components/data/EmptyState.jsx';
import { fmtDate, fmtDateTime } from '../lib/fmt.js';

const STATUS_BADGE = {
  scheduled: 'warning',
  active: 'success',
  finalised: 'muted',
  archived: 'muted',
};

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-xl)',
    maxWidth: 960,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    fontSize: '1.5rem',
    fontWeight: 700,
    fontFamily: 'var(--font-heading)',
    color: 'var(--text-primary)',
  },
  section: {
    background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    padding: 'var(--space-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-md)',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    fontFamily: 'var(--font-heading)',
    color: 'var(--text-primary)',
    margin: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    flexWrap: 'wrap',
  },
  select: {
    flex: 1,
    padding: 'var(--space-sm) var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-surface-alt)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
  },
  input: {
    padding: 'var(--space-sm) var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-surface-alt)',
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    fontFamily: 'var(--font-body)',
  },
  btn: {
    padding: 'var(--space-sm) var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontWeight: 600,
    fontFamily: 'var(--font-heading)',
    fontSize: '0.9rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  btnMuted: {
    padding: 'var(--space-sm) var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontWeight: 600,
    fontFamily: 'var(--font-heading)',
    fontSize: '0.9rem',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  weekItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-sm) var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  weekItemSelected: {
    background: 'var(--bg-surface-alt)',
    borderColor: 'var(--color-primary)',
  },
  playlistItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--space-sm) var(--space-md)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    fontSize: '0.9rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
    padding: 'var(--space-md)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-surface-alt)',
  },
  label: {
    fontSize: '0.8rem',
    color: 'var(--text-muted)',
    fontWeight: 600,
    fontFamily: 'var(--font-heading)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 'var(--space-xs)',
    borderRadius: 'var(--radius-sm)',
    display: 'inline-flex',
    alignItems: 'center',
  },
};

export default function Competition() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  // Runner state
  const [runner, setRunner] = useState(null);

  // Competition list + selection
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompId, setSelectedCompId] = useState('');
  const [newCompName, setNewCompName] = useState('');
  const [showNewComp, setShowNewComp] = useState(false);

  // Week generation
  const [genStartDate, setGenStartDate] = useState('');
  const [genCount, setGenCount] = useState(4);

  // Weeks + selection
  const [weeks, setWeeks] = useState([]);
  const [selectedWeekId, setSelectedWeekId] = useState('');

  // Week editor
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ starts_at: '', ends_at: '', status: 'scheduled', interval_min: 15 });

  // Playlists for selected week
  const [weekPlaylists, setWeekPlaylists] = useState([]);
  const [allPlaylists, setAllPlaylists] = useState([]);
  const [addPlaylistId, setAddPlaylistId] = useState('');
  const [addInterval, setAddInterval] = useState(15);

  const selectedWeek = weeks.find(w => w.id === selectedWeekId);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadRunner = useCallback(async () => {
    const data = await apiFetch('GET', '/api/admin/competition/runner/state');
    if (data) setRunner(data);
  }, [apiFetch]);

  const loadCompetitions = useCallback(async () => {
    const data = await apiFetch('GET', '/api/admin/competitions');
    if (data) setCompetitions(data);
  }, [apiFetch]);

  const loadWeeks = useCallback(async () => {
    if (!selectedCompId) { setWeeks([]); return; }
    const data = await apiFetch('GET', `/api/admin/competition/${selectedCompId}/weeks`);
    if (data) setWeeks(data);
  }, [apiFetch, selectedCompId]);

  const loadWeekPlaylists = useCallback(async () => {
    if (!selectedWeekId) { setWeekPlaylists([]); return; }
    const data = await apiFetch('GET', `/api/admin/competition/week/${selectedWeekId}/playlists`);
    if (data) setWeekPlaylists(data);
  }, [apiFetch, selectedWeekId]);

  const loadAllPlaylists = useCallback(async () => {
    const data = await apiFetch('GET', '/api/admin/playlists');
    if (data) setAllPlaylists(data);
  }, [apiFetch]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => { loadRunner(); loadCompetitions(); }, [loadRunner, loadCompetitions]);
  useEffect(() => { loadWeeks(); setSelectedWeekId(''); setEditing(false); }, [loadWeeks]);
  useEffect(() => { loadWeekPlaylists(); loadAllPlaylists(); setEditing(false); }, [loadWeekPlaylists, loadAllPlaylists]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function toggleAuto() {
    await apiCall('POST', '/api/admin/competition/runner/auto', null, 'Runner auto toggled');
    loadRunner();
  }

  async function createCompetition() {
    const name = newCompName.trim();
    if (!name) return;
    await apiCall('POST', '/api/admin/competition', { name }, 'Competition created');
    setNewCompName('');
    setShowNewComp(false);
    loadCompetitions();
  }

  async function generateWeeks() {
    if (!genStartDate) { toast('Start date required', 'warning'); return; }
    await apiCall('POST', `/api/admin/competition/${selectedCompId}/weeks`, {
      count: Number(genCount),
      start_date: genStartDate,
    }, `${genCount} weeks generated`);
    loadWeeks();
  }

  async function saveWeek() {
    const { interval_min, ...rest } = editForm;
    await apiCall('PUT', `/api/admin/competition/week/${selectedWeekId}`, {
      ...rest,
      interval_ms: Number(interval_min) * 60000,
    }, 'Week updated');
    setEditing(false);
    loadWeeks();
  }

  async function regenerateSchedule() {
    await apiCall('POST', `/api/admin/competition/week/${selectedWeekId}/regenerate-schedule`, null, 'Schedule will regenerate');
  }

  async function recalcWeek() {
    await apiCall('POST', `/api/admin/competition/recalculate/${selectedWeekId}`, null, 'Points recalculated');
  }

  async function deleteWeek() {
    await apiCall('DELETE', `/api/admin/competition/week/${selectedWeekId}`, null, 'Week deleted');
    setSelectedWeekId('');
    loadWeeks();
  }

  async function movePlaylist(wpId, direction) {
    await apiCall('POST', `/api/admin/competition/week/${selectedWeekId}/playlists/${wpId}/move`, { direction }, 'Moved');
    loadWeekPlaylists();
  }

  async function removePlaylist(wpId) {
    await apiCall('DELETE', `/api/admin/competition/week/${selectedWeekId}/playlists/${wpId}`, null, 'Removed');
    loadWeekPlaylists();
  }

  async function addPlaylist() {
    if (!addPlaylistId) { toast('Select a playlist', 'warning'); return; }
    await apiCall('POST', `/api/admin/competition/week/${selectedWeekId}/playlists`, {
      playlist_id: addPlaylistId,
      interval_ms: Number(addInterval) * 60_000,
    }, 'Playlist added');
    setAddPlaylistId('');
    setAddInterval(15);
    loadWeekPlaylists();
  }

  function startEditing() {
    if (!selectedWeek) return;
    setEditForm({
      starts_at: selectedWeek.starts_at?.slice(0, 10) ?? '',
      ends_at: selectedWeek.ends_at?.slice(0, 10) ?? '',
      status: selectedWeek.status,
      interval_min: Math.round((selectedWeek.interval_ms || 900000) / 60000),
    });
    setEditing(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      <div style={styles.heading}>
        <Trophy size={24} color="var(--color-primary)" />
        Competition
      </div>

      {/* Runner status */}
      {runner && (
        <RunnerBar
          label="Competition Runner"
          state={{ running: runner.running }}
          extra={`Week ${runner.week_id ?? '—'}  ·  Day ${runner.day_number ?? '—'}  ·  ${runner.playlist_count ?? 0} playlists  ·  Auto: ${runner.auto_managed ? 'ON' : 'OFF'}`}
          actions={
            <button style={styles.btn} onClick={toggleAuto}>
              {runner.auto_managed ? <Square size={14} /> : <Play size={14} />}
              {runner.auto_managed ? 'Disable Auto' : 'Enable Auto'}
            </button>
          }
        />
      )}

      {/* Competition selector */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Competitions</h2>
        <div style={styles.row}>
          <select
            style={styles.select}
            value={selectedCompId}
            onChange={e => setSelectedCompId(e.target.value)}
          >
            <option value="">Select competition…</option>
            {competitions.map(c => (
              <option
                key={c.id}
                value={c.id}
                style={c.status === 'archived' ? { color: 'var(--text-muted)' } : undefined}
              >
                {c.name} ({c.status})
              </option>
            ))}
          </select>
          {!showNewComp ? (
            <button style={styles.btn} onClick={() => setShowNewComp(true)}>
              <Plus size={14} /> New
            </button>
          ) : (
            <>
              <input
                style={styles.input}
                placeholder="Competition name"
                value={newCompName}
                onChange={e => setNewCompName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createCompetition()}
              />
              <button style={styles.btn} onClick={createCompetition}>Create</button>
              <button style={styles.btnMuted} onClick={() => { setShowNewComp(false); setNewCompName(''); }}>Cancel</button>
            </>
          )}
        </div>
      </div>

      {/* Week management */}
      {selectedCompId && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Weeks</h2>

          {/* Generate weeks */}
          <div style={styles.form}>
            <span style={styles.label}>Generate Weeks</span>
            <div style={styles.row}>
              <input
                type="date"
                style={styles.input}
                value={genStartDate}
                onChange={e => setGenStartDate(e.target.value)}
              />
              <input
                type="number"
                style={{ ...styles.input, width: 80 }}
                min={1}
                max={52}
                value={genCount}
                onChange={e => setGenCount(e.target.value)}
              />
              <button style={styles.btn} onClick={generateWeeks}>Generate</button>
            </div>
          </div>

          {/* Week list */}
          {weeks.length === 0 ? (
            <EmptyState message="No weeks yet — generate some above." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {weeks.map(w => (
                <div
                  key={w.id}
                  style={{
                    ...styles.weekItem,
                    ...(selectedWeekId === w.id ? styles.weekItemSelected : {}),
                  }}
                  onClick={() => setSelectedWeekId(w.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <strong>Week {w.week_number}</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {fmtDate(w.starts_at)} – {fmtDate(w.ends_at)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <Badge variant={STATUS_BADGE[w.status] ?? 'muted'}>{w.status}</Badge>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {w.playlist_count} playlist{w.playlist_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Week editor */}
      {selectedWeek && (
        <div style={styles.section}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <h2 style={styles.sectionTitle}>Week {selectedWeek.week_number}</h2>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {fmtDate(selectedWeek.starts_at)} – {fmtDate(selectedWeek.ends_at)} · {Math.round((selectedWeek.interval_ms || 900000) / 60000)}min tracks
              </span>
              <Badge variant={STATUS_BADGE[selectedWeek.status] ?? 'muted'}>{selectedWeek.status}</Badge>
            </div>
            <div style={styles.row}>
              {!editing && (
                <button style={styles.btnMuted} onClick={startEditing}>
                  <Edit size={14} /> Edit
                </button>
              )}
              <button style={styles.btnMuted} onClick={recalcWeek}>
                <Calculator size={14} /> Recalculate
              </button>
              <button style={styles.btnMuted} onClick={regenerateSchedule}>
                <RefreshCw size={14} /> Regenerate Schedule
              </button>
              <ConfirmButton onConfirm={deleteWeek} label="Delete" icon={<Trash2 size={14} />} />
            </div>
          </div>

          {/* Edit form */}
          {editing && (
            <div style={styles.form}>
              <div style={styles.row}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  <span style={styles.label}>Start date</span>
                  <input
                    type="date"
                    style={styles.input}
                    value={editForm.starts_at}
                    onChange={e => setEditForm(f => ({ ...f, starts_at: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  <span style={styles.label}>End date</span>
                  <input
                    type="date"
                    style={styles.input}
                    value={editForm.ends_at}
                    onChange={e => setEditForm(f => ({ ...f, ends_at: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  <span style={styles.label}>Status</span>
                  <select
                    style={styles.select}
                    value={editForm.status}
                    onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  >
                    <option value="scheduled">scheduled</option>
                    <option value="active">active</option>
                    <option value="finalised">finalised</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                  <span style={styles.label}>Track interval (min)</span>
                  <input
                    type="number"
                    style={{ ...styles.input, width: 90 }}
                    min={1}
                    value={editForm.interval_min}
                    onChange={e => setEditForm(f => ({ ...f, interval_min: e.target.value }))}
                  />
                </div>
              </div>
              <div style={styles.row}>
                <button style={styles.btn} onClick={saveWeek}>Save</button>
                <button style={styles.btnMuted} onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Playlist assignments */}
          <h3 style={{ ...styles.sectionTitle, fontSize: '1rem' }}>Playlists</h3>

          {weekPlaylists.length === 0 ? (
            <EmptyState message="No playlists assigned to this week." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {weekPlaylists.map((wp, idx) => (
                <div key={wp.id} style={styles.playlistItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600, minWidth: 24 }}>{wp.position}</span>
                    <span>{wp.playlist_name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                    <button
                      style={styles.iconBtn}
                      disabled={idx === 0}
                      onClick={() => movePlaylist(wp.id, 'up')}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      style={styles.iconBtn}
                      disabled={idx === weekPlaylists.length - 1}
                      onClick={() => movePlaylist(wp.id, 'down')}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button style={styles.iconBtn} onClick={() => removePlaylist(wp.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add playlist */}
          <div style={styles.form}>
            <span style={styles.label}>Add Playlist</span>
            <div style={styles.row}>
              <select
                style={styles.select}
                value={addPlaylistId}
                onChange={e => setAddPlaylistId(e.target.value)}
              >
                <option value="">Select playlist…</option>
                {allPlaylists.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button style={styles.btn} onClick={addPlaylist}>
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
