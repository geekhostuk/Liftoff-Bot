import { useState, useEffect } from 'react';
import { getPilotDetail } from '../../lib/api';
import RankMedal from '../ui/RankMedal';
import { Loading } from '../ui/EmptyState';
import './PilotDetail.css';

export default function PilotDetail({ pilotKey, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pilotKey) return;
    setLoading(true);
    getPilotDetail(pilotKey)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [pilotKey]);

  if (!pilotKey) return null;

  const ws = data?.weeklyStandings || [];
  const displayName = ws.length > 0 ? ws[0].display_name : pilotKey;
  const maxPts = Math.max(...ws.map(w => w.total_points), 1);

  return (
    <div className="pilot-detail-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pilot-detail-panel">
        <div className="pilot-detail-header">
          <h3>{displayName}</h3>
          <button className="btn btn-ghost pilot-detail-close" onClick={onClose}>&times;</button>
        </div>

        {loading ? (
          <Loading message="Loading pilot data..." />
        ) : ws.length === 0 ? (
          <p className="text-muted" style={{ padding: 'var(--space-lg)', textAlign: 'center' }}>
            No competition data for this pilot.
          </p>
        ) : (
          <>
            {/* Bar chart */}
            <div className="pilot-bars">
              {ws.map(w => {
                const h = Math.max(4, (w.total_points / maxPts) * 56);
                return (
                  <div key={w.week_number} className="pilot-bar-col">
                    <div
                      className="pilot-bar"
                      style={{ height: `${h}px` }}
                      title={`Week ${w.week_number}: ${w.total_points} pts`}
                    />
                    <span className="pilot-bar-label">W{w.week_number}</span>
                  </div>
                );
              })}
            </div>

            {/* Breakdown table */}
            <div className="table-wrap">
              <table className="data-table pilot-detail-table">
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Rank</th>
                    <th>Total</th>
                    <th>Pos</th>
                    <th>Laps</th>
                    <th>Con</th>
                    <th>Imp</th>
                    <th>Part</th>
                  </tr>
                </thead>
                <tbody>
                  {ws.map(w => (
                    <tr key={w.week_number}>
                      <td>Week {w.week_number}</td>
                      <td className="rank">{w.rank ? <RankMedal rank={w.rank} /> : '\u2014'}</td>
                      <td className="pts">{w.total_points}</td>
                      <td className="pts-sub">{w.position_points}</td>
                      <td className="pts-sub">{w.laps_points}</td>
                      <td className="pts-sub">{w.consistency_points}</td>
                      <td className="pts-sub">{w.improved_points}</td>
                      <td className="pts-sub">{w.participation_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
