import { Link } from 'react-router-dom';
import './Hero.css';

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">
        <h1 className="hero-title">
          <span className="hero-mark">JMT</span> FPV League
        </h1>
        <p className="hero-tagline">Weekly FPV competition powered by Liftoff</p>
        <p className="hero-sub">
          Race. Improve. Climb the standings.<br />
          Every lap counts. Every week resets the battle.
        </p>
        <p className="hero-register-hint">
          Register &amp; link your account for priority lobby access when the server is full.
        </p>
        <div className="hero-actions">
          <Link to="/register" className="btn btn-primary btn-lg">
            Sign Up
          </Link>
          <Link to="/competition" className="btn btn-outline">
            View Current Season
          </Link>
          <Link to="/how-it-works" className="btn btn-outline">
            How It Works
          </Link>
        </div>
      </div>
    </section>
  );
}
