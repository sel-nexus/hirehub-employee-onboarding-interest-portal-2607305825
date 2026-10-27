/** Inspect preset resume text and safe portfolio links locally, without remote fetching. */
import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { validateMaterials } from '../apply/submissions';
import { NOTES_MAX_LENGTH, updateRecruiterSubmission } from './recruiterService';

const RESUME_TEXT = Object.freeze({
  'Full-Stack Developer Resume (Sample)': [
    'Professional summary: Full-stack developer building accessible, reliable web applications.',
    'Skills: JavaScript, React, Node.js, REST API design, SQL, automated testing, and Git.',
    'Experience: Delivered customer-facing dashboards, designed API contracts, and improved release quality with integration tests.',
    'Selected project: A browser-based hiring portal with responsive forms and clear application progress.',
    'Education: Bachelor of Science in Computer Science. This is local mock resume content, not a real PDF.',
  ],
  'UI/UX Case Study': [
    'Project: Redesigning a candidate application experience for clarity and accessibility.',
    'Discovery: Interviewed applicants and recruiters to identify confusing status labels and lengthy forms.',
    'Process: Journey mapping, wireframes, interactive prototypes, and usability testing.',
    'Outcome: Clearer hiring milestones, fewer form errors, and accessible keyboard navigation.',
    'Tools: Figma, design systems, research synthesis, and WCAG checks. This is a local mock case study.',
  ],
  'Frontend Software Engineer (5 YOE)': [
    'Professional summary: Frontend software engineer with five years of experience in React and frontend architecture.',
    'Skills: React, JavaScript, semantic HTML, CSS, accessibility, performance profiling, and component testing.',
    'Experience: Led reusable component development, improved keyboard accessibility, and optimized large dashboard rendering.',
    'Selected project: Built application review tools with safe local persistence and candidate self-service.',
    'Education: Bachelor of Science in Software Engineering. This is local mock resume content, not a real PDF.',
  ],
});

/** Display a focus-contained review dialog with persistent internal notes.
 * Args:
 *   submission: The selected record; unsafe materials are displayed as unavailable, never linked.
 *   onSaved: Requery current dashboard records; may throw if storage becomes unavailable.
 *   onCancel: Close and restore the trigger without saving edits.
 * Returns: An accessible dialog; no iframe, document download, or network request is initiated.
 * @param {object} props
 * @returns {JSX.Element} */
export default function ReviewSubmission({ submission, onSaved, onCancel }) {
  const id = useId();
  const dialogRef = useRef(null);
  const [notes, setNotes] = useState(submission.notes || '');
  const savedNotes = useRef(submission.notes || '');
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const materials = validateMaterials(submission);
  const safePortfolio = !materials.errors.portfolioUrl && materials.values.portfolioUrl;
  const resume = Object.hasOwn(RESUME_TEXT, submission.sampleResume) ? RESUME_TEXT[submission.sampleResume] : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = dialog.querySelector('button');
    first.focus();

    /** Cycle through all current interactive controls, including links and the notes textarea. */
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      } else if (event.key === 'Tab') {
        const controls = Array.from(dialog.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]'))
          .filter((control) => !control.disabled && control.tabIndex >= 0);
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === controls[0]) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          controls[0].focus();
        }
      }
    }

    /** Return stray background focus to the first dialog control. */
    function containFocus(event) {
      if (!dialog.contains(event.target)) first.focus();
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('focusin', containFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onCancel]);

  /** Save only changed notes against the latest metadata; retain input on any failure. */
  function saveNotes(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const notesChanged = notes !== savedNotes.current;
      const saved = updateRecruiterSubmission(submission.id, notesChanged ? { notes } : {});
      // Keep untouched input aligned with the verified latest notes for subsequent saves.
      if (!notesChanged) setNotes(saved.notes);
      savedNotes.current = saved.notes;
      onSaved();
      setNotice('Internal notes saved locally.');
    } catch (cause) {
      setError(`${cause.fieldErrors?.notes || cause.message} Your notes are still here. Retry Save Notes or Close and refresh.`);
    }
  }

  return (
    <div className="edit-overlay" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section
        ref={dialogRef}
        className="edit-dialog submission-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        style={{ maxHeight: '90vh', overflowY: 'auto', overflowWrap: 'anywhere' }}
      >
        <h2 id={`${id}-title`}>
          Review Submission
        </h2>
        <p>
          {submission.fullName} — {submission.email} — {submission.department}
        </p>
        <p>
          Browser-local sample content. No document or portfolio is fetched automatically.
        </p>
        <button className="cancel-button" type="button" onClick={onCancel}>
          Close
        </button>
        <h3>
          Resume
        </h3>
        {resume ? (
          <>
            <p>
              {submission.sampleResume}
            </p>
            <button
              className="cancel-button"
              type="button"
              aria-expanded={preview}
              aria-controls={`${id}-resume`}
              onClick={() => setPreview((current) => !current)}
            >
              {preview ? 'Hide Resume Preview' : 'Preview Resume'}
            </button>
            {preview && (
              <article id={`${id}-resume`} aria-label="Local resume preview">
                {resume.map((paragraph) => (
                  <p key={paragraph}>
                    {paragraph}
                  </p>
                ))}
              </article>
            )}
          </>
        ) : (
          <p>
            No supported sample resume selected.
          </p>
        )}
        <h3>
          Portfolio
        </h3>
        {safePortfolio ? (
          <a href={safePortfolio} target="_blank" rel="noopener noreferrer">
            View portfolio (opens in a new tab)
          </a>
        ) : (
          <p>
            {submission.portfolioUrl ? 'Portfolio unavailable: only safe HTTP(S) links are supported.' : 'No portfolio provided.'}
          </p>
        )}
        <form onSubmit={saveNotes} noValidate>
          <div className="submission-field">
            <label htmlFor={`${id}-notes`}>
              Internal Recruiter Notes
            </label>
            <textarea
              id={`${id}-notes`}
              value={notes}
              rows={5}
              maxLength={NOTES_MAX_LENGTH}
              onChange={(event) => setNotes(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={`${id}-notes-help${error ? ` ${id}-error` : ''}`}
            />
            <p id={`${id}-notes-help`}>
              Recruiter-only, up to {NOTES_MAX_LENGTH} characters. Never shown in the candidate portal.
            </p>
          </div>
          {error && (
            <p id={`${id}-error`} role="alert" className="submission-storage-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="submission-success">
              {notice}
            </p>
          )}
          <button className="submission-button" type="submit">
            Save Notes
          </button>
        </form>
      </section>
    </div>
  );
}

ReviewSubmission.propTypes = {
  submission: PropTypes.shape({
    id: PropTypes.string.isRequired,
    fullName: PropTypes.string.isRequired,
    email: PropTypes.string.isRequired,
    department: PropTypes.string.isRequired,
    notes: PropTypes.string,
    portfolioUrl: PropTypes.string,
    sampleResume: PropTypes.string,
  }).isRequired,
  onSaved: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
};
