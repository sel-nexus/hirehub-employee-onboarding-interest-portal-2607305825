/** Register a browser-local candidate account with accessible field-level feedback. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { registerCandidate } from '../admin/auth';

/**
 * Show signup validation and notify the owner only after account and session persistence.
 * @param {object} props
 * @param {Function} props.onRegister Requery the local session and open the candidate route.
 * @returns {JSX.Element}
 */
export default function Register({ onRegister }) {
  const [values, setValues] = useState({ displayName: '', username: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  /** Validate signup and preserve fields on any failed save. @param {Event} event */
  function handleSubmit(event) {
    event.preventDefault();
    const result = registerCandidate(values);
    setErrors(result.fieldErrors);
    setError(result.error);
    if (result.success) onRegister();
  }

  return (
    <main id="main-content" className="auth-page">
      <section className="auth-card submission-form" aria-labelledby="register-title">
        <h1 id="register-title">
          Create Candidate Account
        </h1>
        <p className="auth-disclaimer" id="register-disclaimer">
          Browser-only demo. Your account and password are stored in this browser, not sent to an employer. Do not use a real password.
        </p>
        <form onSubmit={handleSubmit} noValidate aria-describedby="register-disclaimer">
          {[
            ['displayName', 'Full Name', 'text', 'name'],
            ['username', 'Email Address', 'email', 'username'],
            ['password', 'Password', 'password', 'new-password'],
            ['confirmPassword', 'Confirm Password', 'password', 'new-password'],
          ].map(([key, label, type, autoComplete]) => (
            <div className="submission-field" key={key}>
              <label htmlFor={`register-${key}`}>
                {label}
              </label>
              <input
                id={`register-${key}`}
                name={key}
                type={type}
                autoComplete={autoComplete}
                aria-required="true"
                aria-invalid={Boolean(errors[key])}
                aria-describedby={errors[key] ? `register-${key}-error` : undefined}
                value={values[key]}
                onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
              />
              {errors[key] && (
                <p id={`register-${key}-error`} className="field-error" role="alert">
                  {errors[key]}
                </p>
              )}
            </div>
          ))}
          <button className="submission-button" type="submit">
            Create Account
          </button>
        </form>
        {error && !Object.keys(errors).length && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <Link to="/login">
          Already have an account? Login
        </Link>
      </section>
    </main>
  );
}

Register.propTypes = {
  onRegister: PropTypes.func.isRequired,
};
