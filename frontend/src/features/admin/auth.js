/** Manage the browser-only demo session; this is not a security boundary. */
export const AUTH_KEY = 'hirehub_admin_auth';
export const INVALID_CREDENTIALS = 'Invalid credentials. Please try again.';
export const LOGIN_STORAGE_ERROR = 'Unable to save the demo session. Enable session storage in your browser and try logging in again.';
export const LOGOUT_STORAGE_ERROR = 'Unable to remove the demo session. Enable session storage and try Logout again, or close this tab to end the session.';

/**
 * Query the current demo session without caching or trusting invalid values.
 * Returns:
 *   True only for the exact stored string "true"; unavailable reads fail closed.
 */
export function isAuthenticated() {
  try {
    return window.sessionStorage.getItem(AUTH_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persist a demo session only for the exact hardcoded credentials.
 * Args:
 *   username: The unmodified username supplied by the form.
 *   password: The unmodified password supplied by the form.
 * Returns:
 *   A success result, or an actionable error without reporting successful login.
 * Notes:
 *   No real identity verification or production access control is provided.
 */
export function login(username, password) {
  if (username !== 'admin' || password !== 'admin') {
    return { success: false, error: INVALID_CREDENTIALS };
  }
  try {
    window.sessionStorage.setItem(AUTH_KEY, 'true');
    return { success: true, error: '' };
  } catch {
    return { success: false, error: LOGIN_STORAGE_ERROR };
  }
}

/**
 * Remove the demo session while preserving an actionable failure result.
 * Returns:
 *   Success after removal, including an absent key, or an error if removal fails.
 */
export function logout() {
  try {
    window.sessionStorage.removeItem(AUTH_KEY);
    return { success: true, error: '' };
  } catch {
    return { success: false, error: LOGOUT_STORAGE_ERROR };
  }
}
