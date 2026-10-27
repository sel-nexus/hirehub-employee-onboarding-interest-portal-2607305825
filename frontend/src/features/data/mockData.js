/** Seed and restore browser-local demo data without discarding valid legacy records. */
import { validateSubmission, DEPARTMENTS as LEGACY_DEPARTMENTS } from '../apply/validation';

export const USERS_KEY = 'hirehub_users';
export const SUBMISSIONS_KEY = 'hirehub_submissions';
export const DEPARTMENTS_KEY = 'hirehub_departments';
export const SESSION_KEY = 'hirehub_session';
export const DATA_STORAGE_ERROR = 'Unable to access or save mock data. Enable local storage or free browser space and retry.';
export const DEFAULT_DEPARTMENTS = Object.freeze(['Engineering', 'Design', 'Product', 'Marketing', 'Operations']);
export const DEFAULT_USERS = Object.freeze([
  { id: 'u-admin', role: 'admin', username: 'admin', password: 'admin', displayName: 'Talent Admin' },
  { id: 'u-recruiter', role: 'admin', username: 'recruiter@hirehub.demo', password: 'admin123', displayName: 'Demo Recruiter' },
  ...['Alex Rivera', 'Jordan Lee', 'Taylor Morgan', 'Casey Chen', 'Sam Patel', 'Riley Brooks', 'Morgan Davis', 'Jamie Wilson'].map((displayName, index) => ({
    id: `u-${201 + index}`,
    role: 'candidate',
    username: `${displayName.split(' ')[0].toLowerCase()}@example.com`,
    password: 'password123',
    displayName,
  })),
].map(Object.freeze));
export const DEFAULT_SUBMISSIONS = Object.freeze(DEFAULT_USERS.filter((user) => user.role === 'candidate').map((user, index) => Object.freeze({
  id: `c-${101 + index}`,
  userId: user.id,
  fullName: user.displayName,
  email: user.username,
  mobile: index === 0 ? '4155552671' : `41555526${72 + index}`,
  department: DEFAULT_DEPARTMENTS[index % DEFAULT_DEPARTMENTS.length],
  status: ['interview', 'review', 'offer', 'received', 'archived', 'applied', 'review', 'interview'][index],
  submittedAt: `2026-10-${20 + index}T10:15:00.000Z`,
  notes: index === 0 ? 'Strong background in React and frontend architecture.' : '',
  portfolioUrl: index === 0 ? 'https://alexrivera.dev' : '',
  sampleResume: index === 0 ? 'Frontend Software Engineer (5 YOE)' : 'Full-Stack Developer Resume (Sample)',
})));

/**
 * Validate a canonical nonempty string without coercing untrusted values.
 * @param {*} value
 * @returns {boolean}
 */
