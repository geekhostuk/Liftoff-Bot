import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Fuse from 'fuse.js';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import RunnerBar from '../components/feedback/RunnerBar.jsx';
import Badge from '../components/feedback/Badge.jsx';
import SearchInput from '../components/data/SearchInput.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';
import EmptyState from '../components/data/EmptyState.jsx';
import { fmtMs, fmtCountdown, fmtDateTime } from '../lib/fmt.js';
import { Tag, Plus, Trash2, Play, Square, SkipForward, Search, Check, X, RefreshCw } from 'lucide-react';

const cardStyle = {
  background: 'var(--bg-surface)',
  borderRadius: 'var(--radius-md, 8px)',
  border: '1px solid var(--border-color)',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem'
};

const headingStyle = {
  margin: 0,
  fontSize: '1rem',
  color: 'var(--color-text)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem'
};

const inputStyle = {
  padding: '0.5rem 0.75rem',
  background: 'var(--color-input-bg, var(--color-bg))',
  color: 'var(--color-text)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-sm, 4px)',
  fontSize: '0.875rem',
  outline: 'none'
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
  fontSize: '0.8125rem'
};

const btnSuccess = { ...btnPrimary, background: 'var(--color-success, #22c55e)' };
const btnDanger = { ...btnPrimary, background: 'var(--color-danger, #ef4444)' };
const btnOutline = {
  ...btnPrimary,
  background: 'var(--color-surface-hover, rgba(255,255,255,0.1))',
  color: 'var(--color-text)',
  border: '1px solid var(--border-color)'
};

