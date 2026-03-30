import { fmtMs, fmtDateTime } from '../../lib/fmt';

export default function RecentRaces({ races }) {
  if (!races || races.length === 0) return null;

  return (
    <div className="profile-table-section">
      <h2>Recent Races</h2>
      <div className="profile-table-wrap">
        <table className="profile-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Track</th>
              <th>Pos</th>
              <th>Pilots</th>
              <th>Best Lap</th>
              <th>Laps</th>
            </tr>
          </thead>
          <tbody>
            {races.map(r => (
              <tr key={r.race_id}>
                <td className="text-muted">{fmtDateTime(r.started_at)}</td>
                <td>{r.track}</td>
                <td>
                  <span className={`pos-badge pos-${r.position <= 3 ? r.position : 'other'}`}>
                    P{r.position}
                  </span>
                </td>
                <td className="text-muted">{r.participants}</td>
                <td>{fmtMs(r.best_lap_ms)}</td>
                <td>{r.total_laps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
