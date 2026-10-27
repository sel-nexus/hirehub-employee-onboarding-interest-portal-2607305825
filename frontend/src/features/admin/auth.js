/** Manage browser-local demo accounts and role sessions, never production authentication. */
import { USERS_KEY, SESSION_KEY, validUsers, persistChanges } from '../data/mockData';

export const AUTH_KEY = SESSION_KEY;
export const INVALID_CREDENTIALS = 'Invalid credentials. Please try again.';
export const LOGIN_STORAGE_ERROR = 'Unable to save or read the demo session. Enable local storage in your browser and try logging in again.';
export const LOGOUT_STORAGE_ERROR = 'Unable to remove the demo session. Enable local storage and try Logout again.';
export const REGISTER_STORAGE_ERROR = 'Unable to save your local account and session. Enable local storage or free browser space and try again.';
export const REGISTRATION_ERRORS = Object.freeze({
  displayName: 'Enter your name (2–100 characters).',
  username: 'Enter a valid email address (maximum 254 characters).',
  password: 'Use 8–128 characters without leading or trailing spaces.',
  confirmPassword: 'Passwords must match.',
  duplicate: 'An account with this email already exists.',
});

/** Read validated users or reject unavailable/corrupt accounts. @returns {object[]} @throws {Error} Invalid storage. */
function readUsers() {
  const users = JSON.parse(window.localStorage.getItem(USERS_KEY));
  if (!validUsers(users)) throw new Error('Invalid users');
  return users;
}

/**
 * Build only source-defined session fields using the current account.
 * @param {object} user
 * @returns {object}
 */
function sessionFor(user) {
  return { userId: user.id, role: user.role, displayName: user.displayName, loginTimestamp: new Date().toISOString() };
}

/**
 * Revalidate the persisted session against current local users, failing closed without writes.
 * @returns {object|null} A valid source-schema session, or null for any invalid/unavailable state.
 */
export function getSession() {
  try {
    const session = JSON.parse(window.localStorage.getItem(AUTH_KEY));
    if (!session || Array.isArray(session) || Object.keys(session).length !== 4
      || typeof session.userId !== 'string' || !['admin', 'candidate'].includes(session.role)
      || typeof session.displayName !== 'string' || typeof session.loginTimestamp !== 'string'
      || !Number.isFinite(Date.parse(session.loginTimestamp))
      || new Date(session.loginTimestamp).toISOString() !== session.loginTimestamp) return null;
    const user = readUsers().find((account) => account.id === session.userId);
    if (!user || user.role !== session.role || user.displayName !== session.displayName) return null;
    return session;
  } catch {
    return null;
  }
}

/** Check a specific role; default admin preserves legacy callers. @param {string} [role='admin'] @returns {boolean} */
export function isAuthenticated(role = 'admin') {
  return ['admin', 'candidate'].includes(role) && getSession()?.role === role;
}

/**
 * Match exact admin credentials or case-insensitive candidate email, then persist the role session.
 * @param {*} username
 * @param {*} password
 * @param {string} [role='admin']
 * @returns {{success: boolean, error: string, session?: object}}
 */
export function login(username, password, role = 'admin') {
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password
    || username !== username.trim() || !['admin', 'candidate'].includes(role)) {
    return { success: false, error: INVALID_CREDENTIALS };
  }
  try {
    const user = readUsers().find((account) => account.role === role && account.password === password
      && (role === 'candidate' ? account.username.toLowerCase() === username.toLowerCase() : account.username === username));
    if (!user) return { success: false, error: INVALID_CREDENTIALS };
    const session = sessionFor(user);
    window.localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    return { success: true, error: '', session };
  } catch {
    return { success: false, error: LOGIN_STORAGE_ERROR };
  }
}

/**
 * Validate signup fields independently, without coercing invalid input types.
 * @param {*} input Candidate name, email username, password and confirmation.
 * @returns {{values: object, errors: object}}
 */
export function validateRegistration(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const values = Object.fromEntries(['displayName', 'username', 'password', 'confirmPassword'].map((key) => [
    key, typeof source[key] === 'string' ? source[key] : '',
  ]));
  values.displayName = values.displayName.trim();
  values.username = values.username.trim().toLowerCase();
  const errors = {};
  if (values.displayName.length < 2 || values.displayName.length > 100 || /[<>\x00-\x1f]/.test(values.displayName)) errors.displayName = REGISTRATION_ERRORS.displayName;
  if (values.username.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(values.username)) errors.username = REGISTRATION_ERRORS.username;
  if (values.password.length < 8 || values.password.length > 128 || values.password !== values.password.trim()) errors.password = REGISTRATION_ERRORS.password;
  if (!values.confirmPassword || values.password !== values.confirmPassword) errors.confirmPassword = REGISTRATION_ERRORS.confirmPassword;
  return { values, errors };
}

/**
 * Persist a unique candidate and its session together, rolling back on a failed write.
 * Notes: Role and ID from caller input are ignored; no application is automatically created.
 * @param {*} input Candidate registration fields.
 * @returns {{success: boolean, error: string, fieldErrors: object, session?: object}}
 */
export function registerCandidate(input) {
  const { values, errors } = validateRegistration(input);
  if (Object.keys(errors).length) return { success: false, error: 'Please correct the registration fields.', fieldErrors: errors };
  try {
    const users = readUsers();
    if (users.some((user) => user.username.toLowerCase() === values.username)) {
      return { success: false, error: REGISTRATION_ERRORS.duplicate, fieldErrors: { username: REGISTRATION_ERRORS.duplicate } };
    }
    const user = { id: crypto.randomUUID(), role: 'candidate', username: values.username, password: values.password, displayName: values.displayName };
    if (users.some((account) => account.id === user.id)) return { success: false, error: REGISTER_STORAGE_ERROR, fieldErrors: {} };
    const session = sessionFor(user);
    const result = persistChanges(window.localStorage, {
      [USERS_KEY]: JSON.stringify([...users, user]),
      [AUTH_KEY]: JSON.stringify(session),
    });
    if (!result.success) return { success: false, error: `${REGISTER_STORAGE_ERROR} ${result.error}`, fieldErrors: {} };
    return { success: true, error: '', fieldErrors: {}, session };
  } catch {
    return { success: false, error: REGISTER_STORAGE_ERROR, fieldErrors: {} };
  }
}

/** Remove only the active local session; preserve failed removal for retry. @returns {{success: boolean, error: string}} */
export function logout() {
  try {
    window.localStorage.removeItem(AUTH_KEY);
    return { success: true, error: '' };
  } catch {
    return { success: false, error: LOGOUT_STORAGE_ERROR };
  }
}
