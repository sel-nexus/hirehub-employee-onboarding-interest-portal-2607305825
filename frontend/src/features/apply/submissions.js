/** Persist validated candidate records exclusively in browser localStorage. */
import { validateSubmission } from './validation';

export const SUBMISSIONS_KEY = 'hirehub_submissions';
export const DUPLICATE_EMAIL_ERROR = 'This email has already been submitted.';
const RECORD_KEYS = ['id', 'fullName', 'email', 'mobile', 'department', 'submittedAt'];
export const SUBMISSION_STATUSES = ['applied', 'review', 'interview', 'offer', 'archived'];
const OPTIONAL_KEYS = ['userId', 'status', 'notes', 'portfolioUrl', 'sampleResume', 'interviewSchedule'];
const EDITABLE_METADATA = ['notes', 'portfolioUrl', 'sampleResume', 'interviewSchedule'];
export const STATUS_LABELS = Object.freeze({
  applied: 'Application Received',
  review: 'Under Review',
  interview: 'Interview Scheduled',
  offer: 'Offer Extended',
  archived: 'Archived / Not Selected',
});
export const METADATA_LIMITS = Object.freeze({ notes: 5000, portfolioUrl: 2048, interviewSchedule: 500, sampleResume: 100 });
// Fixture contract tests keep these labels aligned with SAMPLE_RESUMES.
// Importing the seeder here would create a service/seeder initialization cycle.
const RESUME_LABELS = ['Frontend Software Engineer (5 YOE)', 'Full-Stack Developer Resume (Sample)', 'UI/UX Case Study'];

/**
 * Validate optional metadata without coercing types or changing contact rules.
 * Args:
 *   input: A record containing optional strings.
 * Returns:
 *   Errors for present fields; absent fields remain optional.
 * @param {object} input
 * @returns {object}
 */
export function validateSubmissionMetadata(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  for (const key of OPTIONAL_KEYS) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (typeof value !== 'string') {
      errors[key] = 'Enter text for this field.';
    } else if (METADATA_LIMITS[key] && value.length > METADATA_LIMITS[key]) {
      errors[key] = `Use at most ${METADATA_LIMITS[key]} characters.`;
    } else if (key === 'userId' && (!value.trim() || value !== value.trim())) {
      errors[key] = 'Provide a nonempty user identity without surrounding spaces.';
    } else if (key === 'status' && !SUBMISSION_STATUSES.includes(value)) {
      errors[key] = 'Select a valid hiring status.';
    } else if (key === 'sampleResume' && value !== '' && !RESUME_LABELS.includes(value)) {
      errors[key] = 'Select a bundled sample resume.';
    } else if (key === 'portfolioUrl' && value !== '' && !safePortfolioUrl(value)) {
      errors[key] = 'Use an http or https portfolio URL.';
    }
  }
  return errors;
}

/** Return a safe absolute http/https URL or an empty string for unsafe input. */
export function safePortfolioUrl(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > METADATA_LIMITS.portfolioUrl) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

/** Write a complete dataset and verify persistence; throw actionable storage errors. */
function writeSubmissions(records) {
  try {
    const raw = JSON.stringify(records);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    if (localStorage.getItem(SUBMISSIONS_KEY) !== raw) throw new Error('Storage did not retain the saved records.');
  } catch (cause) {
    throw new Error('Unable to save submissions. Check browser storage permissions or available space and try again.', { cause });
  }
}

/** Allow repeated emails only when both records belong to the same nonempty user. */
function sameLinkedUser(first, second) {
  return typeof first.userId === 'string' && Boolean(first.userId.trim()) && first.userId === second.userId;
}

/**
 * Reject malformed records, noncanonical fields and conflicting identities.
 * Args:
 *   records: Parsed untrusted storage contents.
 * Returns:
 *   Whether every record is valid, IDs are unique and email ownership is consistent.
 * @param {*} records
 * @returns {boolean}
 */
export function validDataset(records) {
  if (!Array.isArray(records)) return false;
  const ids = new Set();
  const emails = new Map();
  return records.every((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    if (!RECORD_KEYS.every((key) => typeof record[key] === 'string')
      || Object.keys(record).some((key) => !RECORD_KEYS.includes(key) && !OPTIONAL_KEYS.includes(key))
      || Object.keys(validateSubmissionMetadata(record)).length) return false;
    const { values, errors } = validateSubmission(record);
    if (Object.keys(errors).length || Object.keys(values).some((key) => values[key] !== record[key])) return false;
    if (!record.id.trim() || record.id !== record.id.trim()) return false;
    const date = new Date(record.submittedAt);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== record.submittedAt) return false;
    const email = record.email.toLowerCase();
    if (ids.has(record.id) || (emails.has(email) && !sameLinkedUser(emails.get(email), record))) return false;
    ids.add(record.id);
    emails.set(email, record);
    return true;
  });
}

