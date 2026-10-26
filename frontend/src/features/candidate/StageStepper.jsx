/** Explain the four hiring stages without exposing recruiter evaluations. */
import PropTypes from 'prop-types';

export const STAGE_LABELS = Object.freeze([
  'Application Received', 'Profile Screening', 'Interview Scheduled', 'Final Decision',
]);
const STAGES = Object.freeze({
  applied: { index: 0, label: 'Application Received', next: 'We received your application. Next, our team will review your profile.' },
  review: { index: 1, label: 'Under Review', next: 'Our team is screening your profile. Next, we will contact you about any interview invitation.' },
  interview: { index: 2, label: 'Interview Scheduled', next: 'Prepare for your interview and review the schedule below. Contact the recruiting team if you need scheduling details.' },
  offer: { index: 3, label: 'Offer Extended', next: 'Congratulations! Review your offer with the recruiting team and discuss next steps for joining.' },
  archived: { index: 3, label: 'Not Selected', next: 'You were not selected for this application. Thank you for your interest; you may apply for future opportunities.' },
});
const UNKNOWN = Object.freeze({ index: -1, label: 'Status unavailable', next: 'Your application is on file. Contact the recruiting team for the current status and next steps.' });

/**
 * Map stored status to a readable stage, keeping not-selected distinct from offer.
 * Args:
 *   status: Untrusted stored status; unknown values never imply a hiring outcome.
 * Returns:
 *   The active index, friendly status label and next-step explanation.
 * @param {*} status
 * @returns {{index: number, label: string, next: string}}
 */
export function getStage(status) {
  return typeof status === 'string' && Object.hasOwn(STAGES, status) ? STAGES[status] : UNKNOWN;
}

/**
 * Render an ordered, text-labeled hiring journey with exactly one known active step.
 * @param {{status?: string}} props Stored hiring status.
 * @returns {import('react').ReactElement} Text status, stage indicators and next steps.
 */
export function StageStepper({ status }) {
  const stage = getStage(status);
  return (
    <div className="candidate-progress">
      <p
        className={`candidate-status status-${Object.hasOwn(STAGES, status) ? status : 'unknown'}`}
        role="status"
      >
        Current status: {stage.label}
      </p>
      <ol className="stage-stepper" aria-label="Application progress">
        {STAGE_LABELS.map((label, index) => (
          <li
            key={label}
            className={`stage-step ${
              index === stage.index ? 'is-current'
                : index < stage.index ? 'is-complete' : 'is-pending'
            }`}
            aria-current={index === stage.index ? 'step' : undefined}
          >
            <span>{label}</span>
            <span className="stage-state">
              {index === stage.index ? ' — Current stage' : index < stage.index ? ' — Completed' : ' — Pending'}
            </span>
          </li>
        ))}
      </ol>
      <p className="candidate-next-steps">
        <strong>Next steps: </strong>
        {stage.next}
      </p>
    </div>
  );
}
StageStepper.propTypes = { status: PropTypes.string };
