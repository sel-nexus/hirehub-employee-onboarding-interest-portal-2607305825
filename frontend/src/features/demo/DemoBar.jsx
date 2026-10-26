/** Offer an accessible, unobtrusive browser-only demo reset utility. */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { resetToDefaults } from './mockData';

/**
 * Confirm destructive resets and announce storage outcomes in the portal footer.
 * Args:
 *   initializationError: Storage failure discovered during initial seeding.
 *   onReset: Notify the parent after a successful reset to refresh session/routes.
 * Returns:
 *   A footer with a native confirmation action and live feedback.
 */
export function DemoBar({ initializationError = '', onReset }) {
  const [feedback, setFeedback] = useState(null);
  const error = feedback === null ? initializationError : feedback.error;

  /** Persist a confirmed baseline before announcing success or refreshing the app. */
  function handleReset() {
    if (!window.confirm('Reset Mock Data? This replaces local submissions, accounts and departments and signs you out. Your theme preference will be kept.')) return;
    const result = resetToDefaults();
    setFeedback(result);
    if (result.success) onReset();
  }

  return (
    <footer aria-label="Demo utilities">
      <div className="container">
        <p>
          Local demo only. Records and mock credentials stay in this browser.
        </p>
        <button type="button" onClick={handleReset}>
          Reset Mock Data
        </button>
        {error && (
          <p className="auth-storage-error" role="alert">
            {error}
          </p>
        )}
        <p role="status">
          {feedback?.success ? 'Mock data restored. You have been signed out.' : ''}
        </p>
      </div>
    </footer>
  );
}

DemoBar.propTypes = {
  initializationError: PropTypes.string,
  onReset: PropTypes.func.isRequired,
};
