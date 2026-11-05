/** Render persistent public navigation with a caller-controlled session action. */
import PropTypes from 'prop-types';
import { Link, NavLink } from 'react-router-dom';
import { ThemeToggle } from '../features/theme/ThemeToggle';

/**
 * Show route links and the appropriate login or logout control.
 * Args:
 *   authenticated: Whether the owning application has an active demo session.
 *   session: Current role-aware account, if present.
 *   accessEnabled: Whether role-aware access links are available.
 *   onLogout: The owning application's logout action; storage is not managed here.
 * Returns:
 *   A semantic sticky header with accessible active navigation.
 */
export function Header({ authenticated = false, session = null, accessEnabled = false, onLogout }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="logo" to="/">
          HireHub
        </Link>
        <nav aria-label="Main navigation" className="main-nav">
          <NavLink className="nav-link" to="/" end>
            Home
          </NavLink>
          <NavLink className="nav-link" to="/apply">
            Apply
          </NavLink>
          <NavLink className="nav-link" to="/admin">
            Admin
          </NavLink>
          {accessEnabled && !session && (
            <NavLink className="nav-link" to="/register">
              Register
            </NavLink>
          )}
          {session?.role === 'candidate' && (
            <NavLink className="nav-link" to="/portal">
              Portal
            </NavLink>
          )}
          {session?.role === 'admin' && (
            <NavLink className="nav-link" to="/recruiter">
              Recruiter
            </NavLink>
          )}
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {authenticated || session ? (
            <button className="session-control logout-button" type="button" onClick={onLogout}>
              Logout
            </button>
          ) : (
            <Link className="session-control login-link" to={accessEnabled ? '/login' : '/admin'}>
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

Header.propTypes = {
  authenticated: PropTypes.bool,
  accessEnabled: PropTypes.bool,
  session: PropTypes.shape({ role: PropTypes.oneOf(['candidate', 'admin']), displayName: PropTypes.string }),
  onLogout: PropTypes.func.isRequired,
};
