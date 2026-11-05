/** Offer a discreet browser-only reset with accessible persistence feedback. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { resetMockData } from './storage';

/** Render one-click reset without adding navigation or production-auth claims. */
export function DemoFooter({ feedback = { error: '', warning: '' } }) {
  const [resetFeedback, setResetFeedback] = useState(null);
  const visible = resetFeedback || feedback;

  /** Replace test data and announce actual persistence success or failure. */
  function onReset() {
    const result = resetMockData();
    setResetFeedback({
      error: result.error, warning: result.warning,
      message: result.success ? 'Demo reset: eight applications restored. All demo sessions cleared.' : '',
    });
  }

  return (
    <footer
      aria-label="Demo controls"
      style={{
        padding: 'var(--space-6)', borderTop: '1px solid var(--color-border)',
        color: 'var(--color-text)', background: 'var(--color-bg)',
      }}
    >
      <p>Demo only · Data stays in this browser. Reset removes your test applications and signs everyone out.</p>
      <button
        type="button"
        onClick={onReset}
        style={{
          marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-4)',
          border: '1px solid var(--color-border)', borderRadius: '8px',
          color: 'var(--color-text)', background: 'var(--color-card)',
        }}
      >
        Reset Mock Data
      </button>
      {visible.error && (
        <p role="alert">{visible.error}</p>
      )}
      {visible.warning && (
        <p role="alert">{visible.warning}</p>
      )}
      {visible.message && (
        <p role="status">{visible.message}</p>
      )}
    </footer>
  );
}

DemoFooter.propTypes = {
  feedback: PropTypes.shape({ error: PropTypes.string, warning: PropTypes.string }),
};
