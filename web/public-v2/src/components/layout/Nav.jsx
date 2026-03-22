import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import MobileMenu from './MobileMenu';
import './Nav.css';

const links = [
  { to: '/', label: 'Home' },
  { to: '/competition', label: 'Competition' },
  { to: '/pilots', label: 'Pilots' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/about', label: 'About' },
];

export default function Nav({ lobby }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const lobbyFull = lobby && lobby.count >= lobby.max;
  const lobbyLabel = lobby ? `${lobby.count}/${lobby.max}` : '';

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="site-logo">
          <span className="site-logo-mark">JMT</span>
          <span className="site-logo-text">FPV League</span>
        </Link>

        <nav className="site-nav-desktop">
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        {lobby && (
          <div className={`lobby-indicator ${lobbyFull ? 'lobby-full' : ''}`} title="Players in lobby">
            <span className="lobby-icon" />
            <span className="lobby-count">{lobbyLabel}</span>
            {lobbyFull && <span className="lobby-tag">FULL</span>}
          </div>
        )}

        <Link to="/competition" className="btn btn-primary nav-cta">
          View Season
        </Link>

        <button
          className="mobile-toggle"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${menuOpen ? 'open' : ''}`} />
        </button>
      </div>

      <MobileMenu open={menuOpen} links={links} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
