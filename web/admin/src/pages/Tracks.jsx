import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Map, ExternalLink } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/feedback/Toast.jsx';
import { useWsEvent } from '../context/WebSocketContext.jsx';
import CascadeSelect from '../components/form/CascadeSelect.jsx';
import { fmtDateTime } from '../lib/fmt.js';

export default function Tracks() {
  const { apiFetch, apiCall } = useApi();
  const { toast } = useToast();

  const [catalog, setCatalog] = useState(null);
  const [selected, setSelected] = useState(null);

  const [workshopTracks, setWorkshopTracks] = useState([]);
  const [fetchingAll, setFetchingAll] = useState(false);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/catalog');
      setCatalog(data);
    } catch (err) {
      toast('Failed to load catalog', 'error');
    }
  }, [apiFetch, toast]);

  const loadWorkshopTracks = useCallback(async () => {
    try {
      const data = await apiFetch('GET', '/api/admin/tracks');
      setWorkshopTracks(data.filter(t => t.steam_id));
    } catch {
      // non-critical
    }
  }, [apiFetch]);

  useEffect(() => {
    loadCatalog();
    loadWorkshopTracks();
  }, [loadCatalog, loadWorkshopTracks]);

  useWsEvent('track_catalog', loadCatalog);

  const handleSetTrack = async () => {
    if (!selected) {
      toast('Select a track first', 'warning');
      return;
    }
    await apiCall('POST', '/api/admin/track/set', {
      env: selected.env,
      track: selected.track,
      race: selected.race,
    }, 'Track set');
  };

  const handleNextTrack = async () => {
    await apiCall('POST', '/api/admin/track/next', null, 'Advanced to next track');
  };

  const handleRefresh = async () => {
    await apiCall('POST', '/api/admin/catalog/refresh', null, 'Catalog refresh triggered');
    setTimeout(loadCatalog, 3000);
  };

  const handleFetchAll = async () => {
    setFetchingAll(true);
    try {
      const result = await apiFetch('POST', '/api/admin/tracks/steam-fetch-all');
      toast(`Fetched ${result.updated} track(s)${result.errors.length ? `, ${result.errors.length} error(s)` : ''}`, result.errors.length ? 'warning' : 'success');
      await loadWorkshopTracks();
    } catch {
      toast('Fetch all failed', 'error');
    } finally {
      setFetchingAll(false);
    }
  };

  const envCount = catalog?.environments?.length ?? 0;
  const trackCount = catalog?.environments?.reduce((sum, e) => sum + (e.tracks?.length ?? 0), 0) ?? 0;
  const modeCount = catalog?.game_modes?.length ?? 0;

  const fetchedTracks = workshopTracks.filter(t => t.steam_preview_url);
  const unfetchedCount = workshopTracks.length - fetchedTracks.length;

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>
        <Map size={22} style={{ marginRight: 8 }} />
        Track Management
      </h1>

      {/* Card 1: Track Control */}
      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Track Control</h2>
        <div style={styles.controlRow}>
          <div style={styles.selectWrap}>
            <CascadeSelect
              catalog={catalog}
              onSelect={setSelected}
              showMode
            />
          </div>
          <div style={styles.buttonGroup}>
            <button
              className="btn-primary"
              style={styles.btn}
              onClick={handleSetTrack}
              disabled={!selected}
            >
              Set Track
            </button>
            <button
              className="btn-outline"
              style={styles.btn}
              onClick={handleNextTrack}
            >
              Next Track
            </button>
          </div>
        </div>
      </div>

      {/* Card 2: Track Catalog */}
      <div style={styles.card}>
        <div style={styles.catalogHeader}>
          <h2 style={styles.cardTitle}>Track Catalog</h2>
          <button
            className="btn-outline"
            style={styles.refreshBtn}
            onClick={handleRefresh}
          >
            <RefreshCw size={14} style={{ marginRight: 6 }} />
            Refresh Catalog
          </button>
        </div>

        <div style={styles.statusLine}>
          <span style={styles.statBadge}>{envCount} environments</span>
          <span style={styles.statBadge}>{trackCount} tracks</span>
          <span style={styles.statBadge}>{modeCount} game modes</span>
          {catalog?.timestamp_utc && (
            <span style={styles.timestamp}>
              Last refresh: {fmtDateTime(catalog.timestamp_utc)}
            </span>
          )}
        </div>
      </div>

      {/* Card 3: Steam Workshop */}
      {workshopTracks.length > 0 && (
        <div style={styles.card}>
          <div style={styles.catalogHeader}>
            <h2 style={styles.cardTitle}>Steam Workshop</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {unfetchedCount > 0 && (
                <span style={styles.timestamp}>{unfetchedCount} not yet fetched</span>
              )}
              <button
                className="btn-outline"
                style={styles.refreshBtn}
                onClick={handleFetchAll}
                disabled={fetchingAll}
              >
                <RefreshCw size={14} style={{ marginRight: 6, animation: fetchingAll ? 'spin 1s linear infinite' : 'none' }} />
                {fetchingAll ? 'Fetching…' : 'Fetch All'}
              </button>
            </div>
          </div>

          <div style={styles.statusLine}>
            <span style={styles.statBadge}>{workshopTracks.length} with Steam ID</span>
            <span style={styles.statBadge}>{fetchedTracks.length} fetched</span>
          </div>

          {fetchedTracks.length > 0 && (
            <div style={styles.workshopGrid}>
              {fetchedTracks.map(track => (
                <WorkshopCard key={track.id} track={track} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkshopCard({ track }) {
  return (
    <div style={cardStyles.wrapper}>
      <a
        href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${track.steam_id}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', flexShrink: 0 }}
      >
        {track.steam_preview_url
          ? <img src={track.steam_preview_url} alt={track.steam_title || track.track} style={cardStyles.img} />
          : <div style={cardStyles.imgPlaceholder} />
        }
      </a>
      <div style={cardStyles.body}>
        <div style={cardStyles.title} title={track.steam_title || track.track}>
          {track.steam_title || track.track}
        </div>
        <div style={cardStyles.env}>{track.env}</div>
        {track.steam_author_id && (
          <a
            href={`https://steamcommunity.com/profiles/${track.steam_author_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={cardStyles.author}
          >
            {track.steam_author_name || track.steam_author_id}
          </a>
        )}
        <div style={cardStyles.meta}>
          {track.steam_subscriptions != null && (
            <span>⭐ {track.steam_subscriptions.toLocaleString()}</span>
          )}
          {track.steam_score != null && (
            <span>👍 {Math.round(track.steam_score * 100)}%</span>
          )}
          <a
            href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${track.steam_id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: 'auto', color: 'var(--color-primary)' }}
            title="Open on Steam"
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

const cardStyles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-surface-alt, rgba(255,255,255,0.04))',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-sm, 4px)',
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    aspectRatio: '16/9',
    objectFit: 'cover',
    display: 'block',
  },
  imgPlaceholder: {
    width: '100%',
    aspectRatio: '16/9',
    background: 'var(--bg-surface)',
  },
  body: {
    padding: '0.5rem 0.625rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    flex: 1,
  },
  title: {
    fontWeight: 600,
    fontSize: '0.8125rem',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  env: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  },
  author: {
    fontSize: '0.775rem',
    color: 'var(--color-primary)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
    marginTop: '0.125rem',
  },
};

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '1.5rem',
    maxWidth: 960,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '1.5rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    margin: 0,
  },
  card: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-md)',
    padding: '1.25rem 1.5rem',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    margin: '0 0 1rem 0',
  },
  controlRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  selectWrap: {
    flex: 1,
  },
  buttonGroup: {
    display: 'flex',
    gap: '0.75rem',
  },
  btn: {
    padding: '0.5rem 1.25rem',
    cursor: 'pointer',
  },
  catalogHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.25rem',
  },
  refreshBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.4rem 0.9rem',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  statusLine: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  statBadge: {
    background: 'var(--bg-surface-alt)',
    color: 'var(--color-primary)',
    padding: '0.25rem 0.65rem',
    borderRadius: '4px',
    fontSize: '0.82rem',
    fontWeight: 600,
  },
  timestamp: {
    color: 'var(--text-muted)',
    fontSize: '0.82rem',
    marginLeft: 'auto',
  },
  workshopGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.75rem',
  },
};
