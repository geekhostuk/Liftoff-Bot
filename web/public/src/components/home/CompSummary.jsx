import { Link } from 'react-router-dom';
import { fmtDate } from '../../lib/fmt';
import CountdownBlock from '../ui/CountdownBlock';
import './CompSummary.css';

export default function CompSummary({ competition, currentWeek }) {
  if (!competition) return null;

  const weekInfo = currentWeek
    ? `Week ${currentWeek.week_number} \u00b7 ${fmtDate(currentWeek.starts_at)} \u2013 ${fmtDate(currentWeek.ends_at)}`
    : 'Between weeks';

  return (
    <Link to="/competition" className="comp-summary-card">
      <div className="comp-summary-info">
        <div className="comp-summary-label">Active Competition</div>
        <div className="comp-summary-name">{competition.name}</div>
        <div className="comp-summary-week">{weekInfo}</div>
      </div>
      {currentWeek && (
        <CountdownBlock endDate={currentWeek.ends_at} />
      )}
    </Link>
  );
}
