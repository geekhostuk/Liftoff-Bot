import { NavLink, Link } from 'react-router-dom';
import { useUserAuth } from '../../context/UserAuthContext';
import './MobileMenu.css';

export default function MobileMenu({ open, links, onClose }) {
  const { user, checking } = useUserAuth();

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
      {!checking && (
        <div className="mobile-auth">
          {user ? (
            <Link to="/profile" className="btn btn-primary mobile-cta" onClick={onClose}>
              Profile
            </Link>
          ) : (
            <div className="mobile-auth-buttons">
              <Link to="/login" className="btn btn-secondary mobile-cta" onClick={onClose}>
                Log In
              </Link>
              <Link to="/register" className="btn btn-primary mobile-cta" onClick={onClose}>
                Register
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
