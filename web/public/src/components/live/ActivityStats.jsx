import StatCard from '../ui/StatCard';
import { fmtNumber } from '../../lib/fmt';
import './ActivityStats.css';

export default function ActivityStats({ pilotActivity, statsOverview }) {
  return (
    <div className="activity-stats">
      <h3 className="activity-stats-title">Server Stats</h3>
      <div className="activity-stats-grid">
        <StatCard label="Pilots (24h)" value={fmtNumber(pilotActivity?.last_24h)} accent />
        <StatCard label="Pilots (7d)" value={fmtNumber(pilotActivity?.last_7d)} />
        <StatCard label="Pilots (30d)" value={fmtNumber(pilotActivity?.last_30d)} />
        <StatCard label="Total Laps" value={fmtNumber(statsOverview?.total_laps)} accent />
        <StatCard label="Total Pilots" value={fmtNumber(statsOverview?.total_pilots)} />
        <StatCard label="Total Races" value={fmtNumber(statsOverview?.total_races)} />
      </div>
    </div>
  );
}
