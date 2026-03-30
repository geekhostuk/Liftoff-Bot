import { Link } from 'react-router-dom';
import './HowItWorksPreview.css';

const STEPS = [
  { num: '1', title: 'Register', desc: 'Sign up on the site and link your in-game nickname for priority lobby access.' },
  { num: '2', title: 'Race', desc: 'Join a race during an active competition week. Your laps are tracked automatically.' },
  { num: '3', title: 'Earn', desc: 'Score points for placement, laps, consistency, streaks, and more.' },
  { num: '4', title: 'Climb', desc: 'Compete weekly to climb the season standings and earn awards.' },
];

export default function HowItWorksPreview() {
  return (
    <section className="hiw-preview">
      <h2 className="section-title"><span className="accent">How</span> It Works</h2>
      <div className="hiw-steps">
        {STEPS.map(s => (
          <div key={s.num} className="hiw-step">
            <div className="hiw-step-num">{s.num}</div>
            <h3 className="hiw-step-title">{s.title}</h3>
            <p className="hiw-step-desc">{s.desc}</p>
          </div>
        ))}
      </div>
      <div className="hiw-preview-link">
        <Link to="/how-it-works" className="btn btn-outline">Learn More</Link>
      </div>
    </section>
  );
}
