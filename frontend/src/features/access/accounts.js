/**
 * Provide browser-local demo accounts for access and later role-owned services.
 * Notes:
 *   All operations return {success, data, error, warning}; no network or real auth.
 *   readSession returns the exact userId/role/displayName/loginTimestamp session.
 *   currentUser and requireRole re-read storage, never trust a caller's identity.
 *   Users contain only id/role/username/password/displayName/fullName/email/mobile.
 *   Passwords are public demo values. Never trim passwords during authentication.
 */
import { readUsers, saveUsers, readSession as storedSession, saveSession, SESSION_KEY } from '../demo/storage';

export const SESSION_EVENT = 'hirehub:session-change';
let blocked = false;

/** Build a consistent failure envelope, optionally retaining field errors. */
function failure(error, warning = '', fields = {}) {
  return { success: false, data: null, error, warning, fields };
}

/** Notify mounted consumers after a session change or failed persistence. */
function notify() {
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

/** Normalize contact text only; non-string input stays invalid. */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate contacts using the existing demo storage constraints for later reuse.
 * Args:
 *   details: Untrusted fullName, email and mobile values.
 * Returns:
 *   Field errors keyed by contact name; an empty object means valid contacts.
 */
export function validateContact(details = {}) {
  const fields = {};
  const fullName = text(details?.fullName);
  const email = text(details?.email);
  const mobile = text(details?.mobile);
  if (!fullName || fullName.length > 100 || !/^[A-Za-z ]+$/.test(fullName)) {
    fields.fullName = 'Enter a name using letters and spaces (up to 100 characters).';
  }
  if (!email || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    fields.email = 'Enter a valid email address (up to 254 characters).';
  }
  if (!/^\d{10}$/.test(mobile)) fields.mobile = 'Enter a 10-digit mobile number.';
  return fields;
}

/** Read fresh sessions, denying access after an unsuccessful logout until new login. */
export function readSession() {
  const result = storedSession();
  if (!result.success) return { ...result, data: null };
  if (blocked) return failure('This session is signed out. Log in again to continue.', result.warning);
  return result;
}

/** Resolve a stored session to its account; absent, stale or unreadable identity fails closed. */
export function currentUser() {
  const session = readSession();
  if (!session.success) return session;
  if (!session.data) return failure('Please log in to continue.', session.warning);
  const users = readUsers();
  if (!users.success) return users;
  const user = users.data.find((item) => item.id === session.data.userId
    && item.role === session.data.role && item.displayName === session.data.displayName);
  return user ? { success: true, data: user, error: '', warning: session.warning || users.warning }
    : failure('Please log in to continue.', session.warning);
}

/** Require an explicit supported role before a service reads or changes owned records. */
export function requireRole(role) {
  if (!['candidate', 'admin'].includes(role)) return failure('Unsupported account role.');
  const user = currentUser();
  if (!user.success) return user;
  return user.data.role === role ? user : failure('This account cannot access that area.', user.warning);
}

/** Persist only the exact session schema and revoke in-memory access on failure. */
function signIn(user, warning = '') {
  const saved = saveSession({ userId: user.id, role: user.role, displayName: user.displayName,
    loginTimestamp: new Date().toISOString() });
  blocked = !saved.success;
  notify();
  return { ...saved, warning: warning || saved.warning };
}

/**
 * Authenticate by normalized username and exact password within the selected role.
 * Args:
 *   username: Case-insensitive username with surrounding whitespace ignored.
 *   password: Exact password, including any surrounding whitespace.
 *   role: candidate or admin; another role is always rejected.
 * Returns:
 *   The saved session or an actionable failure; never a fabricated identity.
 */
export function authenticate(username, password, role) {
  if (!['candidate', 'admin'].includes(role) || !text(username) || typeof password !== 'string' || !password) {
    return failure('Enter a username, password and valid account role.');
  }
  const users = readUsers();
  if (!users.success) return users;
  const user = users.data.find((item) => item.username.toLowerCase() === text(username).toLowerCase()
    && item.password === password && item.role === role);
  if (!user) return failure('Invalid credentials for the selected role. Please try again.', users.warning);
  return signIn(user, users.warning);
}

/**
 * Register a candidate and sign in only after both writes succeed.
 * Args:
 *   details: fullName, email, mobile and an unmodified password.
 * Returns:
 *   A persisted session or field/storage errors. Failed session writes roll back
 *   the account; failed rollback is explicit so callers never report success.
 */
export function register(details = {}) {
  const fields = validateContact(details);
  const password = details?.password;
  if (typeof password !== 'string' || password.length < 8 || password.length > 200 || password !== password.trim()) {
    fields.password = 'Use 8–200 characters without leading or trailing spaces.';
  }
  if (Object.keys(fields).length) return failure('Check the highlighted fields.', '', fields);
  const users = readUsers();
  if (!users.success) return users;
  const email = text(details.email).toLowerCase();
  if (users.data.some((user) => user.username.toLowerCase() === email || user.email.toLowerCase() === email)) {
    return failure('An account with this email already exists.', users.warning, { email: 'This email is already registered.' });
  }
  const fullName = text(details.fullName);
  const user = { id: `user-${crypto.randomUUID()}`, role: 'candidate', username: email, password,
    displayName: fullName, fullName, email, mobile: text(details.mobile) };
  const saved = saveUsers([...users.data, user]);
  if (!saved.success) return saved;
  const session = signIn(user, users.warning);
  if (session.success) return session;
  const rollback = saveUsers(users.data);
  return failure(`${session.error} ${rollback.success ? 'Registration was rolled back; please retry.'
    : 'Registration rollback failed; the account may exist. Retry login or Reset demo.'}`, users.warning);
}

/** Remove only the persistent session and deny stale access even when removal fails. */
export function logout() {
  blocked = true;
  let result;
  try {
    localStorage.removeItem(SESSION_KEY);
    result = { success: true, data: null, error: '', warning: '' };
  } catch {
    result = failure('Unable to clear the saved session. Access is blocked in this tab; enable storage and retry Logout.');
  }
  blocked = !result.success;
  notify();
  return result;
}
