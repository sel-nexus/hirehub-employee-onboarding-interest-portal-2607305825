/** Present unified, accessible candidate and recruiter access for the local demo. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useSearchParams } from 'react-router-dom';
import { login } from './auth';

/**
 * Persist a selected role session before notifying the application owner.
 * @param {object} props
 * @param {Function} props.onLogin Requery the session and navigate to its portal.
 * @param {string} [props.initialRole='candidate'] Legacy /admin defaults to recruiter access.
 * @returns {JSX.Element}
 */
export default function Login({ onLogin, initialRole = 'candidate' }) {
  const [params, setParams] = useSearchParams();
  const role = ['admin', 'candidate'].includes(params.get('role')) ? params.get('role') : initialRole;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  /** Switch URL-backed tabs without carrying credentials or errors between roles. @param {string} nextRole */
  function selectRole(nextRole) {
    setParams({ role: nextRole });
    setUsername('');
    setPassword('');
    setError('');
  }

  /** Support standard arrow-key tab selection and focus. @param {KeyboardEvent} event */
  function handleTabKey(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextRole = event.key === 'Home' ? 'candidate' : event.key === 'End' ? 'admin' : role === 'admin' ? 'candidate' : 'admin';
    selectRole(nextRole);
    document.getElementById(`login-tab-${nextRole}`)?.focus();
  }

  /** Validate credentials and retain persistence errors for retry. @param {Event} event */
  function handleSubmit(event) {
    event.preventDefault();
    const result = login(username, password, role);
    setError(result.error);
    if (result.success) onLogin();
  }

  return (
    <main id="main-content" className="auth-page">
      <section className="auth-card submission-form" aria-labelledby="login-title">
        <h1 id="login-title">
          {role === 'admin' ? 'Admin Login' : 'Candidate Login'}
        </h1>
        <div role="tablist" aria-label="Access role" className="dashboard-heading">
          {['candidate', 'admin'].map((value) => (
            <button
              key={value}
              id={`login-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={role === value}
              aria-controls="login-panel"
              tabIndex={role === value ? 0 : -1}
              className={role === value ? 'submission-button' : 'cancel-button'}
              onClick={() => selectRole(value)}
              onKeyDown={handleTabKey}
            >
              {value === 'admin' ? 'Administrator / Recruiter' : 'Candidate'}
            </button>
          ))}
        </div>
        <div id="login-panel" role="tabpanel" aria-labelledby={`login-tab-${role}`}>
          <p className="auth-hint">
            {role === 'admin'
              ? 'Demo credentials: admin/admin or recruiter@hirehub.demo/admin123'
              : 'Demo candidates: alex@example.com, jordan@example.com, taylor@example.com — password123'}
          </p>
          <p className="auth-disclaimer" id="demo-disclaimer">
            Browser-only demo. This is not real authentication or secure access control.
          </p>
          <form onSubmit={handleSubmit} noValidate aria-describedby="demo-disclaimer">
            <div className="submission-field">
              <label htmlFor="login-username">
                {role === 'admin' ? 'Username' : 'Email Address'}
              </label>
              <input
                id="login-username"
                name="username"
                type={role === 'admin' ? 'text' : 'email'}
                autoComplete="username"
                placeholder={role === 'admin' ? 'Enter username' : 'Enter email address'}
                aria-required="true"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="submission-field">
              <label htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
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
        </div>
        {error && (
          <p id="login-error" className="field-error" role="alert">
            {error}
          </p>
        )}
        <Link to="/register">
          Create a candidate account
        </Link>
      </section>
    </main>
  );
}

Login.propTypes = {
  onLogin: PropTypes.func.isRequired,
  initialRole: PropTypes.oneOf(['admin', 'candidate']),
};
