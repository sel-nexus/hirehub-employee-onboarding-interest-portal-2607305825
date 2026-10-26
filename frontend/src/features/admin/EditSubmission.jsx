/** Edit permitted submission fields with recoverable persistence and a keyboard-safe modal. */
import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { SubmissionFields } from '../../components/SubmissionFields';
import { validateSubmission } from '../apply/validation';
import { METADATA_LIMITS, updateSubmission, validateSubmissionMetadata } from '../apply/submissions';

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
  const [values, setValues] = useState({
    fullName: submission.fullName,
    email: submission.email,
    mobile: submission.mobile,
    department: submission.department,
    notes: submission.notes || '',
    portfolioUrl: submission.portfolioUrl || '',
    sampleResume: submission.sampleResume || '',
    interviewSchedule: submission.interviewSchedule || '',
  });
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
      const controls = Array.from(dialog.querySelectorAll('input, select, textarea, button, [tabindex="0"]'))
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
    if (!['fullName', 'mobile', 'department', 'notes', 'portfolioUrl', 'sampleResume', 'interviewSchedule'].includes(name)) return;
    setValues((current) => ({ ...current, [name]: value }));
  }

  /** Validate before writing; keep all entered values if persistence or requery fails. */
  function handleSubmit(event) {
    event.preventDefault();
    const result = validateSubmission({ ...values, email: submission.email });
    const fieldErrors = { ...result.errors, ...validateSubmissionMetadata(values) };
    setErrors(fieldErrors);
    setSaveError('');
    if (Object.keys(fieldErrors).length) return;
    const metadata = Object.fromEntries(['notes', 'portfolioUrl', 'sampleResume', 'interviewSchedule']
      .filter((key) => values[key] !== (submission[key] || ''))
      .map((key) => [key, values[key]]));
    try {
      updateSubmission(submission.id, { ...result.values, ...metadata });
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
            includeMaterials
            idPrefix="edit-submission"
          />
          {[
            { name: 'notes', label: 'Recruiter Notes (private)' },
            { name: 'interviewSchedule', label: 'Interview Schedule (optional)' },
          ].map(({ name, label }) => (
            <div className="submission-field" key={name}>
              <label htmlFor={`edit-submission-${name}`}>
                {label}
              </label>
              <textarea
                id={`edit-submission-${name}`}
                name={name}
                value={values[name]}
                onChange={handleChange}
                rows={name === 'notes' ? 4 : 2}
                aria-invalid={Boolean(errors[name])}
                aria-describedby={`edit-submission-${name}-help${errors[name] ? ` edit-submission-${name}-error` : ''}`}
              />
              <p id={`edit-submission-${name}-help`}>
                {name === 'notes' ? 'Visible to recruiters only.' : 'Human-readable scheduling details shown to the candidate.'} Maximum {METADATA_LIMITS[name]} characters.
              </p>
              {errors[name] && (
                <p className="field-error" id={`edit-submission-${name}-error`} role="alert">
                  {errors[name]}
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
    userId: PropTypes.string,
    notes: PropTypes.string,
    portfolioUrl: PropTypes.string,
    sampleResume: PropTypes.string,
    interviewSchedule: PropTypes.string,
  }).isRequired,
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
