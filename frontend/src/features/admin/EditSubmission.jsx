/** Edit permitted submission fields with recoverable persistence and a keyboard-safe modal. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { SubmissionFields } from '../../components/SubmissionFields';
import { SAMPLE_RESUMES } from '../apply/submissions';
import {
  EDITABLE_FIELDS, NOTES_MAX_LENGTH, STATUS_LABELS, validateRecruiterFields,
  updateRecruiterSubmission, withRecruiterDefaults,
} from './recruiterService';

/**
 * Render a prefilled editor and persist only valid changes.
 * Args:
 *   submission: The selected record, including immutable identity and email.
 *   onSaved: Requery the dashboard after persistence; may throw on read failure.
 *   onCancel: Close without writing.
 * Returns:
 *   A labelled modal with associated field errors and save recovery feedback.
 * Notes:
 *   Effects bind keyboard/focus listeners, lock scrolling, and restore prior focus.
 */
export default function EditSubmission({ submission, onSaved, onCancel }) {
  const [initial] = useState(() => withRecruiterDefaults(submission));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const dialog = document.getElementById('edit-submission-dialog');
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.querySelector('[name="fullName"]').focus();

    /** Keep Tab within the dialog and close it on Escape. */
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll('input, select, textarea, a[href], button, [tabindex="0"]'))
        .filter((control) => !control.disabled && control.tabIndex >= 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    /** Recover focus if pointer or programmatic activity reaches background controls. */
    function containFocus(event) {
      if (!dialog.contains(event.target)) dialog.querySelector('[name="fullName"]').focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', containFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onCancel]);

  /** Update editable values while refusing even synthetic changes to email. */
  function handleChange(event) {
    const { name, value } = event.target;
    if (!EDITABLE_FIELDS.includes(name)) return;
    setValues((current) => ({ ...current, [name]: value }));
  }

  /** Validate before writing; keep all entered values if persistence or requery fails. */
  function handleSubmit(event) {
    event.preventDefault();
    const result = validateRecruiterFields({ ...values, email: initial.email });
    setErrors(result.errors);
    setSaveError('');
    if (Object.keys(result.errors).length) return;
    try {
      const patch = Object.fromEntries(EDITABLE_FIELDS
        .filter((field) => values[field] !== initial[field])
        .map((field) => [field, result.values[field]]));
      updateRecruiterSubmission(submission.id, patch);
      onSaved();
    } catch (error) {
      setErrors(error.fieldErrors || {});
      setSaveError(`${error.message} Your edits are still here. Retry Save Changes or Cancel and refresh the dashboard.`);
    }
  }

  /** Close only when the backdrop itself, not the card or a field, is clicked. */
  function handleBackdrop(event) {
    if (event.target === event.currentTarget) onCancel();
  }

  return (
    <div className="edit-overlay" onClick={handleBackdrop}>
      <section
        id="edit-submission-dialog"
        className="edit-dialog submission-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-submission-title"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <h2 id="edit-submission-title">
          Edit Submission
        </h2>
        <form onSubmit={handleSubmit} noValidate aria-label="Edit submission form">
          {saveError && (
            <p className="submission-storage-error" role="alert">
              {saveError}
            </p>
          )}
          <SubmissionFields
            values={values}
            errors={errors}
            onChange={handleChange}
            readOnlyEmail
            idPrefix="edit-submission"
          />
          {[
            ['status', 'Pipeline Stage'], ['notes', 'Internal Recruiter Notes'],
            ['portfolioUrl', 'Portfolio URL'], ['sampleResume', 'Sample Resume'],
          ].map(([field, label]) => (
            <div key={field} className="submission-field">
              <label htmlFor={`edit-submission-${field}`}>
                {label}
              </label>
              {field === 'notes' ? (
                <textarea
                  id={`edit-submission-${field}`}
                  name={field}
                  value={values[field]}
                  onChange={handleChange}
                  rows={4}
                  maxLength={NOTES_MAX_LENGTH}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={`edit-notes-help${errors[field] ? ` edit-submission-${field}-error` : ''}`}
                />
              ) : field === 'portfolioUrl' ? (
                <input
                  id={`edit-submission-${field}`}
                  name={field}
                  type="url"
                  value={values[field]}
                  onChange={handleChange}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={errors[field] ? `edit-submission-${field}-error` : undefined}
                />
              ) : (
                <select
                  id={`edit-submission-${field}`}
                  name={field}
                  value={values[field]}
                  onChange={handleChange}
                  aria-required={field === 'status'}
                  aria-invalid={Boolean(errors[field])}
                  aria-describedby={errors[field] ? `edit-submission-${field}-error` : undefined}
                >
                  {field === 'sampleResume' && (
                    <option value="">
                      No sample selected
                    </option>
                  )}
                  {(field === 'status' ? Object.entries(STATUS_LABELS) : SAMPLE_RESUMES.map((resume) => [resume, resume]))
                    .map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                </select>
              )}
              {field === 'notes' && (
                <p id="edit-notes-help">
                  Recruiter-only, up to {NOTES_MAX_LENGTH} characters. Never shown to candidates.
                </p>
              )}
              {errors[field] && (
                <p id={`edit-submission-${field}-error`} className="field-error" role="alert">
                  {errors[field]}
                </p>
              )}
            </div>
          ))}
          <div className="edit-actions">
            <button className="submission-button" type="submit">
              Save Changes
            </button>
            <button className="cancel-button" type="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

EditSubmission.propTypes = {
  submission: PropTypes.shape({
    id: PropTypes.string.isRequired,
    fullName: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    mobile: PropTypes.string.isRequired,
    department: PropTypes.string.isRequired,
    submittedAt: PropTypes.string.isRequired,
  }).isRequired,
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
