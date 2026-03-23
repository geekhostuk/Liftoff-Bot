import { useState, useMemo } from 'react';
import useApi from '../hooks/useApi';
import { getPlayers, getSeasonStandings } from '../lib/api';
import PilotSearch from '../components/pilots/PilotSearch';
import PilotCard from '../components/pilots/PilotCard';
import PilotDetail from '../components/competition/PilotDetail';
import { Loading, ErrorState, Empty } from '../components/ui/EmptyState';
import './Pilots.css';

export default function Pilots() {
  const [search, setSearch] = useState('');
  const [selectedPilot, setSelectedPilot] = useState(null);

  const { data: players, loading: pLoading, error: pError, refetch: refetchPlayers } = useApi(
    () => getPlayers().catch(() => []), []
  );
  const { data: seasonStandings } = useApi(
    () => getSeasonStandings().catch(() => []), []
  );

  // Merge players with season standings
  const merged = useMemo(() => {
    if (!players) return [];

    const seasonMap = new Map();
    if (seasonStandings) {
      for (const s of seasonStandings) {
        seasonMap.set(s.pilot_key, s);
      }
    }

    const result = players.map(p => {
      const season = seasonMap.get(p.pilot_key);
      return {
        pilot_key: p.pilot_key,
        nick: p.nick,
        display_name: season?.display_name || p.nick,
        total_laps: p.total_laps,
        best_lap_ms: p.best_lap_ms,
        races_entered: p.races_entered,
        season_rank: season ? seasonStandings.indexOf(season) + 1 : null,
        season_points: season?.total_points || 0,
      };
    });

    // Sort by season rank first (ranked pilots on top), then by total laps
    result.sort((a, b) => {
      if (a.season_rank && b.season_rank) return a.season_rank - b.season_rank;
      if (a.season_rank) return -1;
      if (b.season_rank) return 1;
      return (b.total_laps || 0) - (a.total_laps || 0);
    });

    return result;
  }, [players, seasonStandings]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return merged;
    const q = search.toLowerCase();
    return merged.filter(p =>
      (p.display_name || p.nick || '').toLowerCase().includes(q)
    );
  }, [merged, search]);

  if (pLoading) return <Loading message="Loading pilots..." />;
  if (pError) return <ErrorState message="Failed to load pilots." onRetry={refetchPlayers} />;

  return (
    <div className="pilots-page">
      <h1 className="pilots-title"><span className="accent">Pilots</span></h1>
      <p className="pilots-subtitle">
        All pilots who have raced in the league. Ranked pilots from the current season are shown first.
      </p>

      <PilotSearch value={search} onChange={setSearch} />

      {filtered.length === 0 ? (
        <Empty message={search ? 'No pilots match your search.' : 'No pilots found.'} />
      ) : (
        <div className="pilots-list">
          {filtered.map(p => (
            <PilotCard
              key={p.pilot_key}
              pilot={p}
              onClick={setSelectedPilot}
            />
          ))}
        </div>
      )}

      {selectedPilot && (
        <PilotDetail pilotKey={selectedPilot} onClose={() => setSelectedPilot(null)} />
      )}
    </div>
  );
}
