/** Render public and role-specific navigation without managing browser storage. */
import PropTypes from 'prop-types';
import { Link, NavLink } from 'react-router-dom';

/**
 * Keep legacy public entry links and expose the current role's portal and session action.
 * @param {object} props
 * @param {object|null} [props.session] Validated session controlled by App.
 * @param {boolean} [props.authenticated=false] Compatibility for legacy admin-only callers.
 * @param {Function} props.onLogout Session-removal action owned by App.
 * @returns {JSX.Element}
 */
export function Header({ session = null, authenticated = false, onLogout }) {
  const role = session?.role ?? (authenticated ? 'admin' : null);
  return (
    <header className="site-header" style={{ height: 'auto', minHeight: 60 }}>
      <div className="header-inner" style={{ flexWrap: 'wrap', gap: 12, paddingBlock: 12 }}>
        <Link className="logo" to="/">
          HireHub
        </Link>
        <nav aria-label="Main navigation" className="main-nav" style={{ flexWrap: 'wrap', gap: 12 }}>
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
  onLogout: PropTypes.func.isRequired,
};
