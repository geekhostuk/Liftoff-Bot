import { NavLink, Link } from 'react-router-dom';
import { useUserAuth } from '../../context/UserAuthContext';
import './MobileMenu.css';

export default function MobileMenu({ open, links, supportUrl, onClose }) {
  const { user, checking } = useUserAuth();

  if (!open) return null;

  return (
    <div className="mobile-menu">
      <nav className="mobile-menu-nav">
        {links.map(l =>
          l.children ? (
            <div key={l.label} className="mobile-group">
              <span className="mobile-group-label">{l.label}</span>
              {l.children.map(c => (
                <NavLink
                  key={c.to}
                  to={c.to}
                  className={({ isActive }) => `mobile-link mobile-link-nested ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  {c.label}
                </NavLink>
              ))}
            </div>
          ) : (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) => `mobile-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              {l.label}
            </NavLink>
          )
        )}
        <a
          href={supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mobile-link mobile-support"
          onClick={onClose}
        >
          Support
        </a>
      </nav>
      {!checking && (
        <div className="mobile-auth">
          {user ? (
            <>
              {user.role && (
                <a href="/admin/" className="btn btn-secondary mobile-cta" onClick={onClose}>
                  Admin Panel
                </a>
              )}
              <Link to="/profile" className="btn btn-primary mobile-cta" onClick={onClose}>
                Profile
              </Link>
            </>
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
