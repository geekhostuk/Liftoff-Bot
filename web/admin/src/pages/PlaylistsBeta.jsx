import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import RunnerBar from '../components/feedback/RunnerBar.jsx';
import Badge from '../components/feedback/Badge.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';
import EmptyState from '../components/data/EmptyState.jsx';
import SearchInput from '../components/data/SearchInput.jsx';
import {
  ListMusic, Plus, Trash2, Play, Square, SkipForward,
  ChevronUp, ChevronDown, ChevronsUp, ChevronsDown,
  Copy, Check, X, Pencil
} from 'lucide-react';

/* ── Shared inline styles ─────────────────────────────────── */

const inputStyle = {
  padding: '0.5rem 0.75rem',
  background: 'var(--color-input-bg, var(--color-bg))',
  color: 'var(--color-text)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm, 4px)',
  fontSize: '0.875rem',
  outline: 'none'
};

const btnIcon = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0.25rem',
  display: 'flex',
  alignItems: 'center'
};

const btnPrimary = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.375rem',
  padding: '0.5rem 0.75rem',
  background: 'var(--color-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm, 4px)',
  cursor: 'pointer',
  fontSize: '0.875rem'
};

const btnSuccess = {
  ...btnPrimary,
  background: 'var(--color-success, #22c55e)'
};

const btnDanger = {
  ...btnPrimary,
  background: 'var(--color-danger, #ef4444)'
};

const btnOutline = {
  ...btnPrimary,
  background: 'var(--color-surface-hover, rgba(255,255,255,0.1))',
  color: 'var(--color-text)',
  border: '1px solid var(--border-color)'
};

const btnSmall = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.8125rem'
};

