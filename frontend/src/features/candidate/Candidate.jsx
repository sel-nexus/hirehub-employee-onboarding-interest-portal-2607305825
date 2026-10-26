/** Present the active candidate's own applications and an accessible inline contact editor. */
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';
import { readCandidate, saveProfile } from './profile';
import { StageStepper } from './StageStepper';

const FIELDS = [
  { key: 'fullName', label: 'Full Name', type: 'text', autoComplete: 'name', maxLength: 100 },
  { key: 'email', label: 'Email Address', type: 'email', autoComplete: 'email', maxLength: 254 },
  { key: 'mobile', label: 'Mobile Number', type: 'tel', autoComplete: 'tel', maxLength: 10 },
];

/**
 * Format stored dates readably, falling back without rendering invalid or raw objects.
 * @param {*} value Stored date text.
 * @returns {string} Localized date and time or an unavailable-date explanation.
 */
function readableDate(value) {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
}

/**
 * Requery local identity and applications on route entry, focus, storage and edits.
 * Args:
 *   onProfileSave: Refresh shared header identity after any attempted contact save.
 * Returns:
 *   Private application cards or a fail-closed error without stale personal data.
 * @param {{onProfileSave?: function}} props Shared identity refresh callback.
 * @returns {import('react').ReactElement} Candidate contact and application surface.
 */
export default function Candidate({ onProfileSave }) {
  const location = useLocation();
  const [view, setView] = useState(readCandidate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ fullName: '', email: '', mobile: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');
  const formIdentity = useRef(null);
  const firstInput = useRef(null);
  const editButton = useRef(null);

  /** Discard cached personal data and editing state when the active identity changes. */
  function refresh() {
    const next = readCandidate();
    setView(next);
    if (!next.success || (formIdentity.current && next.userId !== formIdentity.current)) {
      setEditing(false);
      setDraft({ fullName: '', email: '', mobile: '' });
      setErrors({});
      setMessage('');
    }
    return next;
  }

  useEffect(() => {
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [location.key]);

  useEffect(() => {
    if (editing) firstInput.current?.focus();
  }, [editing]);

  /** Open from fresh storage so a stale screen cannot initialize another identity's form. */
  function startEditing() {
    const next = refresh();
    if (!next.success) return;
    formIdentity.current = next.userId;
    setDraft(next.profile);
    setErrors({});
    setMessage('');
    setSaveError('');
    setEditing(true);
  }

  /** Close the inline editor and restore keyboard focus to its trigger. */
  function cancelEditing() {
    setEditing(false);
    setErrors({});
    setSaveError('');
    editButton.current?.focus();
  }

  /** Persist by captured user ID; requery even on failure to prevent stale visibility. */
  function submitProfile(event) {
    event.preventDefault();
    const result = saveProfile(formIdentity.current, draft);
    refresh();
    onProfileSave?.(result);
    setErrors(result.errors || {});
    setSaveError(result.error);
    setMessage(result.success ? 'Profile saved in this browser.' : '');
    if (result.success) cancelEditing();
    else firstInput.current?.focus();
  }

  if (!view.success) {
    return (
      <main id="main-content" className="auth-page candidate-page">
        <section className="auth-card">
          <h1>Candidate portal</h1>
          <p role="alert">{view.error}</p>
          <Link to="/login">Sign in again</Link>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="auth-page candidate-page">
      <div className="candidate-layout">
        <section className="auth-card candidate-profile" aria-labelledby="candidate-title">
          <h1 id="candidate-title">Candidate portal</h1>
          <p>Welcome, {view.profile.fullName}.</p>
          <h2>Contact profile</h2>
          <dl>
            <dt>Name</dt>
            <dd>{view.profile.fullName}</dd>
            <dt>Email</dt>
            <dd>{view.profile.email}</dd>
            <dt>Mobile</dt>
            <dd>{view.profile.mobile || 'Add your mobile number'}</dd>
          </dl>
          <button
            type="button"
            ref={editButton}
            className="btn btn-secondary"
            aria-expanded={editing}
            aria-controls="candidate-profile-form"
            onClick={startEditing}
          >
            Edit profile
          </button>
          {editing && (
            <form
              id="candidate-profile-form"
              className="candidate-profile-form"
              onSubmit={submitProfile}
              noValidate
              aria-label="Edit contact profile"
            >
              {FIELDS.map((field, index) => (
                <div className="form-group" key={field.key}>
                  <label htmlFor={`profile-${field.key}`}>{field.label}</label>
                  <input
                    id={`profile-${field.key}`}
                    ref={index === 0 ? firstInput : undefined}
                    name={field.key}
                    type={field.type}
                    autoComplete={field.autoComplete}
                    maxLength={field.maxLength}
                    value={draft[field.key]}
                    required
                    aria-required="true"
                    aria-invalid={Boolean(errors[field.key])}
                    aria-describedby={errors[field.key] ? `profile-${field.key}-error` : undefined}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  />
                  {errors[field.key] && (
                    <p id={`profile-${field.key}-error`} className="field-error" role="alert">
                      {errors[field.key]}
                    </p>
                  )}
                </div>
              ))}
              <button className="btn btn-primary" type="submit">Save profile</button>
              <button className="btn btn-secondary" type="button" onClick={cancelEditing}>Cancel</button>
            </form>
          )}
          {saveError && (
            <p className="auth-storage-error" role="alert">{saveError}</p>
          )}
          {message && (
            <p role="status">{message}</p>
          )}
          <p className="auth-disclaimer">Browser-only demo. Contact updates and hiring information stay in this browser.</p>
          <Link to="/apply">Submit an application</Link>
          <p>
            <Link to="/admin">Recruiter access</Link>
          </p>
        </section>
        <section className="candidate-applications" aria-labelledby="applications-title">
          <h2 id="applications-title">Your applications</h2>
          {view.applications.length === 0 ? (
            <div className="auth-card candidate-empty">
              <h3>No applications yet</h3>
              <p>Your account is ready. Use the application form to submit your interest.</p>
              <Link to="/apply">Start an application</Link>
            </div>
          ) : view.applications.map((application) => (
            <article className="auth-card candidate-application" key={application.id} aria-labelledby={`application-${application.id}`}>
              <h3 id={`application-${application.id}`}>{application.department} application</h3>
              <dl>
                <dt>Application ID</dt>
                <dd>{application.id}</dd>
                <dt>Applicant</dt>
                <dd>{application.fullName}</dd>
                <dt>Contact email</dt>
                <dd>{application.email}</dd>
                <dt>Contact mobile</dt>
                <dd>{application.mobile}</dd>
                <dt>Submitted</dt>
                <dd>{readableDate(application.submittedAt)}</dd>
                {application.sampleResume && (
                  <>
                    <dt>Resume selection</dt>
                    <dd>{application.sampleResume}</dd>
                  </>
                )}
              </dl>
              <StageStepper status={application.status} />
              {application.interviewSchedule && (
                <section className="candidate-interview" aria-label="Interview schedule">
                  <h4>Interview schedule</h4>
                  <p>
                    {Number.isFinite(Date.parse(application.interviewSchedule))
                      ? readableDate(application.interviewSchedule) : application.interviewSchedule}
                  </p>
                </section>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
Candidate.propTypes = { onProfileSave: PropTypes.func };
