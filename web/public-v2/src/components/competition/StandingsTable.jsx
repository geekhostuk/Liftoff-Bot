import { useRef, useEffect, useState, useMemo } from 'react';
import RankMedal from '../ui/RankMedal';
import './StandingsTable.css';

const PAGE_SIZE = 20;

/**
 * Reusable standings table for both season and weekly views.
 * Shows top 20 by default with search and "show more" controls.
 */
export default function StandingsTable({ standings, variant = 'season', onPilotClick, flashKeys }) {
  const prevKeysRef = useRef(new Set());
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (flashKeys) {
      prevKeysRef.current = flashKeys;
    }
  }, [flashKeys]);

  // Reset expansion when standings data changes
  useEffect(() => {
    setExpanded(false);
  }, [standings]);

  const isSearching = search.trim().length > 0;

  const filtered = useMemo(() => {
    if (!standings) return [];
    if (!isSearching) return standings;
    const q = search.trim().toLowerCase();
    return standings.filter(s => s.display_name.toLowerCase().includes(q));
  }, [standings, search, isSearching]);

  // When searching, show all matches; otherwise respect the page limit
  const visible = isSearching || expanded ? filtered : filtered.slice(0, PAGE_SIZE);
  const hasMore = !isSearching && !expanded && filtered.length > PAGE_SIZE;
  const hiddenCount = filtered.length - PAGE_SIZE;

  if (!standings || standings.length === 0) {
    return (
      <div className="table-wrap">
        <table className="data-table standings-table">
          <tbody>
            <tr className="empty-row">
              <td colSpan={variant === 'season' ? 9 : 9}>
                {variant === 'season' ? 'No competition data yet.' : 'No results for this week yet.'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const isSeason = variant === 'season';

  return (
    <div className="standings-container">
      {/* Search + count bar */}
      <div className="standings-toolbar">
        <input
          type="text"
          className="standings-search"
          placeholder="Search pilot..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="standings-count">
          {isSearching
            ? `${filtered.length} of ${standings.length} pilots`
            : expanded
              ? `${standings.length} pilots`
              : `Top ${Math.min(PAGE_SIZE, standings.length)} of ${standings.length} pilots`}
        </span>
      </div>

      <div className="table-wrap">
        <table className="data-table standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pilot</th>
              <th>Total</th>
              {isSeason && <th>Wks</th>}
              <th>Pos</th>
              <th>Laps</th>
              <th>Con</th>
              {!isSeason && <th>Str</th>}
              <th>Imp</th>
              <th>Part</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s, i) => {
              // Use original index for season rank (find it in full standings array)
              const originalIndex = standings.indexOf(s);
              const rank = isSeason ? originalIndex + 1 : s.rank;
              const shouldFlash = flashKeys && flashKeys.has(s.pilot_key);
              return (
                <tr key={s.pilot_key} className={shouldFlash ? 'row-flash' : ''}>
                  <td className="rank">
                    <RankMedal rank={rank} />
                  </td>
                  <td
                    className="pilot-name"
                    onClick={() => onPilotClick && onPilotClick(s.pilot_key)}
                  >
                    {s.display_name}
                  </td>
                  <td className="pts pts-highlight">{s.total_points}</td>
                  {isSeason && <td className="pts-sub">{s.weeks_active || 0}</td>}
                  <td className="pts-sub">{s.position_points}</td>
                  <td className="pts-sub">{s.laps_points}</td>
                  <td className="pts-sub">{s.consistency_points}</td>
                  {!isSeason && <td className="pts-sub">{s.streak_points}</td>}
                  <td className="pts-sub">{s.improved_points}</td>
                  <td className="pts-sub">{s.participation_points}</td>
                </tr>
              );
            })}
            {isSearching && filtered.length === 0 && (
              <tr className="empty-row">
                <td colSpan={isSeason ? 9 : 9}>No pilots match "{search}"</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Show more / collapse controls */}
      {hasMore && (
        <button className="standings-toggle" onClick={() => setExpanded(true)}>
          Show all pilots (+{hiddenCount} more)
        </button>
      )}
      {expanded && !isSearching && standings.length > PAGE_SIZE && (
        <button className="standings-toggle" onClick={() => setExpanded(false)}>
          Show top {PAGE_SIZE} only
        </button>
      )}
    </div>
  );
}