export default function PlaylistsBeta() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  /* ── State ────────────────────────────────────────────── */
  const [playlists, setPlaylists] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [runnerState, setRunnerState] = useState({ running: false });
  const [newName, setNewName] = useState('');
  const [interval, setInterval_] = useState(15);
  const [startAt, setStartAt] = useState(1);

  // Inline rename
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  // Track search
  const [trackFilter, setTrackFilter] = useState('');

  // Catalog search (right panel)
  const [catalogFilter, setCatalogFilter] = useState('');
  const [catalogMode, setCatalogMode] = useState('InfiniteRace');
  const [selectedCatalogTrack, setSelectedCatalogTrack] = useState(null);

  // Busy states
  const [duplicating, setDuplicating] = useState(null);
  const [movingTrack, setMovingTrack] = useState(null);

  /* ── Data loaders ─────────────────────────────────────── */
  const loadPlaylists = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/playlists');
      setPlaylists(data);
    } catch {
      toast('Failed to load playlists', 'error');
    }
  }, [apiFetch, toast]);

  const loadTracks = useCallback(async (id) => {
    if (!id) return;
    try {
      const data = await apiFetch('GET', `/api/admin/playlists/${id}/tracks`);
      setTracks(data);
    } catch {
      toast('Failed to load tracks', 'error');
    }
  }, [apiFetch, toast]);

  const loadRunnerState = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/playlist/state');
      setRunnerState(data);
    } catch { /* runner state may not exist yet */ }
  }, [apiFetch]);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/catalog');
      setCatalog(data);
    } catch {
      toast('Failed to load catalog', 'error');
    }
  }, [apiFetch, toast]);

  useEffect(() => {
    loadPlaylists();
    loadRunnerState();
    loadCatalog();
  }, [loadPlaylists, loadRunnerState, loadCatalog]);

  useEffect(() => {
    if (selectedId) loadTracks(selectedId);
  }, [selectedId, loadTracks]);

  useWsEvent('playlist_state', (data) => {
    setRunnerState(data);
    if (selectedId) loadTracks(selectedId);
  });

  /* ── Derived ──────────────────────────────────────────── */
  const selectedPlaylist = playlists.find(p => p.id === selectedId);
  const isRunning = runnerState.running;
  const runningPlaylistId = runnerState.playlist_id;

  const filteredTracks = useMemo(() => {
    if (!trackFilter.trim()) return tracks;
    const q = trackFilter.toLowerCase();
    return tracks.filter(t =>
      t.env.toLowerCase().includes(q) ||
      t.track.toLowerCase().includes(q) ||
      t.race.toLowerCase().includes(q)
    );
  }, [tracks, trackFilter]);

  // Flatten catalog into searchable track list for right panel
  const catalogTracks = useMemo(() => {
    if (!catalog?.environments) return [];
    const items = [];
    for (const env of catalog.environments) {
      const envName = env.internal_name || env.caption;
      const envDisplay = env.display_name || env.caption;
      for (const t of (env.tracks || [])) {
        items.push({ env: envName, envDisplay, track: t.name });
      }
    }
    return items;
  }, [catalog]);

  const gameModes = useMemo(() => {
    if (!catalog?.game_modes) return [];
    return catalog.game_modes.filter(m => m.name !== 'None');
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    if (!catalogFilter.trim()) return [];
    const q = catalogFilter.toLowerCase();
    return catalogTracks.filter(t =>
      t.track.toLowerCase().includes(q) ||
      t.envDisplay.toLowerCase().includes(q)
    );
  }, [catalogTracks, catalogFilter]);

  /* ── Actions ──────────────────────────────────────────── */
  const createPlaylist = async () => {
    const name = newName.trim();
    if (!name) return;
    await apiCall('POST', '/api/admin/playlists', { name }, 'Playlist created');
    setNewName('');
    loadPlaylists();
  };

  const renamePlaylist = async (id) => {
    const name = editingName.trim();
    if (!name) return;
    await apiCall('PUT', `/api/admin/playlists/${id}`, { name }, 'Playlist renamed');
    setEditingId(null);
    setEditingName('');
    loadPlaylists();
  };

  const deletePlaylist = async (id) => {
    await apiCall('DELETE', `/api/admin/playlists/${id}`, null, 'Playlist deleted');
    if (selectedId === id) {
      setSelectedId(null);
      setTracks([]);
    }
    loadPlaylists();
  };

  const duplicatePlaylist = async (sourceId) => {
    const source = playlists.find(p => p.id === sourceId);
    if (!source) return;
    setDuplicating(sourceId);
    try {
      const created = await apiFetch('POST', '/api/admin/playlists', { name: `${source.name} (copy)` });
      const sourceTracks = await apiFetch('GET', `/api/admin/playlists/${sourceId}/tracks`);
      for (const t of sourceTracks) {
        await apiFetch('POST', `/api/admin/playlists/${created.id}/tracks`, {
          env: t.env, track: t.track, race: t.race, workshop_id: t.workshop_id
        });
      }
      toast('Playlist duplicated', 'success');
      await loadPlaylists();
      setSelectedId(created.id);
    } catch (e) {
      toast(`Duplicate failed: ${e.message || 'Unknown error'}`, 'error');
    } finally {
      setDuplicating(null);
    }
  };

  const startRunner = async () => {
    await apiCall('POST', `/api/admin/playlists/${selectedId}/start`, {
      interval_ms: interval * 60000,
      start_index: startAt - 1
    }, 'Playlist started');
    loadRunnerState();
  };

  const stopRunner = async () => {
    await apiCall('POST', '/api/admin/playlist/stop', null, 'Playlist stopped');
    loadRunnerState();
  };

  const skipTrack = async () => {
    await apiCall('POST', '/api/admin/playlist/skip', null, 'Skipped');
    loadRunnerState();
  };

  const moveTrack = async (trackId, direction) => {
    await apiCall('POST', `/api/admin/playlists/tracks/${trackId}/move`, { direction }, 'Track moved');
    loadTracks(selectedId);
  };

  const moveToEdge = async (trackId, currentIndex, direction) => {
    const steps = direction === 'top' ? currentIndex : tracks.length - 1 - currentIndex;
    if (steps === 0) return;
    setMovingTrack(trackId);
    try {
      const dir = direction === 'top' ? 'up' : 'down';
      for (let i = 0; i < steps; i++) {
        await apiFetch('POST', `/api/admin/playlists/tracks/${trackId}/move`, { direction: dir });
      }
      toast(`Moved to ${direction}`, 'success');
      loadTracks(selectedId);
    } catch {
      toast('Move failed', 'error');
      loadTracks(selectedId);
    } finally {
      setMovingTrack(null);
    }
  };

  const deleteTrack = async (trackId) => {
    await apiCall('DELETE', `/api/admin/playlists/tracks/${trackId}`, null, 'Track removed');
    loadTracks(selectedId);
    loadPlaylists();
  };

  const addTrackDirect = async (env, track, race = '') => {
    if (!selectedId) return;
    await apiCall('POST', `/api/admin/playlists/${selectedId}/tracks`, {
      env, track, race
    }, 'Track added');
    loadTracks(selectedId);
    loadPlaylists();
  };

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
      {/* Runner bar */}
      <RunnerBar state={runnerState} label="Playlist" />

      <div style={{ display: 'flex', flex: 1, gap: '1rem', minHeight: 0 }}>
        {/* ─── Left panel: Playlist list ─── */}
        <div style={{
          width: 300,
          minWidth: 300,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md, 8px)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          {/* Create form */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.75rem',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPlaylist()}
              placeholder="New playlist name..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={createPlaylist}
              disabled={!newName.trim()}
              style={{ ...btnPrimary, opacity: newName.trim() ? 1 : 0.5 }}
            >
              <Plus size={14} /> New
            </button>
          </div>

          {/* Playlist items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {playlists.length === 0 && (
              <EmptyState message="No playlists yet. Create one above." />
            )}
            {playlists.map(pl => {
              const isSelected = pl.id === selectedId;
              const isPlRunning = pl.id === runningPlaylistId;
              const isDuplicating = duplicating === pl.id;

              return (
                <div
                  key={pl.id}
                  onClick={() => { if (editingId !== pl.id) setSelectedId(pl.id); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 0.75rem',
                    cursor: 'pointer',
                    borderLeft: isPlRunning
                      ? '3px solid var(--color-success, #22c55e)'
                      : isSelected
                        ? '3px solid var(--color-primary)'
                        : '3px solid transparent',
                    background: isSelected ? 'var(--color-surface-hover, rgba(255,255,255,0.05))' : 'transparent',
                    transition: 'background 0.15s'
                  }}
                >
                  <ListMusic size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />

                  {/* Name — inline edit or display */}
                  {editingId === pl.id ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <input
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') renamePlaylist(pl.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                        style={{ ...inputStyle, flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      />
                      <button
                        onClick={e => { e.stopPropagation(); renamePlaylist(pl.id); }}
                        style={{ ...btnIcon, color: 'var(--color-success, #22c55e)' }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingId(null); }}
                        style={{ ...btnIcon, color: 'var(--color-text-muted)' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        onDoubleClick={e => {
                          e.stopPropagation();
                          setEditingId(pl.id);
                          setEditingName(pl.name);
                        }}
                        title="Double-click to rename"
                        style={{
                          flex: 1,
                          fontSize: '0.875rem',
                          color: 'var(--color-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {pl.name}
                      </span>
                      <Badge>{pl.track_count}</Badge>

                      {/* Rename */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setEditingId(pl.id);
                          setEditingName(pl.name);
                        }}
                        title="Rename playlist"
                        style={{ ...btnIcon, color: 'var(--color-text-muted)' }}
                      >
                        <Pencil size={14} />
                      </button>

                      {/* Duplicate */}
                      <button
                        onClick={e => { e.stopPropagation(); duplicatePlaylist(pl.id); }}
                        disabled={isDuplicating}
                        title="Duplicate playlist"
                        style={{
                          ...btnIcon,
                          color: isDuplicating ? 'var(--color-text-disabled, rgba(255,255,255,0.2))' : 'var(--color-text-muted)',
                          cursor: isDuplicating ? 'wait' : 'pointer'
                        }}
                      >
                        <Copy size={14} />
                      </button>

                      {/* Delete */}
                      <ConfirmButton
                        onConfirm={() => deletePlaylist(pl.id)}
                        style={{ ...btnIcon, color: 'var(--color-text-muted)' }}
                      >
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Right panel: Editor ─── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-md, 8px)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          minHeight: 0
        }}>
          {!selectedPlaylist ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <EmptyState message="Select a playlist from the sidebar to start editing" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                {/* Title row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ListMusic size={20} style={{ color: 'var(--color-text-muted)' }} />
                  <h2 style={{
                    margin: 0,
                    fontSize: '1.125rem',
                    color: 'var(--color-text)',
                    flex: 1
                  }}>
                    {selectedPlaylist.name}
                  </h2>
                  <Badge>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</Badge>

                  {/* Runner status indicator */}
                  {isRunning && runningPlaylistId === selectedId && (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      fontSize: '0.75rem',
                      color: 'var(--color-success, #22c55e)',
                      fontWeight: 600
                    }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: 'var(--color-success, #22c55e)',
                        animation: 'pulse 2s infinite'
                      }} />
                      Now playing
                    </span>
                  )}
                  {isRunning && runningPlaylistId !== selectedId && (
                    <span style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-warning, #f59e0b)',
                      fontWeight: 500
                    }}>
                      Runner active on "{runnerState.playlist_name}"
                    </span>
                  )}
                </div>

                {/* Runner controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    Interval
                    <input
                      type="number"
                      min={1}
                      value={interval}
                      onChange={e => setInterval_(Number(e.target.value))}
                      style={{ ...inputStyle, width: 60, padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}
                    />
                    min
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    Start at
                    <input
                      type="number"
                      min={1}
                      max={tracks.length || 1}
                      value={startAt}
                      onChange={e => setStartAt(Number(e.target.value))}
                      style={{ ...inputStyle, width: 60, padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}
                    />
                  </label>

                  {(!isRunning || runningPlaylistId !== selectedId) && (
                    <button onClick={startRunner} style={{ ...btnSuccess, ...btnSmall }}>
                      <Play size={14} /> Start
                    </button>
                  )}
                  {isRunning && runningPlaylistId === selectedId && (
                    <>
                      <button onClick={stopRunner} style={{ ...btnDanger, ...btnSmall }}>
                        <Square size={14} /> Stop
                      </button>
                      <button onClick={skipTrack} style={{ ...btnOutline, ...btnSmall }}>
                        <SkipForward size={14} /> Skip
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Track search */}
              <div style={{ padding: '0.5rem 1rem 0' }}>
                <SearchInput
                  value={trackFilter}
                  onChange={setTrackFilter}
                  placeholder="Filter tracks..."
                />
              </div>

              {/* Track list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
                {tracks.length === 0 && (
                  <EmptyState message="This playlist has no tracks. Use the Add Tracks panel on the right." />
                )}
                {tracks.length > 0 && filteredTracks.length === 0 && (
                  <EmptyState message="No tracks match your filter" />
                )}
                {filteredTracks.map((t, _fi) => {
                  const i = tracks.indexOf(t);
                  const isCurrent = isRunning
                    && runningPlaylistId === selectedId
                    && runnerState.current_index === i;
                  const isBusy = movingTrack === t.id;

                  return (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: isCurrent ? 'rgba(255, 122, 0, 0.1)' : 'transparent',
                        borderLeft: isCurrent ? '3px solid var(--color-primary)' : '3px solid transparent',
                        opacity: isBusy ? 0.5 : 1,
                        transition: 'opacity 0.15s'
                      }}
                    >
                      {/* Position */}
                      <span style={{
                        width: 28,
                        textAlign: 'center',
                        fontSize: '0.8125rem',
                        color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        fontWeight: isCurrent ? 700 : 400,
                        flexShrink: 0
                      }}>
                        {isCurrent ? '\u25B6' : (t.position ?? i + 1)}
                      </span>

                      {/* Track info — two-line layout */}
                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <span style={{
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: 'var(--color-text)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {t.track || t.workshop_id || 'Unknown'}
                          </span>
                          {t.race && <Badge variant="muted">{t.race}</Badge>}
                        </div>
                        <div style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {t.env}
                        </div>
                      </div>

                      {/* Move controls */}
                      <button
                        onClick={() => moveToEdge(t.id, i, 'top')}
                        disabled={i === 0 || isBusy}
                        title="Move to top"
                        style={{
                          ...btnIcon,
                          color: i === 0 || isBusy ? 'var(--color-text-disabled, rgba(255,255,255,0.2))' : 'var(--color-text-muted)'
                        }}
                      >
                        <ChevronsUp size={16} />
                      </button>
                      <button
                        onClick={() => moveTrack(t.id, 'up')}
                        disabled={i === 0 || isBusy}
                        title="Move up"
                        style={{
                          ...btnIcon,
                          color: i === 0 || isBusy ? 'var(--color-text-disabled, rgba(255,255,255,0.2))' : 'var(--color-text-muted)'
                        }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => moveTrack(t.id, 'down')}
                        disabled={i === tracks.length - 1 || isBusy}
                        title="Move down"
                        style={{
                          ...btnIcon,
                          color: i === tracks.length - 1 || isBusy ? 'var(--color-text-disabled, rgba(255,255,255,0.2))' : 'var(--color-text-muted)'
                        }}
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        onClick={() => moveToEdge(t.id, i, 'bottom')}
                        disabled={i === tracks.length - 1 || isBusy}
                        title="Move to bottom"
                        style={{
                          ...btnIcon,
                          color: i === tracks.length - 1 || isBusy ? 'var(--color-text-disabled, rgba(255,255,255,0.2))' : 'var(--color-text-muted)'
                        }}
                      >
                        <ChevronsDown size={16} />
                      </button>

                      {/* Delete */}
                      <ConfirmButton
                        onConfirm={() => deleteTrack(t.id)}
                        style={{ ...btnIcon, color: 'var(--color-text-muted)' }}
                      >
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </div>
                  );
                })}
              </div>

            </>
          )}
        </div>

        {/* ─── Right panel: Add Tracks ─── */}
        {selectedPlaylist && (
          <div style={{
            width: 320,
            minWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '0.75rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '0.9375rem',
                color: 'var(--color-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Plus size={18} /> Add Tracks
              </h3>
              <SearchInput
                value={catalogFilter}
                onChange={setCatalogFilter}
                placeholder="Search tracks..."
              />
            </div>

            {/* Search results */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!catalogFilter.trim() && !selectedCatalogTrack && (
                <EmptyState message="Type to search for tracks" />
              )}
              {catalogFilter.trim() && filteredCatalog.length === 0 && (
                <EmptyState message="No tracks match your search" />
              )}
              {filteredCatalog.map((ct, idx) => {
                const isSelected = selectedCatalogTrack
                  && selectedCatalogTrack.env === ct.env
                  && selectedCatalogTrack.track === ct.track;
                return (
                  <div
                    key={`${ct.env}-${ct.track}-${idx}`}
                    onClick={() => setSelectedCatalogTrack(isSelected ? null : ct)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(255, 122, 0, 0.1)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--color-primary)' : '3px solid transparent',
                      borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
                      transition: 'background 0.15s'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: 'var(--color-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {ct.track}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {ct.envDisplay}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected track: race mode + add button */}
            {selectedCatalogTrack && (
              <div style={{
                padding: '0.75rem',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                background: 'var(--bg-surface-alt, var(--bg-surface))'
              }}>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text)', fontWeight: 500 }}>
                  {selectedCatalogTrack.track}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {selectedCatalogTrack.envDisplay}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  Race mode:
                  <select
                    className="form-select"
                    style={{ flex: 1, fontSize: '0.8125rem' }}
                    value={catalogMode}
                    onChange={e => setCatalogMode(e.target.value)}
                  >
                    {gameModes.map(m => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                    <option value="">None</option>
                  </select>
                </label>
                <button
                  onClick={async () => {
                    await addTrackDirect(selectedCatalogTrack.env, selectedCatalogTrack.track, catalogMode);
                    setSelectedCatalogTrack(null);
                  }}
                  style={{ ...btnPrimary, justifyContent: 'center' }}
                >
                  <Plus size={14} /> Add to Playlist
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pulse animation for the "Now playing" dot */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
