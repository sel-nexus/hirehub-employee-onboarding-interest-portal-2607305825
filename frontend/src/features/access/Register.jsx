/** Present candidate signup while retaining the established form styles. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { registerCandidate } from '../admin/auth';

/**
 * Create an account and notify the owner only after account/session persistence.
 * Args:
 *   onRegister: Refresh the validated session and open the candidate entry.
 * Returns:
 *   An accessible signup form with recoverable validation and storage errors.
 */
export default function Register({ onRegister }) {
  const [fields, setFields] = useState({ fullName: '', email: '', mobile: '', password: '' });
  const [error, setError] = useState('');

  /** Submit validated local registration without claiming success after a failed write. */
  function handleSubmit(event) {
    event.preventDefault();
    const result = registerCandidate(fields);
    setError(result.error);
    if (result.success) onRegister();
  }

  return (
    <main id="main-content" className="auth-page">
      <section className="auth-card submission-form" aria-labelledby="register-title">
        <h1 id="register-title">Create candidate account</h1>
        <p id="register-disclaimer" className="auth-disclaimer">
          Browser-only demo. Your account stays in this browser, not a shared hiring service.
          Mobile is validated here; contact profile editing is not part of signup.
        </p>
        <form noValidate onSubmit={handleSubmit} aria-describedby="register-disclaimer">
          {[
            ['fullName', 'Full Name', 'text', 'name'],
            ['email', 'Email Address', 'email', 'email'],
            ['mobile', 'Mobile Number', 'tel', 'tel'],
            ['password', 'Password', 'password', 'new-password'],
          ].map(([name, label, type, autoComplete]) => (
            <div className="submission-field" key={name}>
              <label htmlFor={`register-${name}`}>{label}</label>
              <input
                id={`register-${name}`}
                name={name}
                type={type}
                autoComplete={autoComplete}
                aria-required="true"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'register-error' : name === 'password' ? 'password-hint' : undefined}
                value={fields[name]}
                onChange={(event) => setFields({ ...fields, [name]: event.target.value })}
              />
            </div>
          ))}
          <p id="password-hint" className="auth-hint">Use at least 8 characters for your password.</p>
          <button type="submit" className="submission-button">Create account</button>
        </form>
        {error && (
          <p id="register-error" className="field-error" role="alert">{error}</p>
        )}
        <Link to="/login">Already have an account? Log in</Link>
      </section>
    </main>
  );
}

Register.propTypes = { onRegister: PropTypes.func.isRequired };
