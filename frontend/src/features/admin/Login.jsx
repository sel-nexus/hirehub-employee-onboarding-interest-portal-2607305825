/** Present the accessible browser-only demo credential gate. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { login } from './auth';

/**
 * Show credentials and notify the owner only after a successful session write.
 * Args:
 *   onLogin: Requery the persisted session in the owning application.
 * Returns:
 *   The centered login card with visible demo limitations and live errors.
 */
export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  /** Validate submitted credentials and retain any persistence failure for retry. */
  function handleSubmit(event) {
    event.preventDefault();
    const result = login(username, password);
    setError(result.error);
    if (result.success) {
      onLogin();
    }
  }

  return (
    <main id="main-content" className="auth-page">
      <section className="auth-card submission-form" aria-labelledby="login-title">
        <h1 id="login-title">Admin Login</h1>
        <p className="auth-hint">Demo credentials: admin/admin</p>
        <p className="auth-disclaimer" id="demo-disclaimer">
          Browser-only demo. This is not real authentication or secure access control.
        </p>
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
      </section>
    </main>
  );
}

Login.propTypes = {
  onLogin: PropTypes.func.isRequired,
};
