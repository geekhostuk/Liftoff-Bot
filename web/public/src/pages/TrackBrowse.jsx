import { useState, useEffect, useRef } from 'react';
import useApi from '../hooks/useApi';
import { getBrowseTracks } from '../lib/api';
import { Loading, ErrorState, Empty } from '../components/ui/EmptyState';
import TrackCard from '../components/browse/TrackCard';
import './TrackBrowse.css';

const PAGE_SIZE = 24;

export default function TrackBrowse() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  function handleSortChange(e) {
    setSort(e.target.value);
    setOffset(0);
  }

  const { data, loading, error, refetch } = useApi(
    () => getBrowseTracks({ search: debouncedSearch, sort, limit: PAGE_SIZE, offset }),
    [debouncedSearch, sort, offset]
  );

  const tracks = data?.tracks || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="track-browse-page">
      <h1 className="track-browse-title"><span className="accent">Track Browser</span></h1>
      <p className="track-browse-subtitle">
        Explore all tracks flown on the server, with stats, leaderboards, and community notes.
      </p>

      <div className="track-browse-controls">
        <input
          className="track-browse-search"
          type="search"
          placeholder="Search tracks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="track-browse-sort"
          value={sort}
          onChange={handleSortChange}
        >
          <option value="name">Name</option>
          <option value="plays">Most Played</option>
          <option value="last_played">Recently Played</option>
          <option value="steam_score">Steam Rating</option>
        </select>
      </div>

      {loading && <Loading message="Loading tracks..." />}
      {error && <ErrorState message="Failed to load tracks." onRetry={refetch} />}

      {!loading && !error && tracks.length === 0 && (
        <Empty message={debouncedSearch ? `No tracks matching "${debouncedSearch}".` : 'No tracks found.'} />
      )}

      {!loading && !error && tracks.length > 0 && (
        <>
          <div className="track-browse-total">{total} track{total !== 1 ? 's' : ''}</div>
          <div className="track-browse-grid">
            {tracks.map(t => (
              <TrackCard key={`${t.env}/${t.track}`} track={t} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="track-browse-pagination">
              <button
                className="btn btn-outline"
                disabled={offset === 0}
                onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              >
                Previous
              </button>
              <span className="track-browse-page-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                className="btn btn-outline"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(o => o + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
