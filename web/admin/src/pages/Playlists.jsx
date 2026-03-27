import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import RunnerBar from '../components/feedback/RunnerBar.jsx';
import Badge from '../components/feedback/Badge.jsx';
import CascadeSelect from '../components/form/CascadeSelect.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';
import EmptyState from '../components/data/EmptyState.jsx';
import { fmtMs, fmtCountdown } from '../lib/fmt.js';
import {
  ListMusic, Plus, Trash2, Play, Square, SkipForward,
  ChevronUp, ChevronDown
} from 'lucide-react';

export default function Playlists() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  const [playlists, setPlaylists] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [runnerState, setRunnerState] = useState({ running: false });
  const [newName, setNewName] = useState('');
  const [interval, setInterval_] = useState(15);
  const [startAt, setStartAt] = useState(1);

  // Load playlists
  const loadPlaylists = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/playlists');
      setPlaylists(data);
    } catch (e) {
      toast('Failed to load playlists', 'error');
    }
  }, [apiFetch, toast]);

  // Load tracks for selected playlist
  const loadTracks = useCallback(async (id) => {
    if (!id) return;
    try {
      const data = await apiFetch('GET', `/api/admin/playlists/${id}/tracks`);
      setTracks(data);
    } catch (e) {
      toast('Failed to load tracks', 'error');
    }
  }, [apiFetch, toast]);

  // Load runner state
  const loadRunnerState = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/playlist/state');
      setRunnerState(data);
    } catch (e) {
      // runner state may not exist yet
    }
  }, [apiFetch]);

  // Load catalog
  const loadCatalog = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/catalog');
      setCatalog(data);
    } catch (e) {
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

  // WebSocket: overseer_state
  useWsEvent('overseer_state', (data) => {
    setRunnerState(data);
    if (selectedId) loadTracks(selectedId);
  });

  const selectedPlaylist = playlists.find(p => p.id === selectedId);

  // --- Actions ---
  const createPlaylist = async () => {
    const name = newName.trim();
    if (!name) return;
    await apiCall('POST', '/api/admin/playlists', { name }, 'Playlist created');
    setNewName('');
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

  const deleteTrack = async (trackId) => {
    await apiCall('DELETE', `/api/admin/playlists/tracks/${trackId}`, null, 'Track removed');
    loadTracks(selectedId);
  };

  const addTrack = async (selection) => {
    if (!selectedId || !selection) return;
    await apiCall('POST', `/api/admin/playlists/${selectedId}/tracks`, {
      env: selection.env,
      track: selection.track,
      race: selection.race
    }, 'Track added');
    loadTracks(selectedId);
    loadPlaylists();
  };

  const isRunning = runnerState.running;
  const runningPlaylistId = runnerState.playlist_id;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
      {/* Runner bar */}
      <RunnerBar state={runnerState} label="Playlist" />

      <div style={{ display: 'flex', flex: 1, gap: '1rem', minHeight: 0 }}>
        {/* Left column: Playlist list */}
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
              placeholder="Playlist name…"
              style={{
                flex: 1,
                padding: '0.5rem 0.75rem',
                background: 'var(--color-input-bg, var(--color-bg))',
                color: 'var(--color-text)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm, 4px)',
                outline: 'none',
                fontSize: '0.875rem'
              }}
            />
            <button
              onClick={createPlaylist}
              disabled={!newName.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.5rem 0.75rem',
                background: 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm, 4px)',
                cursor: 'pointer',
                fontSize: '0.875rem',
                opacity: newName.trim() ? 1 : 0.5
              }}
            >
              <Plus size={14} /> New
            </button>
          </div>

          {/* Playlist items */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {playlists.length === 0 && (
              <EmptyState message="No playlists yet" />
            )}
            {playlists.map(pl => {
              const isSelected = pl.id === selectedId;
              const isPlRunning = pl.id === runningPlaylistId;
              return (
                <div
                  key={pl.id}
                  onClick={() => setSelectedId(pl.id)}
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
                  <span style={{
                    flex: 1,
                    fontSize: '0.875rem',
                    color: 'var(--color-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {pl.name}
                  </span>
                  <Badge>{pl.track_count}</Badge>
                  <ConfirmButton
                    onConfirm={() => deletePlaylist(pl.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      display: 'flex'
                    }}
                  >
                    <Trash2 size={14} />
                  </ConfirmButton>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right column: Editor */}
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
              <EmptyState message="Select a playlist to edit" />
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
                <h2 style={{
                  margin: 0,
                  fontSize: '1.125rem',
                  color: 'var(--color-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <ListMusic size={20} />
                  {selectedPlaylist.name}
                </h2>

                {/* Runner controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    Interval
                    <input
                      type="number"
                      min={1}
                      value={interval}
                      onChange={e => setInterval_(Number(e.target.value))}
                      style={{
                        width: 60,
                        padding: '0.375rem 0.5rem',
                        background: 'var(--color-input-bg, var(--color-bg))',
                        color: 'var(--color-text)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm, 4px)',
                        fontSize: '0.8125rem'
                      }}
                    />
                    min
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                    Start at
                    <input
                      type="number"
                      min={1}
                      value={startAt}
                      onChange={e => setStartAt(Number(e.target.value))}
                      style={{
                        width: 60,
                        padding: '0.375rem 0.5rem',
                        background: 'var(--color-input-bg, var(--color-bg))',
                        color: 'var(--color-text)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm, 4px)',
                        fontSize: '0.8125rem'
                      }}
                    />
                  </label>

                  {(!isRunning || runningPlaylistId !== selectedId) && (
                    <button
                      onClick={startRunner}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.375rem 0.75rem',
                        background: 'var(--color-success, #22c55e)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-sm, 4px)',
                        cursor: 'pointer',
                        fontSize: '0.8125rem'
                      }}
                    >
                      <Play size={14} /> Start
                    </button>
                  )}
                  {isRunning && runningPlaylistId === selectedId && (
                    <>
                      <button
                        onClick={stopRunner}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          padding: '0.375rem 0.75rem',
                          background: 'var(--color-danger, #ef4444)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 'var(--radius-sm, 4px)',
                          cursor: 'pointer',
                          fontSize: '0.8125rem'
                        }}
                      >
                        <Square size={14} /> Stop
                      </button>
                      <button
                        onClick={skipTrack}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                          padding: '0.375rem 0.75rem',
                          background: 'var(--color-surface-hover, rgba(255,255,255,0.1))',
                          color: 'var(--color-text)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm, 4px)',
                          cursor: 'pointer',
                          fontSize: '0.8125rem'
                        }}
                      >
                        <SkipForward size={14} /> Skip
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Track list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
                {tracks.length === 0 && (
                  <EmptyState message="No tracks in this playlist" />
                )}
                {tracks.map((t, i) => {
                  const isCurrent = isRunning
                    && runningPlaylistId === selectedId
                    && runnerState.current_index === i;
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 1rem',
                        background: isCurrent ? 'rgba(255, 122, 0, 0.1)' : 'transparent',
                        borderLeft: isCurrent ? '3px solid var(--color-primary)' : '3px solid transparent'
                      }}
                    >
                      {/* Position / now-playing indicator */}
                      <span style={{
                        width: 28,
                        textAlign: 'center',
                        fontSize: '0.8125rem',
                        color: isCurrent ? 'var(--color-primary)' : 'var(--color-text-muted)',
                        fontWeight: isCurrent ? 700 : 400
                      }}>
                        {isCurrent ? '▶' : t.position ?? i + 1}
                      </span>

                      {/* Track info */}
                      <span style={{
                        flex: 1,
                        fontSize: '0.875rem',
                        color: 'var(--color-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {t.env} / {t.track} / {t.race}
                      </span>

                      {/* Move buttons */}
                      <button
                        onClick={() => moveTrack(t.id, 'up')}
                        disabled={i === 0}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: i === 0 ? 'var(--color-text-disabled, rgba(255,255,255,0.2))' : 'var(--color-text-muted)',
                          cursor: i === 0 ? 'default' : 'pointer',
                          padding: '0.125rem',
                          display: 'flex'
                        }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => moveTrack(t.id, 'down')}
                        disabled={i === tracks.length - 1}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: i === tracks.length - 1 ? 'var(--color-text-disabled, rgba(255,255,255,0.2))' : 'var(--color-text-muted)',
                          cursor: i === tracks.length - 1 ? 'default' : 'pointer',
                          padding: '0.125rem',
                          display: 'flex'
                        }}
                      >
                        <ChevronDown size={16} />
                      </button>

                      {/* Delete */}
                      <ConfirmButton
                        onConfirm={() => deleteTrack(t.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-muted)',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          display: 'flex'
                        }}
                      >
                        <Trash2 size={14} />
                      </ConfirmButton>
                    </div>
                  );
                })}
              </div>

              {/* Add track form */}
              <div style={{
                padding: '0.75rem 1rem',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Add track:
                </span>
                <div style={{ flex: 1 }}>
                  {catalog && (
                    <CascadeSelect
                      catalog={catalog}
                      onSelect={addTrack}
                      showMode
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
