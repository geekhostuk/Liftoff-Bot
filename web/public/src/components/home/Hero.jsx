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
          <a
            href="https://www.patreon.com/cw/JesusMcTwos/membership"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-support"
          >
            Support Us
          </a>
        </div>
      </div>
    </section>
  );
}
