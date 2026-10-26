/** Present the accessible browser-only demo credential gate. */
import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { login } from './auth';

/**
 * Show credentials and notify the owner only after a successful session write.
 * Args:
 *   onLogin: Requery the persisted session in the owning application.
 *   initialRole: Candidate by default; admin for the recruiter route gate.
 * Returns:
 *   The centered login card with visible demo limitations and live errors.
 */
export default function Login({ onLogin, initialRole = 'candidate' }) {
  const [role, setRole] = useState(initialRole === 'admin' ? 'admin' : 'candidate');
  const tabs = useRef({});
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  /** Clear credentials and stale errors when switching the requested portal. */
  function changeRole(nextRole) {
    setRole(nextRole);
    setUsername('');
    setPassword('');
    setError('');
  }

  /** Validate submitted credentials and retain any persistence failure for retry. */
  function handleSubmit(event) {
    event.preventDefault();
    const result = login(username, password, role);
    setError(result.error);
    if (result.success) {
      onLogin();
    }
  }

  return (
    <main id="main-content" className="auth-page">
      <section className="auth-card submission-form" aria-labelledby="login-title">
        <h1 id="login-title">{role === 'admin' ? 'Admin Login' : 'Candidate Login'}</h1>
        <div role="tablist" aria-label="Account role">
          {['candidate', 'admin'].map((tabRole) => (
            <button
              key={tabRole}
              ref={(element) => { tabs.current[tabRole] = element; }}
              id={`login-tab-${tabRole}`}
              role="tab"
              type="button"
              aria-selected={role === tabRole}
              aria-controls="login-panel"
              tabIndex={role === tabRole ? 0 : -1}
              onClick={() => changeRole(tabRole)}
              onKeyDown={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const next = event.key === 'Home' ? 'candidate' : event.key === 'End' ? 'admin'
                    : role === 'candidate' ? 'admin' : 'candidate';
                  changeRole(next);
                  tabs.current[next].focus();
                }
              }}
            >
              {tabRole === 'candidate' ? 'Candidate' : 'Administrator / Recruiter'}
            </button>
          ))}
        </div>
        <p className="auth-hint">
          {role === 'admin' ? 'Demo credentials: admin/admin or recruiter@hirehub.demo/admin123'
            : 'Demo credentials: alex@example.com, jordan@example.com or taylor@example.com / password123'}
        </p>
        <p className="auth-disclaimer" id="demo-disclaimer">
          Browser-only demo. This is not real authentication or secure access control.
        </p>
        <div id="login-panel" role="tabpanel" aria-labelledby={`login-tab-${role}`}>
          <form onSubmit={handleSubmit} noValidate aria-describedby="demo-disclaimer">
            <div className="submission-field">
              <label htmlFor="admin-username">Username</label>
              <input
                id="admin-username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="Enter username"
                aria-required="true"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="submission-field">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter password"
                aria-required="true"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <button className="submission-button" type="submit">
              Login
            </button>
          </form>
          {error && (
            <p id="login-error" className="field-error" role="alert">
              {error}
            </p>
          )}
          {role === 'candidate' && (
            <a href="/register">Create candidate account</a>
          )}
        </div>
      </section>
    </main>
  );
}

Login.propTypes = {
  onLogin: PropTypes.func.isRequired,
  initialRole: PropTypes.oneOf(['candidate', 'admin']),
};
