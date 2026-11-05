/** Expose current appearance and truthful failed-save feedback in navigation. */
import { useEffect, useId, useRef, useState } from 'react';
import { createThemeController } from './theme';

/** Render a native pressed button naming the current appearance.
 * @returns {JSX.Element} Keyboard-operable toggle and accessible error feedback.
 */
export function ThemeToggle() {
  const controller = useRef(null);
  const feedbackId = useId();
  const [appearance, setAppearance] = useState(() => ({
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
    error: '',
  }));

  useEffect(() => {
    const active = createThemeController();
    controller.current = active;
    setAppearance(active.getSnapshot());
    const unsubscribe = active.subscribe(setAppearance);
    return () => {
      unsubscribe();
      active.dispose();
      controller.current = null;
    };
  }, []);

  /** Request the opposite appearance without claiming storage success. */
  function toggle() {
    controller.current?.setTheme(appearance.theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <div className="theme-control">
      <button
        className="theme-toggle session-control"
        type="button"
        aria-label={`Dark theme (current: ${appearance.theme})`}
        aria-pressed={appearance.theme === 'dark'}
        aria-describedby={appearance.error ? feedbackId : undefined}
        onClick={toggle}
      >
        {appearance.theme === 'dark' ? 'Dark' : 'Light'}
      </button>
      {appearance.error && (
        <p id={feedbackId} className="theme-feedback" role="alert">
          {appearance.error}
        </p>
      )}
    </div>
  );
}

// The control accepts no caller props.
ThemeToggle.propTypes = {};
