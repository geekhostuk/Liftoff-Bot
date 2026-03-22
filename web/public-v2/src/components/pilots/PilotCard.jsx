import RankMedal from '../ui/RankMedal';
import { fmtMs, fmtNumber } from '../../lib/fmt';
import './PilotCard.css';

export default function PilotCard({ pilot, onClick }) {
  return (
    <div className="pilot-card" onClick={() => onClick && onClick(pilot.pilot_key)}>
      <div className="pilot-card-rank">
        {pilot.season_rank ? <RankMedal rank={pilot.season_rank} /> : <span className="text-muted">&mdash;</span>}
      </div>
      <div className="pilot-card-info">
        <div className="pilot-card-name">{pilot.display_name || pilot.nick}</div>
        <div className="pilot-card-stats">
          {pilot.total_laps != null && <span>{fmtNumber(pilot.total_laps)} laps</span>}
          {pilot.best_lap_ms != null && <span>Best: {fmtMs(pilot.best_lap_ms)}</span>}
          {pilot.races_entered != null && <span>{fmtNumber(pilot.races_entered)} races</span>}
        </div>
      </div>
      <div className="pilot-card-points">
        {pilot.season_points != null && pilot.season_points > 0 ? (
          <>
            <span className="pilot-card-pts-value">{pilot.season_points}</span>
            <span className="pilot-card-pts-label">pts</span>
          </>
        ) : (
          <span className="text-muted">&mdash;</span>
        )}
      </div>
    </div>
  );
}
