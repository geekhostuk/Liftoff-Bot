import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Map } from 'lucide-react';
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
            <button
              className="btn-outline"
              style={{ ...styles.refreshBtn, opacity: unfetchedCount === 0 ? 0.5 : 1 }}
              onClick={handleFetchAll}
              disabled={fetchingAll || unfetchedCount === 0}
            >
              <RefreshCw size={14} style={{ marginRight: 6 }} />
              {fetchingAll ? 'Fetching…' : 'Fetch Missing'}
            </button>
          </div>

          <div style={styles.statusLine}>
            <span style={styles.statBadge}>{workshopTracks.length} with Steam ID</span>
            <span style={styles.statBadge}>{fetchedTracks.length} fetched</span>
            {unfetchedCount > 0 && <span style={styles.statBadge}>{unfetchedCount} missing</span>}
            {unfetchedCount === 0 && <span style={styles.timestamp}>All tracks fetched</span>}
          </div>
        </div>
      )}
    </div>
  );
}


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
};
