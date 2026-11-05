/**
 * Persist validated browser-local demo data; never imply success after failed I/O.
 * Notes:
 *   Every API returns { success, data, error, warning }. Reads seed missing keys,
 *   preserve intentional [], and recover corrupt keys with a visible warning.
 *   hirehub_users stores exact account objects; hirehub_submissions stores strict
 *   six-field legacy records or complete extended records from seed.js, losslessly.
 *   hirehub_session stores null or { userId, role, displayName, loginTimestamp };
 *   identity, role and display name must match an existing user, with an ISO timestamp.
 *   saveDemoSubmissions replaces the complete mixed dataset (never a filtered view).
 *   Reset replaces only owned keys, removes both sessions, and preserves theme.
 *   A reset is best-effort across browser keys: partial failures are reported and
 *   the reset event fires only after every operation succeeds. No real auth exists.
 */
import { validDataset } from '../apply/submissions';
import { AUTH_KEY } from '../admin/auth';
import { DEFAULT_USERS, DEFAULT_SUBMISSIONS, hasFields, canonicalText, validTimestamp } from './seed';

export const USERS_KEY = 'hirehub_users';
export const DEMO_SUBMISSIONS_KEY = 'hirehub_submissions';
export const SESSION_KEY = 'hirehub_session';
export const DEMO_RESET_EVENT = 'hirehub:demo-reset';

/** Return consistent success, warning and failure envelopes to every consumer. */
function result(success, data, error = '', warning = '') {
  return { success, data, error, warning };
}

/** Validate exact account fields and unique identity, email and username. */
export function validUsers(users) {
  if (!Array.isArray(users)) return false;
  const ids = new Set();
  const emails = new Set();
  const usernames = new Set();
  return users.every((user) => {
    if (!hasFields(user, ['id', 'displayName', 'fullName', 'email', 'mobile', 'role', 'password', 'username'])) return false;
    if (!canonicalText(user.id) || !canonicalText(user.fullName, 100) || !/^[A-Za-z ]+$/.test(user.fullName)
      || !canonicalText(user.email, 254) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(user.email)
      || typeof user.mobile !== 'string' || !/^\d{10}$/.test(user.mobile)
      || !['candidate', 'admin'].includes(user.role) || !canonicalText(user.password, 200)
      || !canonicalText(user.username, 254) || !canonicalText(user.displayName, 100)) return false;
    const email = user.email.toLowerCase();
    const username = user.username.toLowerCase();
    if (ids.has(user.id) || emails.has(email) || usernames.has(username)) return false;
    ids.add(user.id);
    emails.add(email);
    usernames.add(username);
    return true;
  });
}

/** Save a complete validated value; invalid input leaves persisted data untouched. */
function save(key, data, validator) {
  if (!validator(data)) return result(false, null, `Invalid data for ${key}; nothing was saved.`);
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
    return result(true, JSON.parse(serialized));
  } catch {
    return result(false, null, 'Unable to save demo data. Enable browser storage or free space and try again.');
  }
}

/** Read fresh data, seed missing keys and visibly recover only affected corrupt data. */
function read(key, defaults, validator) {
  let raw;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return result(false, null, 'Unable to read demo data. Enable browser storage and try again.');
  }
  if (raw === null) return save(key, defaults, validator);
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  if (validator(data)) return result(true, data);
  const recovered = save(key, defaults, validator);
  return { ...recovered, warning: `Corrupted ${key} data was ${recovered.success ? 'recovered' : 'not recovered'}.` };
}

/** Requery accounts, preserving intentionally empty account arrays. */
export function readUsers() {
  return read(USERS_KEY, DEFAULT_USERS, validUsers);
}

/** Replace all accounts after exact schema and uniqueness validation. */
export function saveUsers(users) {
  return save(USERS_KEY, users, validUsers);
}

/** Read the complete mixed dataset without transforming legacy fields or metadata. */
export function readDemoSubmissions() {
  return read(DEMO_SUBMISSIONS_KEY, DEFAULT_SUBMISSIONS, validDataset);
}

/** Replace the complete mixed dataset, accepting no partial extended records. */
export function saveDemoSubmissions(submissions) {
  return save(DEMO_SUBMISSIONS_KEY, submissions, validDataset);
}

/** Require the complete timestamped session to match a stored account. */
function validSession(session, users) {
  return session === null || (hasFields(session, ['userId', 'role', 'displayName', 'loginTimestamp'])
    && validTimestamp(session.loginTimestamp)
    && users.some((user) => user.id === session.userId && user.role === session.role
      && user.displayName === session.displayName));
}

/** Read a role-aware session; invalid or stale sessions recover to signed out. */
export function readSession() {
  const users = readUsers();
  if (!users.success) return users;
  const session = read(SESSION_KEY, null, (value) => validSession(value, users.data));
  return { ...session, warning: [users.warning, session.warning].filter(Boolean).join(' ') };
}

/** Persist a validated account session, or null to sign out. */
export function saveSession(session) {
  const users = readUsers();
  if (!users.success) return users;
  return save(SESSION_KEY, session, (value) => validSession(value, users.data));
}

/** Initialize missing browser data before routes mount, aggregating visible feedback. */
export function initializeDemo() {
  const users = readUsers();
  const submissions = readDemoSubmissions();
  const session = readSession();
  const results = [users, submissions, session];
  return result(results.every((item) => item.success), {
    users: users.data, submissions: submissions.data, session: session.data,
  }, [...new Set(results.map((item) => item.error).filter(Boolean))].join(' '),
  [...new Set(results.map((item) => item.warning).filter(Boolean))].join(' '));
}

/** Restore eight applications and default accounts, clearing both session formats. */
export function resetMockData() {
  const users = saveUsers(DEFAULT_USERS);
  const submissions = saveDemoSubmissions(DEFAULT_SUBMISSIONS);
  if (!users.success || !submissions.success) return result(false, null, users.error || submissions.error);
  try {
    localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(AUTH_KEY);
  } catch {
    return result(false, null, 'Demo records were restored, but sessions could not be cleared. Enable browser storage and retry Reset.');
  }
  window.dispatchEvent(new CustomEvent(DEMO_RESET_EVENT));
  return result(true, { users: users.data, submissions: submissions.data, session: null });
}
