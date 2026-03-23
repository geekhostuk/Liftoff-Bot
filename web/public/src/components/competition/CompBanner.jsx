import { fmtDate } from '../../lib/fmt';
import CountdownBlock from '../ui/CountdownBlock';
import './CompBanner.css';

export default function CompBanner({ competition, currentWeek }) {
  if (!competition) {
    return (
      <div className="comp-banner comp-banner-inactive">
        <p>No active competition right now. Check back soon!</p>
      </div>
    );
  }

  const weekInfo = currentWeek
    ? `Week ${currentWeek.week_number} \u00b7 ${fmtDate(currentWeek.starts_at)} \u2013 ${fmtDate(currentWeek.ends_at)}`
    : 'Between weeks';

  return (
    <div className="comp-banner">
      <div className="comp-banner-info">
        <h1 className="comp-banner-title">{competition.name}</h1>
        <p className="comp-banner-week">{weekInfo}</p>
      </div>
      {currentWeek && (
        <CountdownBlock endDate={currentWeek.ends_at} />
      )}
    </div>
  );
}
