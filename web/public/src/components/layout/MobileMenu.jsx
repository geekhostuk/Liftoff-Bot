import { NavLink } from 'react-router-dom';
import './MobileMenu.css';

export default function MobileMenu({ open, links, onClose }) {
  if (!open) return null;

  return (
    <div className="mobile-menu">
      <nav className="mobile-menu-nav">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) => `mobile-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/competition" className="btn btn-primary mobile-cta" onClick={onClose}>
        View Current Season
      </NavLink>
    </div>
  );
}
