/** Compose candidate-owned applications and validated contact/material forms. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { SESSION_EVENT } from '../access/accounts';
import { DEMO_RESET_EVENT } from '../demo/storage';
import { DEMO_DEPARTMENTS, safePortfolio } from '../demo/seed';
import { CANDIDATE_EVENT, RESUME_PRESETS, readCandidatePortal, updateContact, createApplication } from './candidate';
import StageStepper from './StageStepper';

/** Bind native controls to inline validation while preserving input identity. */
function Field({ name, label, value, onChange, error, options, type = 'text', required = false }) {
  const id = `candidate-${name}`;
  const props = { id, name, value, onChange, 'aria-required': required, 'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${id}-error` : undefined };
  return (
    <div className="submission-field">
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select {...props}>
          <option value="">Choose an option</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <input
          {...props}
          type={type}
          autoComplete={name === 'fullName' ? 'name' : name === 'mobile' ? 'tel' : name === 'email' ? 'email' : 'url'}
        />
      )}
      {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
    </div>
  );
}
Field.propTypes = {
  name: PropTypes.string.isRequired, label: PropTypes.string.isRequired, value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired, error: PropTypes.string, options: PropTypes.arrayOf(PropTypes.string),
  type: PropTypes.string, required: PropTypes.bool,
};

/** Requery on browser activity; preserve drafts and never show success after failed saves. */
export default function Portal() {
  const [portal, setPortal] = useState(readCandidatePortal);
  const [contact, setContact] = useState(() => portal.data?.contact || { fullName: '', email: '', mobile: '' });
  const [application, setApplication] = useState({ department: '', portfolioUrl: '', sampleResume: '' });
  const [feedback, setFeedback] = useState(null);
  const [form, setForm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /** Refresh visible data without clearing unsaved input. */
    function refresh() {
      setPortal(readCandidatePortal());
    }
    const events = ['storage', 'focus', SESSION_EVENT, DEMO_RESET_EVENT, CANDIDATE_EVENT];
    events.forEach((event) => window.addEventListener(event, refresh));
    return () => events.forEach((event) => window.removeEventListener(event, refresh));
  }, []);

  /** Clear drafts only after all required writes succeed. */
  function submit(event, kind) {
    event.preventDefault();
    setBusy(true);
    setForm(kind);
    const result = kind === 'contact' ? updateContact(contact) : createApplication(application);
    setFeedback(result);
    if (result.success) {
      setPortal(result);
      setContact(result.data.contact);
      if (kind === 'application') setApplication({ department: '', portfolioUrl: '', sampleResume: '' });
    } else {
      setPortal(readCandidatePortal());
    }
    setBusy(false);
  }

  /** Preserve other contact fields while editing. */
  function changeContact(event) {
    setContact((draft) => ({ ...draft, [event.target.name]: event.target.value }));
  }

  /** Preserve other material choices while editing. */
  function changeApplication(event) {
    setApplication((draft) => ({ ...draft, [event.target.name]: event.target.value }));
  }

  return (
    <main id="main-content" className="apply-page">
      <div className="apply-container" style={{ maxWidth: '900px', display: 'grid', gap: 'var(--space-8)' }}>
        <div>
          <h1>Candidate Portal</h1>
          {portal.success && <p className="apply-subtitle">Welcome, {portal.data.contact.fullName}.</p>}
        </div>
        {!portal.success ? (
          <section>
            <p role="alert">{portal.error}</p>
            <button type="button" onClick={() => setPortal(readCandidatePortal())}>Retry</button>
            <Link to="/login">Log in again</Link>
          </section>
        ) : (
          <>
            {portal.warning && <p role="status">{portal.warning}</p>}
            {feedback && (
              <p role={feedback.success ? 'status' : 'alert'}>
                {feedback.success ? form === 'contact' ? 'Contact details saved.' : 'Application submitted.' : feedback.error}
              </p>
            )}
            <section aria-labelledby="applications-heading">
              <h2 id="applications-heading">Your applications</h2>
              {!portal.data.applications.length && (
                <div>
                  <p>No applications yet. Ready to share your work?</p>
                  <a href="#new-application">Start an application</a>
                </div>
              )}
              {portal.data.applications.map((record) => (
                <article
                  key={record.id}
                  aria-label={`${record.department} application`}
                  style={{
                    paddingBlock: 'var(--space-6)',
                    borderBottom: '1px solid var(--color-border)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <h3>{record.department}</h3>
                  <p>Submitted {new Date(record.submittedAt).toLocaleDateString()}</p>
                  <StageStepper status={record.status} />
                  {record.interview && (
                    <section aria-label="Interview details">
                      <h4>Interview details</h4>
                      <p>{record.interview.date} at {record.interview.time} ({record.interview.timezone})</p>
                      <p>{record.interview.location}</p>
                    </section>
                  )}
                  <details>
                    <summary>Application details and materials</summary>
                    <p>{record.fullName} · {record.email} · {record.mobile}</p>
                    <p>{record.sampleResume}</p>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{record.resumeText}</p>
                    <p>{record.coverLetterText}</p>
                    {record.portfolioUrl && safePortfolio(record.portfolioUrl) && (
                      <a href={record.portfolioUrl} target="_blank" rel="noopener noreferrer">Open portfolio (new tab)</a>
                    )}
                  </details>
                </article>
              ))}
            </section>
            <form
              className="submission-form"
              aria-label="Contact details"
              noValidate
              onSubmit={(event) => submit(event, 'contact')}
            >
              <h2>Contact details</h2>
              <p>Your login username stays unchanged when you update your email.</p>
              {[['fullName', 'Full name', 'text'], ['email', 'Email', 'email'], ['mobile', 'Mobile', 'tel']].map(([name, label, type]) => (
                <Field
                  key={name}
                  name={name}
                  label={label}
                  type={type}
                  value={contact[name]}
                  onChange={changeContact}
                  error={form === 'contact' ? feedback?.fields?.[name] : undefined}
                  required
                />
              ))}
              <button type="submit" disabled={busy}>Save contact details</button>
            </form>
            <form
              id="new-application"
              className="submission-form"
              aria-label="New application"
              noValidate
              onSubmit={(event) => submit(event, 'application')}
            >
              <h2>New application</h2>
              <p>Apply once per department. Add a portfolio or mock resume. No documents are fetched automatically.</p>
              <Field
                name="department"
                label="Department"
                value={application.department}
                options={DEMO_DEPARTMENTS}
                onChange={changeApplication}
                error={form === 'application' ? feedback?.fields?.department : undefined}
                required
              />
              <Field
                name="portfolioUrl"
                label="Portfolio URL"
                type="url"
                value={application.portfolioUrl}
                onChange={changeApplication}
                error={form === 'application' ? feedback?.fields?.portfolioUrl : undefined}
              />
              <Field
                name="sampleResume"
                label="Mock resume"
                value={application.sampleResume}
                options={RESUME_PRESETS}
                onChange={changeApplication}
                error={form === 'application' ? feedback?.fields?.sampleResume : undefined}
              />
              <button type="submit" disabled={busy}>Submit application</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
