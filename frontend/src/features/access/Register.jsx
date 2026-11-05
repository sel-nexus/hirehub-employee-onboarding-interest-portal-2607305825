/** Render validated candidate registration without losing input after failed saves. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { register } from './accounts';

const FIELDS = [
  { name: 'fullName', label: 'Full name', type: 'text', autocomplete: 'name' },
  { name: 'email', label: 'Email', type: 'email', autocomplete: 'email' },
  { name: 'mobile', label: 'Mobile', type: 'tel', autocomplete: 'tel' },
  { name: 'password', label: 'Password', type: 'password', autocomplete: 'new-password' },
];

/** Save a new candidate and navigate only when account and session writes succeed. */
export default function Register({ onLogin }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState({ fullName: '', email: '', mobile: '', password: '' });
  const [feedback, setFeedback] = useState(null);

  /** Validate and retain all fields when registration cannot complete. */
  function handleSubmit(event) {
    event.preventDefault();
    const result = register(details);
    setFeedback(result);
    if (result.success) {
      onLogin();
      navigate('/portal');
    }
  }

  return (
    <main id="main-content" className="auth-page">
      <div className="auth-card">
        <h1>Register as a candidate</h1>
        <p className="auth-disclaimer">Browser-local demo only. Use fictional details and a demo password.</p>
        <form className="submission-form" onSubmit={handleSubmit} noValidate>
          {FIELDS.map((field) => (
            <div className="submission-field" key={field.name}>
              <label htmlFor={`register-${field.name}`}>{field.label}</label>
              <input id={`register-${field.name}`} type={field.type} autoComplete={field.autocomplete}
                value={details[field.name]} aria-required="true" aria-invalid={Boolean(feedback?.fields?.[field.name])}
                aria-describedby={feedback?.fields?.[field.name] ? `register-${field.name}-error` : undefined}
                onChange={(event) => setDetails({ ...details, [field.name]: event.target.value })} />
              {feedback?.fields?.[field.name] && (
                <p id={`register-${field.name}-error`} className="field-error" role="alert">
                  {feedback.fields[field.name]}
                </p>
              )}
            </div>
          ))}
          {feedback?.error && <p className="submission-storage-error" role="alert">{feedback.error}</p>}
          {feedback?.warning && <p role="status">{feedback.warning}</p>}
          <button className="submission-button" type="submit">Create account</button>
        </form>
        <Link className="back-home-link" to="/login">Already registered? Login</Link>
        <Link className="back-home-link" to="/">Back to Home</Link>
      </div>
    </main>
  );
}

Register.propTypes = { onLogin: PropTypes.func.isRequired };
