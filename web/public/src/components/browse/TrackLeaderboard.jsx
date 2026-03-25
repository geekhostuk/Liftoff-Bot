import useApi from '../../hooks/useApi';
import { getTrackDetailLeaderboard } from '../../lib/api';
import { fmtMs, fmtNumber } from '../../lib/fmt';
import { Loading, ErrorState, Empty } from '../ui/EmptyState';
import RankMedal from '../ui/RankMedal';
import './TrackLeaderboard.css';

export default function TrackLeaderboard({ env, track }) {
  const { data, loading, error } = useApi(
    () => getTrackDetailLeaderboard(env, track),
    [env, track]
  );

  if (loading) return <Loading message="Loading leaderboard..." />;
  if (error) return <ErrorState message="Failed to load leaderboard." />;
  if (!data || data.length === 0) return <Empty message="No laps recorded yet." />;

  return (
    <table className="browse-leaderboard-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Pilot</th>
          <th>Best Lap</th>
          <th>Total Laps</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={row.pilot_key || i}>
            <td><RankMedal rank={i + 1} /></td>
            <td className="browse-leaderboard-nick">{row.nick || row.pilot_key}</td>
            <td className="browse-leaderboard-time">{fmtMs(row.best_lap_ms)}</td>
            <td>{fmtNumber(row.total_laps)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
