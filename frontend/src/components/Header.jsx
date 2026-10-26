/** Render persistent public navigation with a caller-controlled session action. */
import PropTypes from 'prop-types';
import { Link, NavLink } from 'react-router-dom';

/**
 * Show route links and the appropriate login or logout control.
 * Args:
 *   authenticated: Whether the owning application has an active demo session.
 *   session: Validated identity used to hide recruiter navigation from candidates.
 *   onLogout: The owning application's logout action; storage is not managed here.
 * Returns:
 *   A semantic sticky header with accessible active navigation.
 */
export function Header({ authenticated = false, session = null, onLogout }) {
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
          <NavLink className="nav-link" to="/candidate">
            Candidate portal
          </NavLink>
          {session?.role !== 'candidate' && (
            <NavLink className="nav-link" to="/admin">
              Admin
            </NavLink>
          )}
          {!authenticated && (
            <NavLink className="nav-link" to="/register">
              Register
            </NavLink>
          )}
        </nav>
        {authenticated ? (
          <button className="session-control logout-button" type="button" onClick={onLogout}>
            Logout
          </button>
        ) : (
          <Link className="session-control login-link" to="/login">
            Login
          </Link>
        )}
      </div>
    </header>
  );
}

Header.propTypes = {
  authenticated: PropTypes.bool,
  session: PropTypes.shape({ role: PropTypes.oneOf(['candidate', 'admin']) }),
  onLogout: PropTypes.func.isRequired,
};
