/** Manage browser-local appearance and independently disposable listeners. */
export const THEME_KEY = 'hirehub_theme';

/** Accept only literal saved preferences; corrupt values follow the OS.
 * @param {unknown} value Untrusted storage value.
 * @returns {string|null} Valid preference or no explicit choice.
 */
export function parseTheme(value) {
  return value === 'light' || value === 'dark' ? value : null;
}

/** Create a controller whose manual tab choice survives failed persistence.
 * @param {Window} browser Injectable browser boundary.
 * @returns {object} Snapshot, subscription, choice and disposal operations.
 */
export function createThemeController(browser = window) {
  let media = null;
  try {
    media = browser.matchMedia?.('(prefers-color-scheme: dark)') || null;
  } catch {
    // Manual appearance remains available without the optional media API.
    media = null;
  }
  let preference = null;
  let error = '';
  try {
    preference = parseTheme(browser.localStorage.getItem(THEME_KEY));
  } catch {
    error = 'Theme preference could not be read. Using system appearance.';
  }
  let snapshot;
  let disposed = false;
  const subscribers = new Set();

  /** Apply native-control appearance and notify mounted controls. */
  function apply(theme) {
    browser.document.documentElement.dataset.theme = theme;
    browser.document.documentElement.style.colorScheme = theme;
    snapshot = { theme, error };
    subscribers.forEach((listener) => listener(snapshot));
  }

  /** Follow OS changes only when no explicit tab choice exists. */
  function systemChanged() {
    if (!disposed && !preference) apply(media?.matches ? 'dark' : 'light');
  }

  /** Synchronize other tabs; removed or malformed values return to OS mode. */
  function storageChanged(event) {
    if (disposed || (event.key !== THEME_KEY && event.key !== null)) return;
    try {
      if (event.storageArea && event.storageArea !== browser.localStorage) return;
    } catch {
      return;
    }
    preference = parseTheme(event.key === null ? null : event.newValue);
    error = '';
    apply(preference || (media?.matches ? 'dark' : 'light'));
  }

  apply(preference || (media?.matches ? 'dark' : 'light'));
  browser.addEventListener('storage', storageChanged);
  if (media?.addEventListener) media.addEventListener('change', systemChanged);
  else media?.addListener?.(systemChanged);

  return {
    /** Return the current UI snapshot. */
    getSnapshot() {
      return snapshot;
    },
    /** Subscribe to updates and return an idempotent unsubscribe. */
    subscribe(listener) {
      if (!disposed) subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    /** Apply a valid choice and report persistence independently. */
    setTheme(value) {
      const theme = parseTheme(value);
      if (!theme || disposed) return { success: false, error: 'Theme choice is unavailable.' };
      preference = theme;
      error = '';
      try {
        browser.localStorage.setItem(THEME_KEY, theme);
      } catch {
        error = 'Theme changed for this tab, but was not saved. Browser storage is unavailable or full.';
      }
      apply(theme);
      return { success: !error, ...snapshot };
    },
    /** Remove only this controller's listeners; repeated cleanup is safe. */
    dispose() {
      if (disposed) return;
      disposed = true;
      browser.removeEventListener('storage', storageChanged);
      if (media?.removeEventListener) media.removeEventListener('change', systemChanged);
      else media?.removeListener?.(systemChanged);
      subscribers.clear();
    },
  };
}
