/** Manage persistent local demo identities, never production authentication. */
import { USERS_KEY, SESSION_KEY, validUsers } from '../demo/mockData';
import { validateSubmission } from '../apply/validation';

// Retain the legacy key for the demo reset utility, not authentication.
export const AUTH_KEY = 'hirehub_admin_auth';
export const INVALID_CREDENTIALS = 'Invalid credentials. Please try again.';
export const LOGIN_STORAGE_ERROR = 'Unable to save the demo session. Enable local storage in your browser and try logging in again.';
export const LOGOUT_STORAGE_ERROR = 'Unable to remove the demo session. Enable local storage and try Logout again. Closing this tab does not end the session.';
export const REGISTER_STORAGE_ERROR = 'Unable to save your demo account and session. Check browser storage permissions or quota and try again.';

/**
 * Read accounts without silently replacing corrupt or unavailable storage.
 * Returns:
 *   The validated stored account array, or an empty array for an absent store.
 * Raises:
 *   Error when storage cannot be read or the stored account data is malformed.
 * @returns {Array<{id: string, role: string, username: string, password: string, displayName: string}>}
 */
export function readUsers() {
  const raw = window.localStorage.getItem(USERS_KEY);
  const users = raw === null ? [] : JSON.parse(raw);
  if (!validUsers(users)) throw new Error('Invalid demo accounts. Try Reset Mock Data.');
  return users;
}

/**
 * Validate every session field against the current stored account, failing closed.
 * Returns:
 *   The four-field session identity, or null for missing, malformed or unreadable data.
 * @returns {{userId: string, role: string, displayName: string, loginTimestamp: string}|null}
 */
export function readSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(SESSION_KEY));
    if (!session || typeof session !== 'object' || Array.isArray(session)
      || Object.keys(session).length !== 4
      || !['userId', 'role', 'displayName', 'loginTimestamp'].every((key) => typeof session[key] === 'string')
      || !['admin', 'candidate'].includes(session.role)
      || !Number.isFinite(Date.parse(session.loginTimestamp))
      || new Date(session.loginTimestamp).toISOString() !== session.loginTimestamp) return null;
    const user = readUsers().find((account) => account.id === session.userId);
    if (!user || user.role !== session.role || user.displayName !== session.displayName) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Query the current identity without caching; keep legacy admin guards compatible.
 * Args:
 *   role: Required role, defaulting to admin for existing callers.
 * Returns:
 *   Whether the current valid session has that role.
 * @param {string} [role='admin']
 * @returns {boolean}
 */
export function isAuthenticated(role = 'admin') {
  return readSession()?.role === role;
}

/** Persist only the four public identity fields; let callers report write failures. */
function writeSession(user) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({
    userId: user.id, role: user.role, displayName: user.displayName,
    loginTimestamp: new Date().toISOString(),
  }));
}

/**
 * Verify exact credentials and selected role against stored demo accounts.
 * Args:
 *   username: Unmodified username; credential comparison remains exact.
 *   password: Unmodified password.
 *   role: Candidate or admin; defaults to admin for two-argument callers.
 * Returns:
 *   A success/error result; failed credentials never write or clear storage.
 * @param {string} username
 * @param {string} password
 * @param {string} [role='admin']
 * @returns {{success: boolean, error: string}}
 */
export function login(username, password, role = 'admin') {
  if (typeof username !== 'string' || typeof password !== 'string'
    || !username || !password || !['admin', 'candidate'].includes(role)) {
    return { success: false, error: INVALID_CREDENTIALS };
  }
  try {
    const user = readUsers().find((account) => account.username === username
      && account.password === password && account.role === role);
    if (!user) return { success: false, error: INVALID_CREDENTIALS };
    writeSession(user);
    return { success: true, error: '' };
  } catch {
    return { success: false, error: LOGIN_STORAGE_ERROR };
  }
}

/**
 * Validate signup and create a candidate account plus immediate persistent session.
 * Args:
 *   input: Full name, email, mobile and password supplied by the signup form.
 * Returns:
 *   A success/error result. Restore the exact prior users value on session failure.
 * Notes:
 *   Retain validated mobile contact for candidates without applications;
 *   legacy five-field accounts remain valid.
 * @param {{fullName: string, email: string, mobile: string, password: string}} input
 * @returns {{success: boolean, error: string}}
 */
export function registerCandidate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !['fullName', 'email', 'mobile', 'password'].every((key) => typeof input[key] === 'string')) {
    return { success: false, error: 'Enter a name, email, mobile number and password.' };
  }
  const { mobile, password } = input;
  // Signup accepts formatting, but never truncates country codes or extra digits.
  // Persist the application's ten-digit contact contract for future profile edits.
  const { values, errors } = validateSubmission({
    ...input, mobile: mobile.replace(/\D/g, ''), department: 'Engineering',
  });
  if (errors.fullName) return { success: false, error: errors.fullName };
  if (errors.email || values.email.length > 254) return { success: false, error: 'Enter a valid email address (maximum 254 characters).' };
  if (!/^\+?[\d ()-]+$/.test(mobile.trim()) || errors.mobile) {
    return { success: false, error: 'Enter exactly 10 digits for your mobile number, without a country code. Spaces, parentheses and hyphens are allowed and removed when saved.' };
  }
  if (password.length < 8 || !password.trim()) return { success: false, error: 'Use a password with at least 8 characters.' };
  let previous;
  let accountWritten = false;
  try {
    previous = window.localStorage.getItem(USERS_KEY);
    const users = readUsers();
    const username = values.email.toLowerCase();
    if (users.some((user) => user.username.toLowerCase() === username)) {
      return { success: false, error: 'An account with this email already exists. Please log in.' };
    }
    const user = { id: `u-${crypto.randomUUID()}`, role: 'candidate', username, password, displayName: values.fullName, mobile: values.mobile };
    window.localStorage.setItem(USERS_KEY, JSON.stringify([...users, user]));
    accountWritten = true;
    writeSession(user);
    return { success: true, error: '' };
  } catch {
    if (accountWritten) {
      try {
        if (previous === null) window.localStorage.removeItem(USERS_KEY);
        else window.localStorage.setItem(USERS_KEY, previous);
      } catch {
        return { success: false, error: `${REGISTER_STORAGE_ERROR} Account rollback also failed; try Reset Mock Data before retrying.` };
      }
    }
    return { success: false, error: REGISTER_STORAGE_ERROR };
  }
}

/**
 * Remove the persistent session without clearing accounts or other demo records.
 * Returns:
 *   An idempotent success result or an honest storage-removal error.
 * @returns {{success: boolean, error: string}}
 */
export function logout() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
    return { success: true, error: '' };
  } catch {
    return { success: false, error: LOGOUT_STORAGE_ERROR };
  }
}