/** Requery storage, resetting corrupt data to a persisted empty array; throw on storage failure. */
export function readSubmissions() {
  let raw;
  try {
    raw = localStorage.getItem(SUBMISSIONS_KEY);
  } catch (cause) {
    throw new Error('Unable to read submissions. Check browser storage permissions and try again.', { cause });
  }
  if (raw === null) return [];
  let records;
  try {
    records = JSON.parse(raw);
  } catch {
    writeSubmissions([]);
    return [];
  }
  if (!validDataset(records)) {
    writeSubmissions([]);
    return [];
  }
  return records;
}

/** Throw field-associated errors when an application or its metadata is invalid. */
function requireValid(input) {
  const { values, errors: contactErrors } = validateSubmission(input);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = { ...contactErrors, ...validateSubmissionMetadata(source) };
  if (Object.keys(errors).length) {
    const error = new Error('Please correct the application fields.');
    error.fieldErrors = errors;
    throw error;
  }
  return {
    ...values,
    ...Object.fromEntries(OPTIONAL_KEYS.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]])),
  };
}

/**
 * Append a validated record, rejecting conflicting or unlinked duplicate emails.
 * Args:
 *   input: Contact details and optional metadata; callers supply trusted linkage.
 * Returns:
 *   The persisted record with a generated UUID and ISO timestamp.
 * Raises:
 *   Error on invalid fields, duplicates, identity collision or storage failure.
 * Notes:
 *   Apply derives linkage from the active demo account, never from form input.
 */
export function createSubmission(input) {
  const values = requireValid(input);
  const records = readSubmissions();
  if (records.some((record) => record.email.toLowerCase() === values.email.toLowerCase() && !sameLinkedUser(record, values))) {
    const error = new Error(DUPLICATE_EMAIL_ERROR);
    error.fieldErrors = { email: DUPLICATE_EMAIL_ERROR };
    throw error;
  }
  const record = { id: crypto.randomUUID(), ...values, submittedAt: new Date().toISOString() };
  if (records.some((existing) => existing.id === record.id)) throw new Error('Unable to generate a unique submission identity. Try again.');
  writeSubmissions([...records, record]);
  return record;
}

/** Locate an exact record identity or throw if it has become stale or is invalid. */
function findIndex(records, id) {
  const index = typeof id === 'string' && id.trim() ? records.findIndex((record) => record.id === id) : -1;
  if (index === -1) throw new Error('Submission not found. It may have already been removed.');
  return index;
}

/**
 * Update contact and supplied material fields while preserving identity and hiring status.
 * Args:
 *   id: Immutable record identity.
 *   input: Name, mobile, department, and optionally notes, portfolio, resume, schedule.
 * Returns:
 *   The persisted record; unknown keys and immutable changes are ignored.
 * Raises:
 *   Error on stale identity, validation or persistence failure.
 */
export function updateSubmission(id, input) {
  const records = readSubmissions();
  const index = findIndex(records, id);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const values = requireValid({
    fullName: source.fullName,
    mobile: source.mobile,
    department: source.department,
    email: records[index].email,
    ...Object.fromEntries(EDITABLE_METADATA.filter((key) => Object.hasOwn(source, key)).map((key) => [key, source[key]])),
  });
  const updated = { ...records[index], ...values };
  records[index] = updated;
  writeSubmissions(records);
  return updated;
}

/** Persist only a canonical hiring status, preserving every other current field. */
export function updateSubmissionStatus(id, status) {
  const records = readSubmissions();
  const index = findIndex(records, id);
  if (typeof status !== 'string' || !SUBMISSION_STATUSES.includes(status)) {
    const error = new Error('Select a valid hiring status.');
    error.fieldErrors = { status: error.message };
    throw error;
  }
  const updated = { ...records[index], status };
  records[index] = updated;
  writeSubmissions(records);
  return updated;
}

/** Remove an existing record, persisting the remaining dataset before returning it. */
export function deleteSubmission(id) {
  const records = readSubmissions();
  const index = findIndex(records, id);
  const [removed] = records.splice(index, 1);
  writeSubmissions(records);
  return removed;
}
