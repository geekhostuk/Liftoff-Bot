import { Link } from 'react-router-dom';
import RankMedal from '../ui/RankMedal';
import './TopPilots.css';

const MEDAL_COLORS = ['var(--rank-gold)', 'var(--rank-silver)', 'var(--rank-bronze)'];

export default function TopPilots({ standings }) {
  if (!standings || standings.length === 0) return null;

  const top3 = standings.slice(0, 3);

  return (
    <section className="top-pilots">
      <h2 className="section-title"><span className="accent">Top</span> Pilots</h2>
      <div className="top-pilots-grid">
        {top3.map((s, i) => (
          <Link to="/competition" key={s.pilot_key} className="top-pilot-card" style={{ borderColor: MEDAL_COLORS[i] }}>
            <div className="top-pilot-rank">
              <RankMedal rank={i + 1} />
            </div>
            <div className="top-pilot-name">{s.display_name}</div>
            <div className="top-pilot-pts">{s.total_points} <span>pts</span></div>
            <div className="top-pilot-weeks">{s.weeks_active || 0} weeks active</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