export default function Tags() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  // --- State ---
  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingName, setEditingName] = useState('');

  const [allTracks, setAllTracks] = useState([]);
  const [trackSearch, setTrackSearch] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [steamId, setSteamId] = useState('');
  const [durationMin, setDurationMin] = useState('');

  const [tagRunnerState, setTagRunnerState] = useState({ running: false });
  const [runnerTagNames, setRunnerTagNames] = useState([]);
  const [runnerInterval, setRunnerInterval] = useState(10);

  const [voteState, setVoteState] = useState({ active: false });
  const [voteTagOptions, setVoteTagOptions] = useState([]);
  const [voteDuration, setVoteDuration] = useState(120);

  // --- Loaders ---
  const loadTags = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/tags');
      setTags(data);
    } catch { toast('Failed to load tags', 'error'); }
  }, [apiFetch, toast]);

  const loadTracks = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/tracks');
      setAllTracks(data);
    } catch { toast('Failed to load tracks', 'error'); }
  }, [apiFetch, toast]);

  const loadTagRunnerState = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/tag-runner/state');
      setTagRunnerState(data);
    } catch { /* may not exist */ }
  }, [apiFetch]);

  const loadVoteState = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/tag-vote/state');
      setVoteState(data);
    } catch { /* may not exist */ }
  }, [apiFetch]);

  useEffect(() => {
    loadTags();
    loadTracks();
    loadTagRunnerState();
    loadVoteState();
  }, [loadTags, loadTracks, loadTagRunnerState, loadVoteState]);

  useWsEvent('overseer_state', (data) => setTagRunnerState(data));
  useWsEvent('tag_vote_state', (data) => setVoteState(data));

  // --- Track search (substring, case-insensitive) ---
  const filteredTracks = useMemo(() => {
    const q = trackSearch.trim().toLowerCase();
    if (!q) return allTracks;
    return allTracks.filter(t =>
      t.track.toLowerCase().includes(q) || t.env.toLowerCase().includes(q)
    );
  }, [trackSearch, allTracks]);

  const selectedTrack = allTracks.find(t => t.id === selectedTrackId);

  // Sync local tag checkboxes when selecting a track
  useEffect(() => {
    if (selectedTrack) {
      setSelectedTagIds(selectedTrack.tags?.map(t => t.id) || []);
      setSteamId(selectedTrack.steam_id || '');
      setDurationMin(selectedTrack.duration_override_ms
        ? String(selectedTrack.duration_override_ms / 60000)
        : '');
    }
  }, [selectedTrackId, selectedTrack]);

  // ===========================
  // Section 1: Manage Tags
  // ===========================
  const createTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    await apiCall('POST', '/api/admin/tags', { name }, 'Tag created');
    setNewTagName('');
    loadTags();
  };

  const renameTag = async (id) => {
    const name = editingName.trim();
    if (!name) return;
    await apiCall('PUT', `/api/admin/tags/${id}`, { name }, 'Tag renamed');
    setEditingTagId(null);
    setEditingName('');
    loadTags();
  };

  const deleteTag = async (id) => {
    await apiCall('DELETE', `/api/admin/tags/${id}`, null, 'Tag deleted');
    loadTags();
  };

  // ===========================
  // Section 2: Tag a Track
  // ===========================
  const saveTags = async () => {
    if (!selectedTrackId) return;
    await apiCall('PUT', `/api/admin/tracks/${selectedTrackId}/tags`, { tag_ids: selectedTagIds }, 'Tags saved');
    loadTracks();
  };

  const saveSteamId = async () => {
    if (!selectedTrackId) return;
    await apiCall('PUT', `/api/admin/tracks/${selectedTrackId}/steam-id`, { steam_id: steamId }, 'Steam ID saved');
    loadTracks();
  };

  const fetchSteamData = async () => {
    if (!selectedTrackId) return;
    await apiCall('POST', `/api/admin/tracks/${selectedTrackId}/steam-fetch`, null, 'Steam data fetched');
    loadTracks();
  };

  const saveDuration = async () => {
    if (!selectedTrackId) return;
    const raw = durationMin.trim();
    const duration_ms = raw ? Number(raw) * 60000 : null;
    await apiCall('PUT', `/api/admin/tracks/${selectedTrackId}/duration`, { duration_ms }, 'Duration saved');
    loadTracks();
  };

  const toggleTagId = (id) => {
    setSelectedTagIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ===========================
  // Section 3: Tag Runner
  // ===========================
  const toggleRunnerTag = (name) => {
    setRunnerTagNames(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]
    );
  };

  const startTagRunner = async () => {
    if (runnerTagNames.length === 0) { toast('Select at least one tag', 'error'); return; }
    await apiCall('POST', '/api/admin/tag-runner/start', {
      tag_names: runnerTagNames,
      interval_ms: runnerInterval * 60000
    }, 'Tag runner started');
    loadTagRunnerState();
  };

  const stopTagRunner = async () => {
    await apiCall('POST', '/api/admin/tag-runner/stop', null, 'Tag runner stopped');
    loadTagRunnerState();
  };

  const skipTagRunner = async () => {
    await apiCall('POST', '/api/admin/tag-runner/skip', null, 'Skipped');
    loadTagRunnerState();
  };

  // ===========================
  // Section 4: Tag Vote
  // ===========================
  const toggleVoteTag = (name) => {
    setVoteTagOptions(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]
    );
  };

  const startVote = async () => {
    if (voteTagOptions.length < 2 || voteTagOptions.length > 4) {
      toast('Select 2-4 tags for the vote', 'error');
      return;
    }
    await apiCall('POST', '/api/admin/tag-vote/start', {
      tag_options: voteTagOptions,
      duration_ms: voteDuration * 1000
    }, 'Vote started');
    loadVoteState();
  };

  const cancelVote = async () => {
    await apiCall('POST', '/api/admin/tag-vote/cancel', null, 'Vote cancelled');
    loadVoteState();
  };

  // ===========================
  // Render
  // ===========================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ========= Section 1: Manage Tags ========= */}
      <div style={cardStyle}>
        <h2 style={headingStyle}><Tag size={18} /> Manage Tags</h2>

        {/* Create form */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createTag()}
            placeholder="New tag name…"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={createTag} disabled={!newTagName.trim()} style={{ ...btnPrimary, opacity: newTagName.trim() ? 1 : 0.5 }}>
            <Plus size={14} /> Add Tag
          </button>
        </div>

        {/* Tag chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {tags.length === 0 && <EmptyState message="No tags yet" />}
          {tags.map(t => (
            <div key={t.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.375rem 0.625rem',
              background: 'var(--color-surface-hover, rgba(255,255,255,0.08))',
              borderRadius: '999px',
              fontSize: '0.8125rem',
              color: 'var(--color-text)'
            }}>
              {editingTagId === t.id ? (
                <>
                  <input
                    type="text"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && renameTag(t.id)}
                    autoFocus
                    style={{ ...inputStyle, padding: '0.25rem 0.5rem', width: 100, fontSize: '0.8125rem' }}
                  />
                  <button onClick={() => renameTag(t.id)} style={{ background: 'none', border: 'none', color: 'var(--color-success, #22c55e)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingTagId(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}>
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span
                    onClick={() => { setEditingTagId(t.id); setEditingName(t.name); }}
                    style={{ cursor: 'pointer' }}
                  >
                    {t.name}
                  </span>
                  <Badge>{t.track_count}</Badge>
                  <ConfirmButton
                    onConfirm={() => deleteTag(t.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    <Trash2 size={12} />
                  </ConfirmButton>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ========= Section 2: Tag a Track ========= */}
      <div style={cardStyle}>
        <h2 style={headingStyle}><Search size={18} /> Tag a Track</h2>

        <SearchInput
          value={trackSearch}
          onChange={setTrackSearch}
          placeholder="Search tracks…"
        />

        <div style={{ display: 'flex', gap: '1rem', minHeight: 0 }}>
          {/* Track list */}
          <div style={{
            flex: 1,
            maxHeight: 300,
            overflowY: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm, 4px)'
          }}>
            {filteredTracks.length === 0 && <EmptyState message="No tracks found" />}
            {filteredTracks.map(t => (
              <div
                key={t.id}
                onClick={() => setSelectedTrackId(t.id)}
                style={{
                  padding: '0.5rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  color: 'var(--color-text)',
                  background: t.id === selectedTrackId ? 'rgba(255,122,0,0.12)' : 'transparent',
                  borderLeft: t.id === selectedTrackId ? '3px solid var(--color-primary)' : '3px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{t.env} / {t.track}</span>
                {t.tags?.length > 0 && (
                  <span style={{ display: 'flex', gap: '0.25rem' }}>
                    {t.tags.map(tg => (
                      <Badge key={tg.id}>{tg.name}</Badge>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Detail panel */}
          {selectedTrack && (
            <div style={{
              width: 320,
              minWidth: 280,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              padding: '0.75rem',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm, 4px)',
              background: 'var(--color-bg)'
            }}>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-text)' }}>
                {selectedTrack.track}
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                Environment: {selectedTrack.env}
              </div>

              {/* Tag checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Tags</span>
                {tags.map(t => (
                  <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--color-text)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(t.id)}
                      onChange={() => toggleTagId(t.id)}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    {t.name}
                  </label>
                ))}
                <button onClick={saveTags} style={{ ...btnPrimary, alignSelf: 'flex-start', marginTop: '0.25rem' }}>
                  Save Tags
                </button>
              </div>

              {/* Steam ID */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Steam ID</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    value={steamId}
                    onChange={e => setSteamId(e.target.value)}
                    placeholder="Steam workshop ID"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={saveSteamId} style={btnPrimary}>Save</button>
                  <button
                    onClick={fetchSteamData}
                    disabled={!selectedTrack?.steam_id}
                    style={{ ...btnOutline, display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                    title="Fetch metadata from Steam Workshop"
                  >
                    <RefreshCw size={13} /> Fetch
                  </button>
                </div>

                {/* Steam Workshop preview */}
                {selectedTrack?.steam_fetched_at && (
                  <div style={{ display: 'flex', gap: '0.75rem', padding: '0.625rem', background: 'var(--bg-surface-alt, rgba(255,255,255,0.04))', borderRadius: 'var(--radius-sm, 4px)', border: '1px solid var(--border-color)' }}>
                    {selectedTrack.steam_preview_url && (
                      <a href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${selectedTrack.steam_id}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                        <img src={`/api/admin/tracks/steam-image-proxy?url=${encodeURIComponent(selectedTrack.steam_preview_url)}`} alt="Workshop preview" style={{ width: 100, height: 56, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
                      </a>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0, fontSize: '0.8125rem' }}>
                      {selectedTrack.steam_title && (
                        <span style={{ fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedTrack.steam_title}</span>
                      )}
                      {selectedTrack.steam_author_id && (
                        <a
                          href={`https://steamcommunity.com/profiles/${selectedTrack.steam_author_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: '0.8rem' }}
                        >
                          {selectedTrack.steam_author_name || selectedTrack.steam_author_id}
                        </a>
                      )}
                      <div style={{ display: 'flex', gap: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.775rem' }}>
                        {selectedTrack.steam_subscriptions != null && <span>⭐ {selectedTrack.steam_subscriptions.toLocaleString()} subs</span>}
                        {selectedTrack.steam_score != null && <span>👍 {Math.round(selectedTrack.steam_score * 100)}%</span>}
                      </div>
                      {selectedTrack.steam_description && (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.775rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {selectedTrack.steam_description}
                        </span>
                      )}
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.725rem' }}>
                        Fetched {fmtDateTime(selectedTrack.steam_fetched_at)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Duration override */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Duration Override (min)</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    value={durationMin}
                    onChange={e => setDurationMin(e.target.value)}
                    placeholder="Blank = default"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button onClick={saveDuration} style={btnPrimary}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========= Section 3: Tag Runner ========= */}
      <div style={cardStyle}>
        <h2 style={headingStyle}><Play size={18} /> Tag Runner</h2>

        <RunnerBar
          state={tagRunnerState.running ? 'running' : 'idle'}
          label={tagRunnerState.running ? `Tag runner active — ${tagRunnerState.current_track?.env ?? ''}/${tagRunnerState.current_track?.track ?? ''}` : 'Tag runner idle'}
        />

        {/* Tag multi-select */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {tags.map(t => {
            const active = runnerTagNames.includes(t.name);
            return (
              <button
                key={t.id}
                onClick={() => toggleRunnerTag(t.name)}
                style={{
                  padding: '0.375rem 0.625rem',
                  borderRadius: '999px',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  border: active ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                  background: active ? 'rgba(255,122,0,0.15)' : 'transparent',
                  color: active ? 'var(--color-primary)' : 'var(--color-text)'
                }}
              >
                {t.name}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Interval
            <input
              type="number"
              min={1}
              value={runnerInterval}
              onChange={e => setRunnerInterval(Number(e.target.value))}
              style={{ ...inputStyle, width: 60, padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}
            />
            min
          </label>

          {!tagRunnerState.running && (
            <button onClick={startTagRunner} style={btnSuccess}>
              <Play size={14} /> Start
            </button>
          )}
          {tagRunnerState.running && (
            <>
              <button onClick={stopTagRunner} style={btnDanger}>
                <Square size={14} /> Stop
              </button>
              <button onClick={skipTagRunner} style={btnOutline}>
                <SkipForward size={14} /> Skip
              </button>
            </>
          )}
        </div>
      </div>

      {/* ========= Section 4: Tag Vote ========= */}
      <div style={cardStyle}>
        <h2 style={headingStyle}><Tag size={18} /> Tag Vote</h2>

        {/* Vote status */}
        {voteState.active ? (
          <div style={{
            padding: '0.75rem',
            background: 'rgba(255,122,0,0.08)',
            borderRadius: 'var(--radius-sm, 4px)',
            fontSize: '0.875rem',
            color: 'var(--color-text)'
          }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
              Vote active — {voteState.total_votes} total votes
              {voteState.ends_at && <span> — Ends {fmtCountdown(voteState.ends_at)}</span>}
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {voteState.options?.map((opt, i) => (
                <div key={i} style={{
                  padding: '0.375rem 0.75rem',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--border-color)'
                }}>
                  <span style={{ fontWeight: 600 }}>{opt.name}</span>
                  <span style={{ marginLeft: '0.5rem', color: 'var(--color-text-muted)' }}>{opt.votes} votes</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            No active vote
          </div>
        )}

        {/* Vote tag multi-select */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {tags.map(t => {
            const active = voteTagOptions.includes(t.name);
            return (
              <button
                key={t.id}
                onClick={() => toggleVoteTag(t.name)}
                style={{
                  padding: '0.375rem 0.625rem',
                  borderRadius: '999px',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  border: active ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                  background: active ? 'rgba(255,122,0,0.15)' : 'transparent',
                  color: active ? 'var(--color-primary)' : 'var(--color-text)'
                }}
              >
                {t.name}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Select 2-4 tags ({voteTagOptions.length} selected)
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Duration
            <input
              type="number"
              min={10}
              value={voteDuration}
              onChange={e => setVoteDuration(Number(e.target.value))}
              style={{ ...inputStyle, width: 70, padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}
            />
            sec
          </label>

          {!voteState.active && (
            <button
              onClick={startVote}
              disabled={voteTagOptions.length < 2 || voteTagOptions.length > 4}
              style={{ ...btnSuccess, opacity: (voteTagOptions.length >= 2 && voteTagOptions.length <= 4) ? 1 : 0.5 }}
            >
              <Play size={14} /> Start Vote
            </button>
          )}
          {voteState.active && (
            <button onClick={cancelVote} style={btnDanger}>
              <X size={14} /> Cancel Vote
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
