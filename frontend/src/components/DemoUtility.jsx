/** Offer repeatable local demo recovery without touching theme or unrelated browser data. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { resetToDefaults } from '../features/data/mockData';

/**
 * Restore defaults and notify the shell only after successful persistence.
 * Args: onReset: Refresh shell identity and return home after session removal.
 * Returns: A discreet footer with persistent success/error feedback.
 */
export function DemoUtility({ onReset }) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  /** Keep failed resets visible and retryable without false success or navigation. */
  function reset() {
    const result = resetToDefaults();
    setError(result.error);
    setNotice('');
    if (!result.success) return;
    setNotice('Mock data reset. Eight sample applications and default accounts restored. The local session was cleared.');
    onReset();
  }
  return (
    <footer className="demo-utility" aria-label="Local demo utilities">
      <div className="demo-utility-inner">
        <p>
          Local-only demo. Accounts, applications and changes stay in this browser, not with an employer.
        </p>
        <button type="button" className="cancel-button" onClick={reset}>
          Reset Mock Data
        </button>
        <p role="status" aria-live="polite" className="demo-reset-status">
          {notice}
        </p>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </div>
    </footer>
  );
}
DemoUtility.propTypes = { onReset: PropTypes.func.isRequired };
