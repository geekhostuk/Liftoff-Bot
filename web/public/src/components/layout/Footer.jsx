import { Link } from 'react-router-dom';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="footer-logo-mark">JMT</span>
          <span className="footer-logo-text">FPV League</span>
        </div>
        <nav className="footer-links">
          <Link to="/tracks">Tracks</Link>
          <Link to="/competition">Competition</Link>
          <Link to="/pilots">Pilots</Link>
          <Link to="/how-it-works">How It Works</Link>
          <Link to="/about">About</Link>
        </nav>
        <div className="footer-meta">
          <Link to="/privacy">Privacy Policy</Link>
          <span className="footer-meta-sep">&middot;</span>
          Powered by <a href="https://store.steampowered.com/app/410340/Liftoff_FPV_Drone_Racing/" target="_blank" rel="noopener noreferrer">Liftoff</a>
        </div>
      </div>
    </footer>
  );
}
