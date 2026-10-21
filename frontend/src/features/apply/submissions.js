/** Persist validated candidate records exclusively in the browser's localStorage. */
import { validateSubmission } from './validation';

export const SUBMISSIONS_KEY = 'hirehub_submissions';
export const DUPLICATE_EMAIL_ERROR = 'This email has already been submitted.';
const RECORD_KEYS = ['id', 'fullName', 'email', 'mobile', 'department', 'submittedAt'];

/**
 * Write a complete dataset or surface the browser storage failure.
 * Args:
 *   records: Validated records to persist.
 * Raises:
 *   Error: Storage is unavailable or cannot accept the write.
 * @param {object[]} records
 */
function writeSubmissions(records) {
  try {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
  } catch (cause) {
    throw new Error('Unable to save submissions. Check browser storage permissions or available space and try again.', { cause });
  }
}

/**
 * Reject malformed records, noncanonical fields, and duplicate identities.
 * Args:
 *   records: Parsed, untrusted storage contents.
 * Returns:
 *   Whether the entire dataset satisfies the schema and uniqueness rules.
 * @param {*} records
 * @returns {boolean}
 */
function validDataset(records) {
  if (!Array.isArray(records)) return false;
  const ids = new Set();
  const emails = new Set();
  return records.every((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    if (Object.keys(record).length !== RECORD_KEYS.length || !RECORD_KEYS.every((key) => typeof record[key] === 'string')) {
      return false;
    }
    const { values, errors } = validateSubmission(record);
    if (Object.keys(errors).length || Object.keys(values).some((key) => values[key] !== record[key])) return false;
    if (!record.id.trim() || record.id !== record.id.trim()) return false;
    const date = new Date(record.submittedAt);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== record.submittedAt) return false;
    const email = record.email.toLowerCase();
    if (ids.has(record.id) || emails.has(email)) return false;
    ids.add(record.id);
    emails.add(email);
    return true;
  });
}

/**
 * Requery storage and reset corrupt JSON or invalid datasets to a persisted empty array.
 * Returns:
 *   A fresh array of valid records, or an empty array when absent or reset.
 * Raises:
 *   Error: Reading storage or persisting a required reset fails.
 * @returns {object[]}
 */
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

/**
 * Require valid candidate details before a mutation can be saved.
 * Args:
 *   input: Untrusted details to validate.
 * Returns:
 *   The normalized valid fields.
 * Raises:
 *   Error: One or more fields are invalid; fieldErrors identifies each field.
 * @param {*} input
 * @returns {object}
 */
function requireValid(input) {
  const { values, errors } = validateSubmission(input);
  if (Object.keys(errors).length) {
    const error = new Error('Please correct the application fields.');
    error.fieldErrors = errors;
    throw error;
  }
  return values;
}

/**
 * Append a unique submission and persist it before reporting success.
 * Args:
 *   input: Candidate contact details and selected department.
 * Returns:
 *   The persisted record with a UUID and ISO timestamp.
 * Raises:
 *   Error: Validation, duplicate email, identity generation, or storage fails.
 * @param {*} input
 * @returns {object}
 */
export function createSubmission(input) {
  const values = requireValid(input);
  const records = readSubmissions();
  if (records.some((record) => record.email.toLowerCase() === values.email.toLowerCase())) {
    const error = new Error(DUPLICATE_EMAIL_ERROR);
    error.fieldErrors = { email: DUPLICATE_EMAIL_ERROR };
    throw error;
  }
  const record = { id: crypto.randomUUID(), ...values, submittedAt: new Date().toISOString() };
  writeSubmissions([...records, record]);
  return record;
}

/**
 * Locate a record by its exact string identity.
 * Args:
 *   records: The freshly read dataset.
 *   id: The immutable record identity.
 * Returns:
 *   Its array index.
 * Raises:
 *   Error: The identity is invalid or no longer exists.
 * @param {object[]} records
 * @param {*} id
 * @returns {number}
 */
function findIndex(records, id) {
  const index = typeof id === 'string' && id.trim() ? records.findIndex((record) => record.id === id) : -1;
  if (index === -1) throw new Error('Submission not found. It may have already been removed.');
  return index;
}

/**
 * Replace only name, mobile, and department, preserving immutable metadata.
 * Args:
 *   id: Identity of the record to update.
 *   input: All three editable fields; other properties are ignored.
 * Returns:
 *   The persisted updated record.
 * Raises:
 *   Error: The record is missing, details are invalid, or storage fails.
 * @param {*} id
 * @param {*} input
 * @returns {object}
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
  });
  const updated = { ...records[index], ...values };
  records[index] = updated;
  writeSubmissions(records);
  return updated;
}

/**
 * Remove an existing record and persist the remaining dataset.
 * Args:
 *   id: Identity of the record to remove.
 * Returns:
 *   The removed record.
 * Raises:
 *   Error: The record is missing or storage fails.
 * @param {*} id
 * @returns {object}
 */
export function deleteSubmission(id) {
  const records = readSubmissions();
  const index = findIndex(records, id);
  const [removed] = records.splice(index, 1);
  writeSubmissions(records);
  return removed;
}
