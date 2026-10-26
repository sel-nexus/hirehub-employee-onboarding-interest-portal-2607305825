/** Manage the browser-only theme without assuming storage or media queries are available. */
export const THEME_KEY = 'hirehub_theme';
export const THEME_EVENT = 'hirehub:theme-change';
export const THEME_READ_WARNING = 'Theme preference could not be read. You can still switch themes; check browser storage settings to keep your choice.';
export const THEME_SAVE_WARNING = 'Theme changed for this visit, but could not be saved. Check browser storage settings and try switching again to keep your choice.';
let warning = '';

/** Accept only the two supported, unencoded preference values. */
function isTheme(value) {
  return value === 'light' || value === 'dark';
}

/** Return the OS preference, falling back to light when media queries are unavailable. */
function systemTheme() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Apply semantic CSS tokens and notify controls, including when only a warning changes. */
function applyTheme(theme, error = '') {
  document.documentElement.dataset.theme = theme;
  warning = error;
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme, error } }));
  return { theme, error };
}

/**
 * Apply a valid saved preference or the OS default before React renders.
 * Returns:
 *   The applied theme and an actionable read warning, if storage is inaccessible.
 * Notes:
 *   Never writes a default to storage; repeated initialization is safe.
 * @returns {{theme: 'light'|'dark', error: string}}
 */
export function initializeTheme() {
  let saved = null;
  let error = '';
  try {
    saved = window.localStorage.getItem(THEME_KEY);
  } catch {
    error = THEME_READ_WARNING;
  }
  return applyTheme(isTheme(saved) ? saved : systemTheme(), error);
}

/** Return the applied theme, initializing only when the root has no valid theme. */
export function getTheme() {
  const theme = document.documentElement.dataset.theme;
  return isTheme(theme) ? theme : initializeTheme().theme;
}

/** Return the latest storage warning for a newly mounted navigation control. */
export function getThemeWarning() {
  return warning;
}

/**
 * Switch immediately and attempt to persist the explicit choice, even if unchanged.
 * Args:
 *   theme: Exactly light or dark; invalid values leave DOM and storage unchanged.
 * Returns:
 *   The applied theme, saved boolean, and warning (never throws for storage failures).
 * @param {*} theme
 * @returns {{theme: 'light'|'dark', saved: boolean, error: string}}
 */
export function setTheme(theme) {
  if (!isTheme(theme)) {
    return { theme: getTheme(), saved: false, error: 'Choose a light or dark theme.' };
  }
  let error = '';
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    error = THEME_SAVE_WARNING;
  }
  return { ...applyTheme(theme, error), saved: !error };
}

/**
 * Observe same-tab changes and synchronize genuine cross-tab storage events.
 * Args:
 *   listener: Receives the applied theme and warning after a change.
 * Returns:
 *   A cleanup function removing both listeners; it is safe to call repeatedly.
 * Notes:
 *   Removal or invalid preferences recover to the OS default without writing back.
 * @param {(state: {theme: 'light'|'dark', error: string}) => void} listener
 * @returns {() => void}
 */
export function subscribeTheme(listener) {
  /** Deliver the controller's current change to the mounted control. */
  function onChange(event) {
    listener(event.detail);
  }
  /** Apply only local theme changes, not unrelated/session storage events. */
  function onStorage(event) {
    if (event.key !== THEME_KEY && event.key !== null) return;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
    } catch {
      // A blocked localStorage getter must not break event synchronization.
    }
    applyTheme(isTheme(event.newValue) ? event.newValue : systemTheme());
  }
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
