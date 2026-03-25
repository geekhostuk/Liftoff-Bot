import { useState, useEffect, useCallback, useRef } from 'react';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import ConfirmButton from '../components/form/ConfirmButton.jsx';

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (!ms) return '—';
  const s = (ms / 1000).toFixed(1);
  return s + 's';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function imageProxy(url) {
  if (!url) return null;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

const PAGE_SIZE = 40;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrackManagerBeta() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  // List state
  const [tracks, setTracks] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [envFilter, setEnvFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [offset, setOffset] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [envOptions, setEnvOptions] = useState([]);
  const debounceRef = useRef(null);

  // Selected track + tab
  const [selected, setSelected] = useState(null);
  const [activeTab, setActiveTab] = useState('info');

  // Tab data
  const [detail, setDetail] = useState(null);         // full track from /api/admin/tracks
  const [allTags, setAllTags] = useState([]);          // all system tags
  const [allPlaylists, setAllPlaylists] = useState([]); // all playlists
  const [memberships, setMemberships] = useState([]);  // playlist memberships
  const [comments, setComments] = useState([]);        // admin comments
  const [userTags, setUserTags] = useState([]);        // user tags

  // Info tab edit state
  const [editSteamId, setEditSteamId] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [fetchingMeta, setFetchingMeta] = useState(false);
  const [savingField, setSavingField] = useState(null);

  // Tags tab
  const [addTagId, setAddTagId] = useState('');

  // Playlists tab
  const [addPlaylistId, setAddPlaylistId] = useState('');
  const [addingPlaylist, setAddingPlaylist] = useState(false);

  // ── Debounce search ────────────────────────────────────────────────────────

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // ── Load track list ────────────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        env: envFilter,
        sort: sortBy,
        limit: PAGE_SIZE,
        offset,
      });
      const data = await apiFetch('GET', `/api/admin/track-manager?${params}`);
      setTracks(data.tracks);
      setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setListLoading(false);
    }
  }, [apiFetch, debouncedSearch, envFilter, sortBy, offset, toast]);

  useEffect(() => { loadList(); }, [loadList]);

  // Load env options + all tags + all playlists on mount
  useEffect(() => {
    apiFetch('GET', '/api/admin/track-manager/envs').then(setEnvOptions).catch(() => {});
    apiFetch('GET', '/api/admin/tags').then(setAllTags).catch(() => {});
    apiFetch('GET', '/api/admin/playlists').then(setAllPlaylists).catch(() => {});
  }, [apiFetch]);

  // ── Select a track ─────────────────────────────────────────────────────────

  async function selectTrack(track) {
    setSelected(track);
    setActiveTab('info');
    setDetail(null);
    setMemberships([]);
    setComments([]);
    setUserTags([]);
    setEditSteamId(track.steam_id || '');
    setEditDuration(track.duration_ms != null ? String(track.duration_ms) : '');

    // Load full detail (for tags)
    try {
      const d = await apiFetch('GET', `/api/admin/tracks`);
      const full = d.find(t => t.id === track.id);
      if (full) setDetail(full);
    } catch {}
  }

  async function loadTabData(tab) {
    setActiveTab(tab);
    if (!selected) return;

    if (tab === 'playlists' && memberships.length === 0) {
      try {
        setMemberships(await apiFetch('GET', `/api/admin/track-manager/${selected.id}/playlists`));
      } catch {}
    }
    if (tab === 'comments' && comments.length === 0) {
      try {
        setComments(await apiFetch('GET', `/api/admin/track-manager/${selected.id}/comments`));
      } catch {}
    }
    if (tab === 'tags' && userTags.length === 0) {
      try {
        setUserTags(await apiFetch('GET', `/api/admin/track-manager/${selected.id}/user-tags`));
      } catch {}
    }
  }

  // ── Info tab actions ───────────────────────────────────────────────────────

  async function saveSteamId() {
    setSavingField('steam_id');
    try {
      await apiCall('PUT', `/api/admin/tracks/${selected.id}/steam-id`, { steam_id: editSteamId }, 'Steam ID saved');
      setSelected(s => ({ ...s, steam_id: editSteamId }));
      refreshList();
    } finally { setSavingField(null); }
  }

  async function saveDuration() {
    setSavingField('duration');
    const val = editDuration === '' ? null : Number(editDuration);
    try {
      await apiCall('PUT', `/api/admin/tracks/${selected.id}/duration`, { duration_ms: val }, 'Duration saved');
      setSelected(s => ({ ...s, duration_ms: val }));
      refreshList();
    } finally { setSavingField(null); }
  }

  async function fetchSteamMeta() {
    setFetchingMeta(true);
    try {
      const updated = await apiCall('POST', `/api/admin/tracks/${selected.id}/steam-fetch`, {}, 'Steam metadata refreshed');
      setSelected(s => ({ ...s, ...updated }));
      setDetail(d => d ? { ...d, ...updated } : updated);
      refreshList();
    } finally { setFetchingMeta(false); }
  }

  // ── Tags tab actions ───────────────────────────────────────────────────────

  async function addSystemTag() {
    if (!addTagId) return;
    await apiCall('POST', `/api/admin/tracks/${selected.id}/tags`, { tag_id: Number(addTagId) }, 'Tag added');
    const d = await apiFetch('GET', `/api/admin/tracks`);
    const full = d.find(t => t.id === selected.id);
    if (full) setDetail(full);
    setAddTagId('');
    refreshList();
  }

  async function removeSystemTag(tagId) {
    await apiCall('DELETE', `/api/admin/tracks/${selected.id}/tags/${tagId}`, undefined, 'Tag removed');
    setDetail(d => ({ ...d, tags: d.tags.filter(t => t.id !== tagId) }));
    refreshList();
  }

  async function removeUserTag(label) {
    await apiCall('DELETE', `/api/admin/track-manager/${selected.id}/user-tags/${encodeURIComponent(label)}`, undefined, 'User tag removed');
    setUserTags(prev => prev.filter(t => t.label !== label));
    refreshList();
  }

  // ── Playlists tab actions ──────────────────────────────────────────────────

  async function addToPlaylist() {
    if (!addPlaylistId) return;
    setAddingPlaylist(true);
    try {
      await apiCall(
        'POST',
        `/api/admin/playlists/${addPlaylistId}/tracks`,
        { env: selected.env, track: selected.track, race: '' },
        'Added to playlist'
      );
      setAddPlaylistId('');
      setMemberships(await apiFetch('GET', `/api/admin/track-manager/${selected.id}/playlists`));
      refreshList();
    } finally { setAddingPlaylist(false); }
  }

  async function removeFromPlaylist(playlistTrackId) {
    await apiCall('DELETE', `/api/admin/playlists/tracks/${playlistTrackId}`, undefined, 'Removed from playlist');
    setMemberships(prev => prev.filter(m => m.playlist_track_id !== playlistTrackId));
    refreshList();
  }

  // ── Comments tab actions ───────────────────────────────────────────────────

  async function deleteComment(commentId) {
    await apiCall('DELETE', `/api/admin/track-comments/${commentId}`, undefined, 'Comment deleted');
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, deleted_at: new Date().toISOString() } : c));
  }

  function refreshList() {
    loadList();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div style={styles.page}>
      {/* Left panel — track list */}
      <div style={styles.leftPanel}>
        <div style={styles.listControls}>
          <input
            style={styles.searchInput}
            type="search"
            placeholder="Search tracks..."
            value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
          />
          <div style={styles.filterRow}>
            <select
              style={styles.select}
              value={envFilter}
              onChange={e => { setEnvFilter(e.target.value); setOffset(0); }}
            >
              <option value="">All Environments</option>
              {envOptions.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <select
              style={styles.select}
              value={sortBy}
              onChange={e => { setSortBy(e.target.value); setOffset(0); }}
            >
              <option value="name">A–Z</option>
              <option value="plays">Most Played</option>
              <option value="last_played">Last Played</option>
              <option value="steam_score">Steam Rating</option>
            </select>
          </div>
          <div style={styles.listMeta}>
            {listLoading ? 'Loading…' : `${total} track${total !== 1 ? 's' : ''}`}
          </div>
        </div>

        <div style={styles.trackList}>
          {tracks.map(t => (
            <TrackListItem
              key={t.id}
              track={t}
              selected={selected?.id === t.id}
              onClick={() => selectTrack(t)}
            />
          ))}
          {!listLoading && tracks.length === 0 && (
            <div style={styles.empty}>No tracks found.</div>
          )}
        </div>

        {totalPages > 1 && (
          <div style={styles.pagination}>
            <button
              className="btn btn-outline"
              style={styles.pageBtn}
              disabled={offset === 0}
              onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
            >←</button>
            <span style={styles.pageInfo}>{currentPage}/{totalPages}</span>
            <button
              className="btn btn-outline"
              style={styles.pageBtn}
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(o => o + PAGE_SIZE)}
            >→</button>
          </div>
        )}
      </div>

      {/* Right panel — detail */}
      <div style={styles.rightPanel}>
        {!selected ? (
          <div style={styles.noSelection}>
            <p style={styles.noSelectionText}>Select a track to manage it</p>
          </div>
        ) : (
          <>
            <TrackDetailHeader track={selected} />

            {/* Tabs */}
            <div style={styles.tabs}>
              {['info', 'tags', 'playlists', 'comments'].map(tab => (
                <button
                  key={tab}
                  style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }}
                  onClick={() => loadTabData(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === 'playlists' && selected.playlist_count > 0 && (
                    <span style={styles.tabBadge}>{selected.playlist_count}</span>
                  )}
                  {tab === 'comments' && selected.comment_count > 0 && (
                    <span style={styles.tabBadge}>{selected.comment_count}</span>
                  )}
                  {tab === 'tags' && (selected.tag_count > 0 || selected.user_tag_count > 0) && (
                    <span style={styles.tabBadge}>{selected.tag_count + selected.user_tag_count}</span>
                  )}
                </button>
              ))}
            </div>

            <div style={styles.tabContent}>
              {activeTab === 'info' && (
                <InfoTab
                  track={selected}
                  editSteamId={editSteamId}
                  setEditSteamId={setEditSteamId}
                  editDuration={editDuration}
                  setEditDuration={setEditDuration}
                  saveSteamId={saveSteamId}
                  saveDuration={saveDuration}
                  fetchSteamMeta={fetchSteamMeta}
                  fetchingMeta={fetchingMeta}
                  savingField={savingField}
                />
              )}
              {activeTab === 'tags' && (
                <TagsTab
                  detail={detail}
                  allTags={allTags}
                  userTags={userTags}
                  addTagId={addTagId}
                  setAddTagId={setAddTagId}
                  addSystemTag={addSystemTag}
                  removeSystemTag={removeSystemTag}
                  removeUserTag={removeUserTag}
                />
              )}
              {activeTab === 'playlists' && (
                <PlaylistsTab
                  memberships={memberships}
                  allPlaylists={allPlaylists}
                  addPlaylistId={addPlaylistId}
                  setAddPlaylistId={setAddPlaylistId}
                  addToPlaylist={addToPlaylist}
                  addingPlaylist={addingPlaylist}
                  removeFromPlaylist={removeFromPlaylist}
                />
              )}
              {activeTab === 'comments' && (
                <CommentsTab
                  comments={comments}
                  deleteComment={deleteComment}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TrackListItem({ track, selected, onClick }) {
  const imgUrl = imageProxy(track.steam_preview_url);
  return (
    <div
      style={{
        ...styles.trackItem,
        ...(selected ? styles.trackItemSelected : {}),
      }}
      onClick={onClick}
    >
      <div style={styles.trackThumb}>
        {imgUrl
          ? <img src={imgUrl} alt="" style={styles.thumbImg} />
          : <div style={styles.thumbPlaceholder} />
        }
      </div>
      <div style={styles.trackItemInfo}>
        <div style={styles.trackItemName}>
          {track.steam_title || track.track}
        </div>
        <div style={styles.trackItemEnv}>{track.env}</div>
        <div style={styles.trackItemBadges}>
          {track.playlist_count > 0 && (
            <span style={styles.pill}>{track.playlist_count} playlist{track.playlist_count !== 1 ? 's' : ''}</span>
          )}
          {track.race_count > 0 && (
            <span style={styles.pill}>{track.race_count} races</span>
          )}
          {(track.tag_count > 0 || track.user_tag_count > 0) && (
            <span style={styles.pill}>{track.tag_count + track.user_tag_count} tags</span>
          )}
          {track.comment_count > 0 && (
            <span style={styles.pill}>{track.comment_count} comments</span>
          )}
          {!track.steam_id && (
            <span style={{ ...styles.pill, ...styles.pillWarn }}>No Steam ID</span>
          )}
        </div>
      </div>
    </div>
  );
}

function TrackDetailHeader({ track }) {
  const imgUrl = imageProxy(track.steam_preview_url);
  return (
    <div style={styles.detailHeader}>
      {imgUrl && <img src={imgUrl} alt="" style={styles.detailHeaderImg} />}
      <div style={styles.detailHeaderInfo}>
        <div style={styles.detailEnv}>{track.env}</div>
        <div style={styles.detailName}>{track.steam_title || track.track}</div>
        {track.steam_title && track.steam_title !== track.track && (
          <div style={styles.detailSubName}>{track.track}</div>
        )}
        {track.steam_author_name && (
          <div style={styles.detailAuthor}>by {track.steam_author_name}</div>
        )}
      </div>
    </div>
  );
}

function InfoTab({ track, editSteamId, setEditSteamId, editDuration, setEditDuration,
  saveSteamId, saveDuration, fetchSteamMeta, fetchingMeta, savingField }) {
  return (
    <div style={styles.infoTab}>
      {/* Steam ID */}
      <div style={styles.fieldGroup}>
        <label style={styles.fieldLabel}>Steam Workshop ID</label>
        <div style={styles.fieldRow}>
          <input
            style={styles.fieldInput}
            value={editSteamId}
            onChange={e => setEditSteamId(e.target.value)}
            placeholder="e.g. 12345678"
          />
          <button
            className="btn btn-primary"
            onClick={saveSteamId}
            disabled={savingField === 'steam_id'}
          >
            {savingField === 'steam_id' ? 'Saving…' : 'Save'}
          </button>
          {editSteamId && (
            <button
              className="btn btn-outline"
              onClick={fetchSteamMeta}
              disabled={fetchingMeta}
            >
              {fetchingMeta ? 'Fetching…' : 'Fetch Steam Data'}
            </button>
          )}
        </div>
        {track.steam_id && (
          <a
            href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${track.steam_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.workshopLink}
          >
            View on Steam Workshop ↗
          </a>
        )}
      </div>

      {/* Duration */}
      <div style={styles.fieldGroup}>
        <label style={styles.fieldLabel}>Race Duration (ms)</label>
        <div style={styles.fieldRow}>
          <input
            style={{ ...styles.fieldInput, maxWidth: 160 }}
            type="number"
            value={editDuration}
            onChange={e => setEditDuration(e.target.value)}
            placeholder="e.g. 90000"
          />
          <button
            className="btn btn-primary"
            onClick={saveDuration}
            disabled={savingField === 'duration'}
          >
            {savingField === 'duration' ? 'Saving…' : 'Save'}
          </button>
          {editDuration && (
            <span style={styles.durationHint}>{fmtMs(Number(editDuration))}</span>
          )}
        </div>
      </div>

      {/* Steam metadata (read-only) */}
      {track.steam_fetched_at && (
        <div style={styles.steamSection}>
          <div style={styles.steamSectionTitle}>
            Steam Metadata
            <span style={styles.fetchedAt}>fetched {fmtRelative(track.steam_fetched_at)}</span>
          </div>
          {track.steam_title && <InfoRow label="Title" value={track.steam_title} />}
          {track.steam_author_name && <InfoRow label="Author" value={track.steam_author_name} />}
          {track.steam_score != null && (
            <InfoRow label="Score" value={`${(track.steam_score * 100).toFixed(0)}%`} />
          )}
          {track.steam_subscriptions != null && (
            <InfoRow label="Subscribers" value={track.steam_subscriptions.toLocaleString()} />
          )}
          {track.steam_description && (
            <div style={styles.steamDesc}>
              <div style={styles.fieldLabel}>Description</div>
              <div style={styles.steamDescText}>{track.steam_description}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TagsTab({ detail, allTags, userTags, addTagId, setAddTagId, addSystemTag, removeSystemTag, removeUserTag }) {
  const systemTags = detail?.tags || [];
  const assignedIds = new Set(systemTags.map(t => t.id));
  const available = allTags.filter(t => !assignedIds.has(t.id));

  return (
    <div style={styles.tabSection}>
      {/* System tags */}
      <div style={styles.subSection}>
        <div style={styles.subSectionTitle}>System Tags</div>
        <div style={styles.tagCloud}>
          {systemTags.length === 0 && <span style={styles.muted}>No system tags assigned.</span>}
          {systemTags.map(t => (
            <span key={t.id} style={styles.tagChip}>
              {t.name}
              <button style={styles.tagRemove} onClick={() => removeSystemTag(t.id)} title="Remove">×</button>
            </span>
          ))}
        </div>
        {available.length > 0 && (
          <div style={styles.fieldRow}>
            <select
              style={styles.select}
              value={addTagId}
              onChange={e => setAddTagId(e.target.value)}
            >
              <option value="">Add tag…</option>
              {available.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button
              className="btn btn-primary"
              onClick={addSystemTag}
              disabled={!addTagId}
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* User tags */}
      <div style={styles.subSection}>
        <div style={styles.subSectionTitle}>Community Tags</div>
        {userTags.length === 0 && <span style={styles.muted}>No community tags yet.</span>}
        {userTags.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Label</th>
                <th style={styles.th}>Votes</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {userTags.map(t => (
                <tr key={t.label}>
                  <td style={styles.td}>{t.label}</td>
                  <td style={styles.td}>{t.votes}</td>
                  <td style={styles.td}>
                    <ConfirmButton
                      onConfirm={() => removeUserTag(t.label)}
                      className="btn btn-danger"
                    >Delete</ConfirmButton>
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

function PlaylistsTab({ memberships, allPlaylists, addPlaylistId, setAddPlaylistId,
  addToPlaylist, addingPlaylist, removeFromPlaylist }) {

  const memberIds = new Set(memberships.map(m => m.playlist_id));
  const available = allPlaylists.filter(p => !memberIds.has(p.id));

  return (
    <div style={styles.tabSection}>
      <div style={styles.subSection}>
        <div style={styles.subSectionTitle}>Current Playlist Membership</div>
        {memberships.length === 0 && (
          <span style={styles.muted}>Not in any playlists.</span>
        )}
        {memberships.length > 0 && (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Playlist</th>
                <th style={styles.th}>Position</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {memberships.map(m => (
                <tr key={m.playlist_track_id}>
                  <td style={styles.td}>{m.playlist_name}</td>
                  <td style={styles.td}>#{m.position + 1}</td>
                  <td style={styles.td}>
                    <ConfirmButton
                      onConfirm={() => removeFromPlaylist(m.playlist_track_id)}
                      className="btn btn-danger"
                    >Remove</ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={styles.subSection}>
        <div style={styles.subSectionTitle}>Add to Playlist</div>
        {available.length === 0 ? (
          <span style={styles.muted}>Already in all playlists.</span>
        ) : (
          <div style={styles.fieldRow}>
            <select
              style={styles.select}
              value={addPlaylistId}
              onChange={e => setAddPlaylistId(e.target.value)}
            >
              <option value="">Select playlist…</option>
              {available.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={addToPlaylist}
              disabled={!addPlaylistId || addingPlaylist}
            >
              {addingPlaylist ? 'Adding…' : 'Add'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsTab({ comments, deleteComment }) {
  if (comments.length === 0) {
    return <div style={styles.muted}>No comments yet.</div>;
  }

  return (
    <div style={styles.tabSection}>
      {comments.map(c => (
        <div
          key={c.id}
          style={{
            ...styles.commentCard,
            ...(c.deleted_at ? styles.commentDeleted : {}),
          }}
        >
          <div style={styles.commentMeta}>
            <span style={styles.commentAuthor}>{c.author_name}</span>
            {c.is_known_pilot && (
              <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>Pilot</span>
            )}
            <span style={styles.commentTime}>{fmtDate(c.created_at)}</span>
            {c.deleted_at && (
              <span className="badge badge-danger" style={{ fontSize: '0.7rem', marginLeft: 'auto' }}>Deleted</span>
            )}
            {!c.deleted_at && (
              <ConfirmButton
                onConfirm={() => deleteComment(c.id)}
                className="btn btn-danger"
              >Delete</ConfirmButton>
            )}
          </div>
          <div style={styles.commentBody}>{c.body}</div>
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoRowLabel}>{label}</span>
      <span style={styles.infoRowValue}>{value}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    display: 'flex',
    gap: 0,
    height: 'calc(100vh - 120px)',
    overflow: 'hidden',
  },

  // Left panel
  leftPanel: {
    width: 320,
    minWidth: 260,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #1e2d3d',
    background: '#0d1821',
    overflow: 'hidden',
  },
  listControls: {
    padding: '12px',
    borderBottom: '1px solid #1e2d3d',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  searchInput: {
    background: '#121923',
    border: '1px solid #1e2d3d',
    borderRadius: 6,
    color: '#f8fafc',
    fontFamily: 'Inter, sans-serif',
    fontSize: '0.85rem',
    padding: '7px 12px',
    width: '100%',
    boxSizing: 'border-box',
  },
  filterRow: { display: 'flex', gap: 6 },
  select: {
    flex: 1,
    background: '#121923',
    border: '1px solid #1e2d3d',
    borderRadius: 6,
    color: '#f8fafc',
    fontFamily: 'Inter, sans-serif',
    fontSize: '0.8rem',
    padding: '6px 8px',
  },
  listMeta: {
    fontSize: '0.75rem',
    color: '#6b7a8d',
  },
  trackList: {
    flex: 1,
    overflowY: 'auto',
  },
  trackItem: {
    display: 'flex',
    gap: 10,
    padding: '10px 12px',
    cursor: 'pointer',
    borderBottom: '1px solid #1e2d3d',
    transition: 'background 0.1s',
  },
  trackItemSelected: {
    background: '#1a2430',
    borderLeft: '3px solid #ff7a00',
    paddingLeft: 9,
  },
  trackThumb: {
    width: 56,
    height: 36,
    borderRadius: 4,
    overflow: 'hidden',
    flexShrink: 0,
    background: '#1a2430',
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbPlaceholder: { width: '100%', height: '100%', background: '#1e2d3d' },
  trackItemInfo: { flex: 1, minWidth: 0 },
  trackItemName: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#f8fafc',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  trackItemEnv: { fontSize: '0.72rem', color: '#ff7a00', fontWeight: 600, marginBottom: 3 },
  trackItemBadges: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  pill: {
    fontSize: '0.68rem',
    padding: '1px 6px',
    background: '#1e2d3d',
    borderRadius: 999,
    color: '#b6c2cf',
  },
  pillWarn: { background: '#2d1a0a', color: '#f59e0b' },
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px',
    borderTop: '1px solid #1e2d3d',
  },
  pageBtn: { padding: '4px 12px' },
  pageInfo: { fontSize: '0.8rem', color: '#6b7a8d' },
  empty: { padding: 20, color: '#6b7a8d', textAlign: 'center', fontSize: '0.85rem' },

  // Right panel
  rightPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#0b0f14',
  },
  noSelection: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noSelectionText: { color: '#6b7a8d', fontSize: '0.9rem' },

  // Detail header
  detailHeader: {
    display: 'flex',
    gap: 16,
    padding: '16px 20px',
    borderBottom: '1px solid #1e2d3d',
    alignItems: 'center',
    background: '#0d1821',
  },
  detailHeaderImg: {
    width: 120,
    height: 68,
    objectFit: 'cover',
    borderRadius: 6,
    flexShrink: 0,
  },
  detailHeaderInfo: { flex: 1, minWidth: 0 },
  detailEnv: { fontSize: '0.72rem', color: '#ff7a00', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 },
  detailName: { fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', lineHeight: 1.2 },
  detailSubName: { fontSize: '0.78rem', color: '#6b7a8d', marginTop: 2 },
  detailAuthor: { fontSize: '0.82rem', color: '#b6c2cf', marginTop: 2 },

  // Tabs
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #1e2d3d',
    background: '#0d1821',
    padding: '0 20px',
  },
  tab: {
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#b6c2cf',
    fontFamily: 'Inter, sans-serif',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'color 0.15s',
    marginBottom: -1,
  },
  tabActive: {
    borderBottomColor: '#ff7a00',
    color: '#ff7a00',
  },
  tabBadge: {
    background: '#1e2d3d',
    borderRadius: 999,
    fontSize: '0.7rem',
    padding: '1px 6px',
    color: '#b6c2cf',
  },
  tabContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  },

  // Info tab
  infoTab: { display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  fieldLabel: { fontSize: '0.8rem', color: '#b6c2cf', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  fieldRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  fieldInput: {
    flex: 1,
    background: '#121923',
    border: '1px solid #1e2d3d',
    borderRadius: 6,
    color: '#f8fafc',
    fontFamily: 'Inter, sans-serif',
    fontSize: '0.9rem',
    padding: '7px 12px',
    minWidth: 0,
  },
  durationHint: { fontSize: '0.8rem', color: '#6b7a8d' },
  workshopLink: { fontSize: '0.8rem', color: '#ff7a00', textDecoration: 'none' },
  steamSection: {
    background: '#121923',
    border: '1px solid #1e2d3d',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  steamSectionTitle: {
    fontSize: '0.82rem',
    fontWeight: 700,
    color: '#b6c2cf',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  fetchedAt: { fontSize: '0.75rem', color: '#6b7a8d', fontWeight: 400, textTransform: 'none', letterSpacing: 0 },
  infoRow: { display: 'flex', gap: 12, alignItems: 'baseline' },
  infoRowLabel: { fontSize: '0.78rem', color: '#6b7a8d', width: 90, flexShrink: 0 },
  infoRowValue: { fontSize: '0.85rem', color: '#f8fafc' },
  steamDesc: { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 },
  steamDescText: { fontSize: '0.83rem', color: '#b6c2cf', lineHeight: 1.5, whiteSpace: 'pre-wrap' },

  // Tags tab
  tabSection: { display: 'flex', flexDirection: 'column', gap: 24 },
  subSection: { display: 'flex', flexDirection: 'column', gap: 10 },
  subSectionTitle: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#b6c2cf',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    paddingBottom: 6,
    borderBottom: '1px solid #1e2d3d',
  },
  tagCloud: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    background: '#1e2d3d',
    borderRadius: 999,
    fontSize: '0.82rem',
    color: '#f8fafc',
  },
  tagRemove: {
    background: 'none',
    border: 'none',
    color: '#6b7a8d',
    cursor: 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
    padding: 0,
  },
  muted: { fontSize: '0.85rem', color: '#6b7a8d' },

  // Table
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
  th: {
    textAlign: 'left',
    padding: '6px 12px',
    borderBottom: '1px solid #1e2d3d',
    color: '#6b7a8d',
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  td: { padding: '8px 12px', borderBottom: '1px solid #1a2430', color: '#f8fafc' },

  // Comments
  commentCard: {
    background: '#121923',
    border: '1px solid #1e2d3d',
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 10,
  },
  commentDeleted: { opacity: 0.5 },
  commentMeta: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  commentAuthor: { fontWeight: 600, fontSize: '0.88rem' },
  commentTime: { fontSize: '0.78rem', color: '#6b7a8d' },
  commentBody: { fontSize: '0.85rem', lineHeight: 1.5, color: '#b6c2cf', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
};
