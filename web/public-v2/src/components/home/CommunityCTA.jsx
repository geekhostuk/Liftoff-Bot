import { Link } from 'react-router-dom';
import './CommunityCTA.css';

export default function CommunityCTA() {
  return (
    <section className="community-cta">
      <div className="community-cta-inner">
        <h2>Ready to Compete?</h2>
        <p>
          Jump into Liftoff, race during an active week, and your results are automatically tracked.
          No sign-up required &mdash; just fly.
        </p>
        <div className="community-cta-actions">
          <Link to="/competition" className="btn btn-primary">View Current Season</Link>
          <Link to="/about" className="btn btn-outline">Learn About the League</Link>
        </div>
      </div>
    </section>
  );
}
