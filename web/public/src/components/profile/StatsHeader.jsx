import StatCard from '../ui/StatCard';
import { fmtNumber, fmtDate } from '../../lib/fmt';

export default function StatsHeader({ summary }) {
  if (!summary) return null;
  return (
    <div className="profile-stats-header grid-5">
      <StatCard label="Total Laps" value={fmtNumber(summary.total_laps)} />
      <StatCard label="Races" value={fmtNumber(summary.races_entered)} />
      <StatCard label="Avg Off Record" value={summary.avg_pct_off_record != null ? `+${summary.avg_pct_off_record}%` : '--'} accent />
      <StatCard label="Tracks Flown" value={fmtNumber(summary.tracks_flown)} />
      <StatCard label="Member Since" value={fmtDate(summary.first_race_date)} />
    </div>
  );
}
