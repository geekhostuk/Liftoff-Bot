import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useUserAuth } from '../../context/UserAuthContext';
import MobileMenu from './MobileMenu';
import './Nav.css';

const SUPPORT_URL = 'https://www.patreon.com/cw/JesusMcTwos/membership';

const links = [
  { to: '/', label: 'Home' },
  { to: '/live', label: 'Live' },
  { label: 'Tracks', children: [
    { to: '/tracks', label: 'Tracks' },
    { to: '/browse', label: 'Browse' },
  ]},
  { to: '/competition', label: 'Competition' },
  { to: '/pilots', label: 'Pilots' },
  { label: 'Info', children: [
    { to: '/how-it-works', label: 'How It Works' },
    { to: '/about', label: 'About' },
  ]},
];

export default function Nav({ lobby }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, checking } = useUserAuth();
  const location = useLocation();

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
          {links.map(l =>
            l.children ? (
              <div
                key={l.label}
                className={`nav-dropdown${l.children.some(c => c.to === location.pathname) ? ' active' : ''}`}
              >
                <span className="nav-link nav-dropdown-trigger">
                  {l.label}
                  <svg className="nav-chevron" width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <div className="nav-dropdown-menu">
                  {l.children.map(c => (
                    <NavLink
                      key={c.to}
                      to={c.to}
                      className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                    >
                      {c.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {l.label}
              </NavLink>
            )
          )}
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="nav-link nav-support"
          >
            Support
          </a>
        </nav>

        {lobby && (
          <Link to="/live" className={`lobby-indicator ${lobbyFull ? 'lobby-full' : ''}`} title="Players in lobby">
            <span className="lobby-icon" />
            <span className="lobby-count">{lobbyLabel}</span>
            {lobbyFull && <span className="lobby-tag">FULL</span>}
          </Link>
        )}

        {!checking && (
          user ? (
            <div className="nav-auth-links">
              {user.role && (
                <a href="/admin/" className="btn btn-secondary nav-cta-sm">Admin</a>
              )}
              <Link to="/profile" className="btn btn-primary nav-cta">
                Profile
              </Link>
            </div>
          ) : (
            <div className="nav-auth-links">
              <Link to="/login" className="btn btn-secondary nav-cta-sm">Log In</Link>
              <Link to="/register" className="btn btn-primary nav-cta">Register</Link>
            </div>
          )
        )}

        <button
          className="mobile-toggle"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${menuOpen ? 'open' : ''}`} />
        </button>
      </div>

      <MobileMenu open={menuOpen} links={links} supportUrl={SUPPORT_URL} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
