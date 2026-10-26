/** Read private candidate projections and persist contact edits in browser demo storage. */
import { readSession, readUsers } from '../admin/auth';
import { USERS_KEY, SESSION_KEY } from '../demo/mockData';
import { SUBMISSIONS_KEY } from '../apply/submissions';
import { validateSubmission } from '../apply/validation';

const STORAGE_ERROR = 'Unable to read candidate data. Check browser storage permissions or try Reset Mock Data.';
const SAVE_ERROR = 'Unable to save your profile. Check browser storage permissions or available space and try again.';

/**
 * Read records without mutation or the legacy global email-uniqueness constraint.
 * Returns:
 *   Raw records for identity-based matching, including multiple applications.
 * Raises:
 *   Error on unavailable or malformed storage; never seeds or resets records.
 * @returns {object[]}
 */
function readRecords() {
  const raw = window.localStorage.getItem(SUBMISSIONS_KEY);
  const records = raw === null ? [] : JSON.parse(raw);
  const ids = new Set();
  if (!Array.isArray(records) || !records.every((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || !['id', 'fullName', 'email', 'mobile', 'department', 'submittedAt']
        .every((key) => typeof record[key] === 'string')
      || !record.id.trim() || ids.has(record.id)
      || (Object.hasOwn(record, 'userId') && typeof record.userId !== 'string')) return false;
    ids.add(record.id);
    return true;
  })) throw new Error(STORAGE_ERROR);
  return records;
}

/**
 * Return only the active candidate's linked applications and contact profile.
 * Returns:
 *   A fresh privacy projection or an error with no retained personal data.
 * Notes:
 *   Email alone never proves ownership of unlinked legacy submissions.
 * @returns {{success: boolean, error: string, userId?: string, profile?: object, applications?: object[]}}
 */
export function readCandidate() {
  try {
    const session = readSession();
    if (session?.role !== 'candidate') return { success: false, error: 'Sign in with a candidate account to view your applications.' };
    const user = readUsers().find((account) => account.id === session.userId);
    const own = readRecords().filter((record) => record.userId === session.userId);
    const applications = own.map((record) => Object.fromEntries(
      ['id', 'fullName', 'email', 'mobile', 'department', 'submittedAt', 'status', 'interviewSchedule', 'sampleResume']
        .map((key) => [key, typeof record[key] === 'string' ? record[key] : '']),
    ));
    return {
      success: true, error: '', userId: user.id,
      profile: { fullName: user.displayName, email: user.username, mobile: own[0]?.mobile || user.mobile || '' },
      applications,
    };
  } catch {
    return { success: false, error: STORAGE_ERROR };
  }
}

/**
 * Reuse public contact validation without introducing a department field.
 * Args:
 *   input: Untrusted name, email and mobile values.
 * Returns:
 *   Trimmed contact values and field errors; invalid types are not coerced.
 * @param {*} input
 * @returns {{values: object, errors: object}}
 */
export function validateProfile(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const { values, errors } = validateSubmission({ ...source, department: 'Engineering' });
  if (values.email.length > 254) errors.email = 'Enter a valid email address (maximum 254 characters).';
  return {
    values: { fullName: values.fullName, email: values.email.toLowerCase(), mobile: values.mobile },
    errors,
  };
}

/**
 * Update contact fields by immutable user identity and verify all persistent writes.
 * Args:
 *   userId: Identity captured when the form opened; reject a changed session.
 *   input: Contact fields, validated using the existing application rules.
 * Returns:
 *   Honest success or field/storage errors, with exact rollback when possible.
 * Notes:
 *   Preserve passwords, roles, IDs, timestamps and internal metadata. Browser keys
 *   are not atomic; a failed rollback explicitly warns that changes may be partial.
 * @param {string} userId
 * @param {*} input
 * @returns {{success: boolean, error: string, errors?: object}}
 */
export function saveProfile(userId, input) {
  const { values, errors } = validateProfile(input);
  if (Object.keys(errors).length) return { success: false, error: 'Please correct the contact details.', errors };
  let storage;
  const previous = new Map();
  const attempted = [];
  try {
    storage = window.localStorage;
    const session = readSession();
    if (session?.role !== 'candidate' || session.userId !== userId) {
      return { success: false, error: 'Your candidate identity changed. Sign in again before editing your profile.' };
    }
    for (const key of [USERS_KEY, SUBMISSIONS_KEY, SESSION_KEY]) previous.set(key, storage.getItem(key));
    const users = readUsers();
    const records = readRecords();
    if (users.some((user) => user.id !== userId && user.username.toLowerCase() === values.email)
      || records.some((record) => record.userId !== userId && record.email.trim().toLowerCase() === values.email)) {
      return { success: false, error: 'This email is already used by another account or application.', errors: { email: 'Choose an email not used by another account or application.' } };
    }
    const next = [
      [USERS_KEY, JSON.stringify(users.map((user) => user.id === userId
        ? { ...user, displayName: values.fullName, username: values.email, mobile: values.mobile } : user))],
      [SUBMISSIONS_KEY, JSON.stringify(records.map((record) => record.userId === userId ? { ...record, ...values } : record))],
      [SESSION_KEY, JSON.stringify({ ...session, displayName: values.fullName })],
    ];
    for (const [key, raw] of next) {
      attempted.push(key);
      storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) throw new Error('Write was not retained');
    }
    return { success: true, error: '' };
  } catch {
    let restored = true;
    for (const key of attempted.reverse()) {
      try {
        const raw = previous.get(key);
        if (storage.getItem(key) === raw) continue;
        if (raw === null) storage.removeItem(key);
        else storage.setItem(key, raw);
        if (storage.getItem(key) !== raw) restored = false;
      } catch {
        restored = false;
      }
    }
    return {
      success: false,
      error: restored ? `${SAVE_ERROR} Previous data was retained.`
        : `${SAVE_ERROR} Rollback also failed; changes may be partial. Check your account or try Reset Mock Data before retrying.`,
    };
  }
}
