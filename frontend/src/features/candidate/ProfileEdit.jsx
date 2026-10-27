/** Accessible, ownership-checked contact editor using HireHub's existing modal primitives. */
import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { updateCandidateContact, validateContact } from './candidateService';

const FIELDS = { fullName: 'Full Name', email: 'Email Address', mobile: 'Mobile Number' };

/** Edit contact details without exposing recruiter metadata. @param {object} props @returns {JSX.Element} */
export default function ProfileEdit({ application, onSaved, onCancel }) {
  const [values, setValues] = useState({ fullName: application.fullName, email: application.email, mobile: application.mobile });
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState('');
  const dialogRef = useRef(null);
  const closeRef = useRef(onCancel);
  closeRef.current = onCancel;
  const prefix = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const firstInput = dialog.querySelector('input');
    firstInput.focus();

    /** Cycle keyboard focus inside the dialog and permit Escape cancellation. */
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('input, button, a[href], [tabindex="0"]')]
          .filter((control) => !control.disabled && control.tabIndex >= 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    /** Contain programmatic or pointer focus attempts in the background. */
    function containFocus(event) {
      if (!dialog.contains(event.target)) firstInput.focus();
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', containFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  /** Preserve entered details on invalid input or any failed persistence/requery. */
  function save(event) {
    event.preventDefault();
    const result = validateContact(values);
    setErrors(result.errors);
    setSaveError('');
    if (Object.keys(result.errors).length) return;
    try {
      const saved = updateCandidateContact(application.id, result.values);
      onSaved(saved);
    } catch (error) {
      setErrors(error.fieldErrors || {});
      setSaveError(`${error.message} Your edits are still here.`);
    }
  }

  return (
    <div
      className="edit-overlay"
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <section ref={dialogRef} className="edit-dialog submission-form" role="dialog" aria-modal="true" aria-labelledby={`${prefix}-title`}>
        <h2 id={`${prefix}-title`}>
          Edit Contact Details
        </h2>
        <p style={{ marginBlock: 'var(--space-4)' }}>
          Your name and email also update your local candidate account. Your application progress stays unchanged.
        </p>
        <form noValidate onSubmit={save} aria-label="Edit contact form">
          {saveError && (
            <p role="alert" className="submission-storage-error">
              {saveError}
            </p>
          )}
          {Object.entries(FIELDS).map(([field, label]) => (
            <div className="submission-field" key={field}>
              <label htmlFor={`${prefix}-${field}`}>
                {label}
              </label>
              <input
                id={`${prefix}-${field}`}
                name={field}
                type={field === 'email' ? 'email' : field === 'mobile' ? 'tel' : 'text'}
                autoComplete={field === 'fullName' ? 'name' : field === 'email' ? 'email' : 'tel'}
                inputMode={field === 'mobile' ? 'numeric' : undefined}
                value={values[field]}
                onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
                aria-required="true"
                aria-invalid={Boolean(errors[field])}
                aria-describedby={errors[field] ? `${prefix}-${field}-error` : undefined}
              />
              {errors[field] && (
                <p id={`${prefix}-${field}-error`} className="field-error" role="alert">
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

ProfileEdit.propTypes = {
  application: PropTypes.shape({ id: PropTypes.string.isRequired, fullName: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired, mobile: PropTypes.string.isRequired }).isRequired,
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