function text(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

/**
 * Require unique IDs and valid locally stored user credentials.
 * @param {*} users
 * @returns {boolean}
 */
export function validUsers(users) {
  if (!Array.isArray(users)) return false;
  const ids = new Set();
  const usernames = new Set();
  return users.every((user) => {
    if (!user || Array.isArray(user) || !['admin', 'candidate'].includes(user.role)
      || !['id', 'username', 'password', 'displayName'].every((key) => text(user[key]))) return false;
    if (ids.has(user.id) || usernames.has(user.username.toLowerCase())) return false;
    ids.add(user.id);
    usernames.add(user.username.toLowerCase());
    return true;
  });
}

/**
 * Accept intact legacy records and source extensions without migrating or removing fields.
 * Notes: Product is valid in the new schema even though the legacy public form lacks it.
 * @param {*} records
 * @returns {boolean}
 */
export function validSubmissions(records) {
  if (!Array.isArray(records)) return false;
  const ids = new Set();
  const emails = new Set();
  return records.every((record) => {
    if (!record || Array.isArray(record) || !text(record.id) || !text(record.submittedAt)) return false;
    const { values, errors } = validateSubmission({ ...record, department: 'Engineering' });
    if (Object.keys(errors).length || ['fullName', 'email', 'mobile'].some((key) => values[key] !== record[key])) return false;
    if (![...DEFAULT_DEPARTMENTS, ...LEGACY_DEPARTMENTS].includes(record.department)) return false;
    if (!Number.isFinite(Date.parse(record.submittedAt)) || new Date(record.submittedAt).toISOString() !== record.submittedAt) return false;
    for (const key of ['userId', 'status', 'notes', 'portfolioUrl', 'sampleResume']) {
      if (key in record && typeof record[key] !== 'string') return false;
    }
    if ('status' in record && !['received', 'applied', 'review', 'interview', 'offer', 'archived'].includes(record.status)) return false;
    if (ids.has(record.id) || emails.has(record.email.toLowerCase())) return false;
    ids.add(record.id);
    emails.add(record.email.toLowerCase());
    return true;
  });
}

/** Validate an intentional empty or unique department configuration. @param {*} value @returns {boolean} */
function validDepartments(value) {
  return Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
}

/**
 * Apply key changes with best-effort rollback and never claim partial writes succeeded.
 * @param {Storage} storage Injectable storage for independent testing.
 * @param {Object<string, string|null>} changes Serialized values; null removes a key.
 * @returns {{success: boolean, error: string}}
 */
export function persistChanges(storage, changes) {
  const previous = {};
  const attempted = [];
  try {
    for (const key of Object.keys(changes)) previous[key] = storage.getItem(key);
    for (const [key, value] of Object.entries(changes)) {
      attempted.push(key);
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    }
    return { success: true, error: '' };
  } catch {
    let rollbackFailed = false;
    for (const key of attempted.reverse()) {
      try {
        if (previous[key] === null) storage.removeItem(key);
        else storage.setItem(key, previous[key]);
      } catch {
        rollbackFailed = true;
      }
    }
    return { success: false, error: `${DATA_STORAGE_ERROR}${rollbackFailed ? ' Some changes could not be rolled back; retry recovery before continuing.' : ''}` };
  }
}

/**
 * Read all datasets without writing or passing extended records to the legacy service.
 * @param {Storage} [storage] Browser localStorage by default.
 * @returns {{success: boolean, error: string, users: object[], submissions: object[], departments: string[]}}
 */
export function readMockData(storage) {
  try {
    const store = storage ?? window.localStorage;
    const users = JSON.parse(store.getItem(USERS_KEY));
    const submissions = JSON.parse(store.getItem(SUBMISSIONS_KEY));
    const departments = JSON.parse(store.getItem(DEPARTMENTS_KEY));
    if (!validUsers(users) || !validSubmissions(submissions) || !validDepartments(departments)) {
      return { success: false, error: 'Mock data is missing or corrupt. Retry demo initialization.', users: [], submissions: [], departments: [] };
    }
    return { success: true, error: '', users, submissions, departments };
  } catch {
    return { success: false, error: DATA_STORAGE_ERROR, users: [], submissions: [], departments: [] };
  }
}

/**
 * Seed missing datasets once and recover corrupt datasets with explicit feedback.
 * Notes: Valid existing arrays, including [], remain byte-for-byte unchanged.
 * @param {Storage} [storage] Browser localStorage by default.
 * @returns {{success: boolean, error: string, recovered: string[]}}
 */
export function seedMockData(storage) {
  try {
    const store = storage ?? window.localStorage;
    const recovered = [];
    const changes = {};
    for (const [key, defaults, validate] of [
      [USERS_KEY, DEFAULT_USERS, validUsers],
      [SUBMISSIONS_KEY, DEFAULT_SUBMISSIONS, validSubmissions],
      [DEPARTMENTS_KEY, DEFAULT_DEPARTMENTS, validDepartments],
    ]) {
      const raw = store.getItem(key);
      let valid = false;
      try {
        valid = raw !== null && validate(JSON.parse(raw));
      } catch {
        valid = false;
      }
      if (!valid) {
        changes[key] = JSON.stringify(defaults);
        if (raw !== null) recovered.push(key);
      }
    }
    // Accounts recovered from corruption must not revive an old identity/session.
    if (recovered.includes(USERS_KEY)) changes[SESSION_KEY] = null;
    const result = persistChanges(store, changes);
    return { ...result, recovered: result.success ? recovered : [] };
  } catch {
    return { success: false, error: DATA_STORAGE_ERROR, recovered: [] };
  }
}

/**
 * Restore curated accounts, eight applications and departments; clear only the local session.
 * Notes: Theme and unrelated keys survive; failed writes return errors with best-effort rollback.
 * @param {Storage} [storage] Browser localStorage by default.
 * @returns {{success: boolean, error: string}}
 */
export function resetToDefaults(storage) {
  try {
    return persistChanges(storage ?? window.localStorage, {
      [SESSION_KEY]: null,
      [USERS_KEY]: JSON.stringify(DEFAULT_USERS),
      [SUBMISSIONS_KEY]: JSON.stringify(DEFAULT_SUBMISSIONS),
      [DEPARTMENTS_KEY]: JSON.stringify(DEFAULT_DEPARTMENTS),
    });
  } catch {
    return { success: false, error: DATA_STORAGE_ERROR };
  }
}
