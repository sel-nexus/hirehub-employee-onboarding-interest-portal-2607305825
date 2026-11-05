/** Render pipeline dialogs with safe local materials and reversible keyboard focus. */
import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { DEPARTMENTS, editRecord, saveNotes, deleteRecord } from './recruiter';
import { safePortfolio } from '../demo/seed';

/**
 * Edit contacts/notes, confirm deletion, or preview materials without fetching them.
 * Args:
 *   record: Snapshot for display; services requery identity and records on save.
 *   mode: edit, notes, delete or materials.
 *   onClose: Close without saving. onSaved: Refresh after verified persistence.
 */
export default function RecordDialog({ record, mode, onClose, onSaved }) {
  const id = useId();
  const dialog = useRef(null);
  const [values, setValues] = useState({ fullName: record.fullName, mobile: record.mobile,
    department: record.department, notes: record.notes || '' });
  const [feedback, setFeedback] = useState({ error: '', fields: {} });
  const titles = { edit: 'Edit record', notes: 'Internal notes', delete: 'Delete record', materials: 'Application materials' };

  useEffect(() => {
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.querySelector('button, input, textarea, select, a[href]')?.focus();
    /** Keep focus within the modal and dismiss only on Escape. */
    function keyboard(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input, textarea, select, a[href]')];
      const first = controls[0];
      const last = controls.at(-1);
      if (!dialog.current.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [onClose]);

  /** Send only editable fields and keep failed saves visible with the entered values. */
  function submit(event) {
    event.preventDefault();
    const result = mode === 'edit' ? editRecord(record.id, values)
      : mode === 'notes' ? saveNotes(record.id, values.notes) : deleteRecord(record.id);
    if (!result.success) setFeedback(result);
    else onSaved(result);
  }

  /** Build associated validation attributes without exposing protected identity fields. */
  function field(name) {
    return { id: `${id}-${name}`, value: values[name], 'aria-required': mode === 'edit',
      'aria-invalid': Boolean(feedback.fields?.[name]),
      'aria-describedby': feedback.fields?.[name] ? `${id}-${name}-error` : undefined,
      onChange: (event) => setValues({ ...values, [name]: event.target.value }) };
  }

  return (
    <div className="edit-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialog} className="edit-dialog auth-card" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{titles[mode]} — {record.fullName} ({record.department})</h2>
        {mode === 'materials' ? (
          <>
            <p>Local mock materials only; no documents or external content are fetched.</p>
            <h3>Resume</h3>
            <p>{record.sampleResume || 'Legacy interest record — no resume supplied'}</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{record.resumeText || 'No resume was supplied with this public interest record.'}</pre>
            <h3>Cover letter</h3>
            <p>{record.coverLetterText || 'No cover letter was supplied with this public interest record.'}</p>
            {record.portfolioUrl && safePortfolio(record.portfolioUrl) ? (
              <a href={record.portfolioUrl} target="_blank" rel="noopener noreferrer">Open portfolio (new tab)</a>
            ) : (
              <p>{record.portfolioUrl ? 'Unsafe portfolio link blocked.' : 'No portfolio supplied.'}</p>
            )}
            <button className="cancel-button" onClick={onClose}>Close materials</button>
          </>
        ) : (
          <form className="submission-form" onSubmit={submit} noValidate>
            {mode === 'edit' && (
              <>
                <p>Email and account identity are read-only: {record.email}</p>
                <label htmlFor={`${id}-fullName`}>Full name</label>
                <input {...field('fullName')} maxLength={100} />
                <label htmlFor={`${id}-mobile`}>Mobile</label>
                <input {...field('mobile')} inputMode="numeric" maxLength={10} />
                <label htmlFor={`${id}-department`}>Department</label>
                <select {...field('department')}>
                  {DEPARTMENTS.map((department) => (
                    <option key={department}>{department}</option>
                  ))}
                </select>
              </>
            )}
            {mode === 'notes' && (
              <>
                <label htmlFor={`${id}-notes`}>Internal notes</label>
                <textarea {...field('notes')} maxLength={10000} rows={6} />
                <p>Recruiter-only notes; not displayed in the candidate portal.</p>
              </>
            )}
            {mode === 'delete' && (
              <p>This permanently deletes this application from the browser-local demo. Cancel leaves it unchanged.</p>
            )}
            {Object.entries(feedback.fields || {}).map(([name, error]) => (
              <p key={name} id={`${id}-${name}-error`} role="alert">{error}</p>
            ))}
            {feedback.error && (
              <p role="alert">{feedback.error}</p>
            )}
            <div className="edit-actions">
              <button className="cancel-button" type="button" onClick={onClose}>Cancel</button>
              <button className="submit-button" type="submit">{mode === 'delete' ? 'Confirm delete' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

RecordDialog.propTypes = {
  record: PropTypes.shape({ id: PropTypes.string.isRequired, fullName: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired, mobile: PropTypes.string.isRequired, department: PropTypes.string.isRequired,
    notes: PropTypes.string, sampleResume: PropTypes.string, resumeText: PropTypes.string,
    coverLetterText: PropTypes.string, portfolioUrl: PropTypes.string }).isRequired,
  mode: PropTypes.oneOf(['edit', 'notes', 'delete', 'materials']).isRequired,
  onClose: PropTypes.func.isRequired, onSaved: PropTypes.func.isRequired,
};
