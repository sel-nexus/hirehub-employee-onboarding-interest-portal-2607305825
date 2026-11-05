/** Render role-aware browser-local demo login and access landing pages. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { authenticate } from './accounts';

/** Show exact seed hints and persist credentials before navigating to the role area. */
export default function AccessLogin({ onLogin }) {
  const navigate = useNavigate();
  const [role, setRole] = useState('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState(null);

  /** Keep entered credentials on validation or storage failure. */
  function handleSubmit(event) {
    event.preventDefault();
    const result = authenticate(username, password, role);
    setFeedback(result);
    if (result.success) {
      onLogin();
      navigate(role === 'candidate' ? '/portal' : '/recruiter');
    }
  }

  return (
    <main id="main-content" className="auth-page">
      <div className="auth-card">
        <h1>HireHub Login</h1>
        <p className="auth-disclaimer">Public demo only. Do not use a real password.</p>
        <form className="submission-form" onSubmit={handleSubmit} noValidate>
          <div className="submission-field">
            <label htmlFor="access-role">Account role</label>
            <select id="access-role" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="admin">Recruiter / Admin</option>
              <option value="candidate">Candidate</option>
            </select>
          </div>
          <div className="submission-field">
            <label htmlFor="access-username">Username</label>
            <input id="access-username" autoComplete="username" value={username} aria-required="true"
              aria-invalid={feedback?.success === false} aria-describedby={feedback?.error ? 'access-error' : undefined}
              onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="submission-field">
            <label htmlFor="access-password">Password</label>
            <input id="access-password" type="password" autoComplete="current-password" value={password}
              aria-required="true" aria-invalid={feedback?.success === false}
              aria-describedby={feedback?.error ? 'access-error' : undefined}
              onChange={(event) => setPassword(event.target.value)} />
          </div>
          {feedback?.error && <p id="access-error" className="field-error" role="alert">{feedback.error}</p>}
          {feedback?.warning && <p role="status">{feedback.warning}</p>}
          <button className="submission-button" type="submit">Login</button>
        </form>
        <div className="auth-hint">
          <p>Admin: admin / admin</p>
          <p>Recruiter: recruiter@hirehub.demo / admin123</p>
          <p>Candidates: alex@example.com / jordan@example.com / taylor@example.com</p>
          <p>Candidate password: password123</p>
        </div>
        <Link className="back-home-link" to="/register">Register as a candidate</Link>
        <Link className="back-home-link" to="/admin/login">Legacy admin login</Link>
        <Link className="back-home-link" to="/">Back to Home</Link>
      </div>
    </main>
  );
}

AccessLogin.propTypes = { onLogin: PropTypes.func.isRequired };

/** Provide a functional access destination without importing later workflow screens. */
export function AccessLanding({ session }) {
  return (
    <main id="main-content" className="auth-page">
      <div className="auth-card">
        <h1>{session.role === 'candidate' ? 'Candidate Portal' : 'Recruiter Access'}</h1>
        <p className="auth-session-status">Welcome, {session.displayName}.</p>
        <p className="auth-disclaimer">Your demo account is signed in on this browser.</p>
        <Link className="back-home-link" to="/apply">Apply</Link>
        <Link className="back-home-link" to="/">Back to Home</Link>
      </div>
    </main>
  );
}

AccessLanding.propTypes = {
  session: PropTypes.shape({ role: PropTypes.oneOf(['candidate', 'admin']).isRequired,
    displayName: PropTypes.string.isRequired }).isRequired,
};
