/** Present four accessible lifecycle stages with distinct final outcomes. */
import PropTypes from 'prop-types';

const STAGES = ['Application Received', 'Profile Screening', 'Interview Scheduled', 'Final Decision'];
const STATES = {
  applied: { step: 0, message: 'Thanks for applying! Your application is received. We will review your profile next.' },
  review: { step: 1, message: 'Your profile is being screened. Keep your contact details up to date while we review.' },
  interview: { step: 2, message: 'Your interview is scheduled. Check the details below and prepare to share your work.' },
  offer: { step: 3, label: 'Offer Extended', message: 'Congratulations! You have an offer. Watch your email for the next steps.' },
  archived: { step: 3, message: 'This application is closed. Thank you for your interest; you can explore another department.' },
};
const ICONS = ['M4 5h16v14H4z M4 7l8 6 8-6', 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12 M15 15l5 5',
  'M4 6h16v14H4z M8 3v6 M16 3v6 M4 11h16', 'M5 12l4 4L19 6'];

/** Render a horizontal ordered progress list; invalid status remains readable. */
export default function StageStepper({ status }) {
  const state = STATES[status];
  if (!state) return <p role="status">Application status is unavailable. Please check again later.</p>;
  return (
    <div style={{ marginBlock: 'var(--space-5)' }}>
      <ol aria-label="Application progress" style={{ display: 'flex', listStyle: 'none', padding: 0, gap: 'var(--space-2)' }}>
        {STAGES.map((stage, index) => (
          <li key={stage} aria-current={index === state.step ? 'step' : undefined}
            style={{ flex: 1, minWidth: 0, borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)',
              color: index === state.step ? 'var(--color-primary)' : 'var(--color-text)', fontSize: '0.875rem' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d={ICONS[index]} />
            </svg>
            <span style={{ display: 'block' }}>{stage}</span>
            <span style={{ display: 'block' }}>{index < state.step ? 'Complete' : index === state.step ? 'Current' : 'Upcoming'}</span>
          </li>
        ))}
      </ol>
      <p role="status">
        {state.label && <strong>{state.label}</strong>}
        {state.label && ' — '}
        {state.message}
      </p>
    </div>
  );
}

StageStepper.propTypes = { status: PropTypes.string.isRequired };
