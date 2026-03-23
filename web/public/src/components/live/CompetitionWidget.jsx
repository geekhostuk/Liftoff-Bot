import { Link } from 'react-router-dom';
import RankMedal from '../ui/RankMedal';
import Badge from '../ui/Badge';
import './CompetitionWidget.css';

export default function CompetitionWidget({ competition, currentWeek, standings }) {
  if (!competition) return null;

  const top5 = (standings || []).slice(0, 5);

  return (
    <div className="comp-widget card">
      <div className="comp-widget-header">
        <h3 className="comp-widget-title">Competition</h3>
        <Badge variant="primary">Live</Badge>
      </div>
      <div className="comp-widget-name">{competition.name}</div>
      <div className="comp-widget-week">
        {currentWeek
          ? `Week ${currentWeek.week_number} in progress`
          : 'Between weeks'}
      </div>

      {top5.length > 0 && (
        <div className="comp-widget-standings">
          {top5.map((s, i) => (
            <div key={s.pilot_key || i} className="comp-widget-row">
              <RankMedal rank={i + 1} />
              <span className="comp-widget-pilot">{s.display_name}</span>
              <span className="comp-widget-pts">{s.total_points} pts</span>
            </div>
          ))}
        </div>
      )}

      <Link to="/competition" className="btn btn-ghost comp-widget-link">
        View Full Standings
      </Link>
    </div>
  );
}
