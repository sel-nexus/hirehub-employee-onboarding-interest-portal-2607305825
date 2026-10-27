/** Render public and role-specific navigation without managing browser storage. */
import PropTypes from 'prop-types';
import { Link, NavLink } from 'react-router-dom';

/**
 * Keep legacy public entry links and expose the current role's portal and session action.
 * @param {object} props
 * @param {object|null} [props.session] Validated session controlled by App.
 * @param {boolean} [props.authenticated=false] Compatibility for legacy admin-only callers.
 * @param {Function} props.onLogout Session-removal action owned by App.
 * @param {string} [props.theme='light'] Current theme owned by App.
 * @param {Function} [props.onToggleTheme] Apply and persist the opposite theme.
 * @returns {JSX.Element}
 */
export function Header({ session = null, authenticated = false, onLogout, theme = 'light', onToggleTheme }) {
  const role = session?.role ?? (authenticated ? 'admin' : null);
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
            {role === 'admin' ? 'Recruiter Dashboard' : 'Admin'}
          </NavLink>
          {role !== 'admin' && (
            <NavLink className="nav-link" to="/candidate">
              {role === 'candidate' ? 'Candidate Portal' : 'Candidate'}
            </NavLink>
          )}
          {!role && (
            <NavLink className="nav-link" to="/register">
              Register
            </NavLink>
          )}
        </nav>
        <button
          className="theme-toggle"
          type="button"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          aria-pressed={theme === 'dark'}
          onClick={onToggleTheme}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            {theme === 'dark' ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
              </>
            ) : (
              <path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z" />
            )}
          </svg>
        </button>
        {role ? (
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
  session: PropTypes.shape({
    userId: PropTypes.string.isRequired,
    role: PropTypes.oneOf(['admin', 'candidate']).isRequired,
    displayName: PropTypes.string.isRequired,
    loginTimestamp: PropTypes.string.isRequired,
  }),
  authenticated: PropTypes.bool,
  theme: PropTypes.oneOf(['light', 'dark']),
  onToggleTheme: PropTypes.func,
  onLogout: PropTypes.func.isRequired,
};
