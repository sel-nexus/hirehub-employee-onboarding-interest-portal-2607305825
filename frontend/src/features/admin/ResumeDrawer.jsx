/** Preview bundled demo materials without fetching files or navigating away from HireHub. */
import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { SAMPLE_RESUMES } from '../demo/mockData';
import { safePortfolioUrl } from '../apply/submissions';

/**
 * Display a keyboard-safe modal with local resume text and an explicit safe portfolio link.
 * Args:
 *   submission: Candidate name and optional material fields.
 *   onClose: Close the preview without mutating any record.
 * Returns:
 *   A labelled modal; unknown resumes and unsafe URLs receive honest fallback messages.
 * Notes:
 *   Restore prior focus and scroll style on every close or unmount.
 */
export default function ResumeDrawer({ submission, onClose }) {
  const dialogRef = useRef(null);
  const portfolio = safePortfolioUrl(submission.portfolioUrl);
  const resume = Object.hasOwn(SAMPLE_RESUMES, submission.sampleResume || '')
    ? SAMPLE_RESUMES[submission.sampleResume] : '';

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const closeButton = dialog.querySelector('button');
    document.body.style.overflow = 'hidden';
    closeButton.focus();

    /** Cycle Tab through real controls and dismiss on Escape. */
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll('button, a[href], [tabindex="0"]'))
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

    /** Keep programmatic and pointer focus away from background controls. */
    function containFocus(event) {
      if (!dialog.contains(event.target)) closeButton.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', containFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  /** Close only for clicks directly on the overlay. */
  function handleBackdrop(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="edit-overlay resume-overlay" onClick={handleBackdrop}>
      <section
        ref={dialogRef}
        className="edit-dialog resume-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resume-drawer-title"
      >
        <h2 id="resume-drawer-title">
          Resume and portfolio for {submission.fullName}
        </h2>
        <button className="cancel-button" type="button" onClick={onClose}>
          Close preview
        </button>
        <p>
          Local mock materials for demonstration only. No resume file is downloaded.
        </p>
        {resume ? (
          <section aria-label="Mock resume text">
            <h3>
              {submission.sampleResume}
            </h3>
            {resume.split('\n').map((line, index) => (
              <p key={index}>
                {line}
              </p>
            ))}
          </section>
        ) : (
          <p>
            {submission.sampleResume ? 'This sample resume is not available in the bundled demo.' : 'No sample resume selected.'}
          </p>
        )}
        {portfolio ? (
          <a href={portfolio} target="_blank" rel="noopener noreferrer">
            Open portfolio in a new tab
          </a>
        ) : (
          <p>
            {submission.portfolioUrl ? 'Portfolio link is unavailable: only valid http or https URLs are allowed.' : 'No portfolio link provided.'}
          </p>
        )}
      </section>
    </div>
  );
}

ResumeDrawer.propTypes = {
  submission: PropTypes.shape({
    fullName: PropTypes.string.isRequired,
    portfolioUrl: PropTypes.string,
    sampleResume: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};
