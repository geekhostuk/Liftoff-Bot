import { Link } from 'react-router-dom';
import './CommunityCTA.css';

export default function CommunityCTA() {
  return (
    <section className="community-cta">
      <div className="community-cta-inner">
        <h2>Ready to Compete?</h2>
        <p>
          Jump into Liftoff, race during an active week, and your results are automatically tracked.
          Register an account and link your in-game nickname to get priority lobby access &mdash;
          unregistered pilots are kicked first when the server is full.
        </p>
        <div className="community-cta-actions">
          <Link to="/register" className="btn btn-primary">Register Now</Link>
          <Link to="/competition" className="btn btn-outline">View Current Season</Link>
          <Link to="/about" className="btn btn-outline">Learn About the League</Link>
        </div>
      </div>
    </section>
  );
}
