/** Apply browser-local themes before rendering and synchronize external preferences. */
import { useEffect, useState } from 'react';

export const THEME_KEY = 'hirehub_theme';
export const THEME_STORAGE_ERROR = 'Theme preference could not be saved or read. Enable local storage or free browser space and retry. Changes are temporary until saved.';

/** Return the OS preference, safely defaulting without matchMedia. @returns {string} */
function systemTheme() {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Resolve valid saved preference or OS fallback without writing storage. @returns {object} */
export function readTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return { theme: saved === 'dark' || saved === 'light' ? saved : systemTheme(), error: '' };
  } catch {
    return { theme: systemTheme(), error: THEME_STORAGE_ERROR };
  }
}

/** Set root tokens before React returns visible content. @param {string} theme @returns {void} */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
}

/** Save only valid preferences; never claim persistence on failure. @param {string} theme @returns {object} */
export function saveTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') return { success: false, error: 'Choose a light or dark theme.' };
  try {
    window.localStorage.setItem(THEME_KEY, theme);
    return { success: true, error: '' };
  } catch {
    return { success: false, error: THEME_STORAGE_ERROR };
  }
}

/**
 * Observe OS changes only without an explicit preference, and cross-tab storage updates.
 * Args: notify: Receive the resolved theme and any read error.
 * Returns: A cleanup function removing every installed listener.
 */
export function subscribeTheme(notify) {
  /** Reread actual storage rather than trusting an event payload. */
  function sync() { notify(readTheme()); }
  /** Ignore unrelated keys and sessionStorage notifications. */
  function onStorage(event) {
    if (event.key !== null && event.key !== THEME_KEY) return;
    try {
      if (event.storageArea && event.storageArea !== window.localStorage) return;
    } catch { /* readTheme exposes the unavailable-storage error. */ }
    sync();
  }
  let media;
  try { media = window.matchMedia?.('(prefers-color-scheme: dark)'); } catch { media = null; }
  window.addEventListener('storage', onStorage);
  if (media?.addEventListener) media.addEventListener('change', sync);
  else media?.addListener?.(sync);
  return () => {
    window.removeEventListener('storage', onStorage);
    if (media?.removeEventListener) media.removeEventListener('change', sync);
    else media?.removeListener?.(sync);
  };
}

/** Initialize before paint and expose a temporary toggle with honest persistence feedback. @returns {object} */
export function useTheme() {
  const [state, setState] = useState(() => {
    const initial = readTheme();
    applyTheme(initial.theme);
    return initial;
  });
  useEffect(() => subscribeTheme((next) => {
    applyTheme(next.theme);
    setState(next);
  }), []);
  /** Apply immediately even when saving fails; the alert explains the temporary state. */
  function toggleTheme() {
    const theme = state.theme === 'dark' ? 'light' : 'dark';
    const result = saveTheme(theme);
    applyTheme(theme);
    setState({ theme, error: result.error });
  }
  /** Recheck storage after the shell's explicit recovery action. */
  function refreshTheme() {
    const next = readTheme();
    applyTheme(next.theme);
    setState(next);
  }
  return { ...state, toggleTheme, refreshTheme };
}
