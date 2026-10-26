/** Render persistent public navigation with a caller-controlled session action. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { getTheme, getThemeWarning, setTheme, subscribeTheme } from '../features/theme/theme';
import { Link, NavLink } from 'react-router-dom';

/**
 * Show route links, the appropriate session action, and an OS-aware theme control.
 * Args:
 *   authenticated: Whether the owning application has an active demo session.
 *   session: Validated identity used to hide recruiter navigation from candidates.
 *   onLogout: The owning application's logout action; storage is not managed here.
 * Returns:
 *   A semantic sticky header with accessible active navigation.
 */
export function Header({ authenticated = false, session = null, onLogout }) {
  const [preference, setPreference] = useState(() => ({ theme: getTheme(), error: getThemeWarning() }));

  useEffect(() => {
    const unsubscribe = subscribeTheme(setPreference);
    setPreference({ theme: getTheme(), error: getThemeWarning() });
    return unsubscribe;
  }, []);

  const dark = preference.theme === 'dark';
  const toggleLabel = `Switch to ${dark ? 'light' : 'dark'} theme`;

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
          <button
            type="button"
            className="theme-toggle"
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-pressed={dark}
            aria-describedby={preference.error ? 'theme-warning' : undefined}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              {dark ? (
                <>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
                </>
              ) : (
                <path d="M20.9 13.2A9 9 0 0 1 10.8 3.1 9 9 0 1 0 20.9 13.2Z" />
              )}
            </svg>
          </button>
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
      {preference.error && (
        <p id="theme-warning" className="theme-warning" role="status">
          {preference.error}
        </p>
      )}
    </header>
  );
}

Header.propTypes = {
  authenticated: PropTypes.bool,
  session: PropTypes.shape({ role: PropTypes.oneOf(['candidate', 'admin']) }),
  onLogout: PropTypes.func.isRequired,
};
