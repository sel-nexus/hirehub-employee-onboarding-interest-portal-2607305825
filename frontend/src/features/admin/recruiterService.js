/** Filter and maintain browser-local recruiter records without cached or optimistic writes. */
import { isAuthenticated } from './auth';
import { readSubmissions, SUBMISSIONS_KEY, validateMaterials } from '../apply/submissions';
import { validateSubmission } from '../apply/validation';
import { validSubmissions, DEFAULT_DEPARTMENTS } from '../data/mockData';

export const RECRUITER_DEPARTMENTS = DEFAULT_DEPARTMENTS;
export const STATUS_LABELS = Object.freeze({
  received: 'Received', applied: 'Applied', review: 'Under Review',
  interview: 'Interview Scheduled', offer: 'Offer Extended', archived: 'Archived / Not Selected',
});
export const NOTES_MAX_LENGTH = 4000;
export const EDITABLE_FIELDS = Object.freeze([
  'fullName', 'mobile', 'department', 'status', 'notes', 'portfolioUrl', 'sampleResume',
]);

/** Require a freshly validated local admin session.
 * Raises: Error when the current account is absent, changed, or not an admin.
 * @returns {void} */
export function requireRecruiter() {
  if (!isAuthenticated('admin')) throw new Error('Administrator access is required. Sign in again before making changes.');
}

/** Supply PRD defaults for legacy records without modifying storage.
 * @param {object} record A validated legacy or extended record.
 * @returns {object} A new record preserving all existing fields. */
export function withRecruiterDefaults(record) {
  return { userId: '', status: 'received', notes: '', portfolioUrl: '', sampleResume: '', ...record };
}

/** Read the latest validated dataset, retaining shared corruption recovery and errors.
 * @returns {object[]} Fresh legacy or extended records.
 * Raises: Error when reading or necessary recovery writes fail. */
export function readRecruiterSubmissions() {
  return readSubmissions();
}

/** Combine live name/email search with exact department and pipeline filters.
 * @param {object[]} records Validated current records.
 * @param {object} filters Optional search, department, and status strings.
 * @returns {object[]} Matching records in their original order; never mutates input. */
export function filterSubmissions(records, { search = '', department = '', status = '' } = {}) {
  const query = typeof search === 'string' ? search.trim().toLowerCase() : '';
  return records.filter((record) => (
    (!query || record.fullName.toLowerCase().includes(query) || record.email.toLowerCase().includes(query))
    && (!department || record.department === department)
    && (!status || (record.status || 'received') === status)
  ));
}

/** Validate complete editor values without coercing notes, statuses, or material types.
 * @param {*} input Contact fields, pipeline stage, internal notes, and application materials.
 * @returns {{values: object, errors: object}} Normalized contact/material values and associated errors. */
export function validateRecruiterFields(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const contact = validateSubmission(source);
  const materials = validateMaterials(source);
  const errors = { ...contact.errors, ...materials.errors };
  for (const field of ['portfolioUrl', 'sampleResume']) {
    if (Object.hasOwn(source, field) && typeof source[field] !== 'string') {
      errors[field] = 'Enter a valid application material.';
    }
  }
  if (typeof source.status !== 'string' || !Object.hasOwn(STATUS_LABELS, source.status)) {
    errors.status = 'Select a valid pipeline stage.';
  }
  if (typeof source.notes !== 'string' || source.notes.length > NOTES_MAX_LENGTH) {
    errors.notes = `Enter internal notes of at most ${NOTES_MAX_LENGTH} characters.`;
  }
  return { values: { ...contact.values, ...materials.values, status: source.status, notes: source.notes }, errors };
}

/** Persist a permitted patch against the latest record, preserving identity and untouched metadata.
 * Args:
 *   id: Exact immutable submission identity.
 *   patch: Only fields intentionally changed by the recruiter; empty patches are allowed.
 * Returns: The persisted extended record after a fresh verification read.
 * Raises: Error for wrong roles, missing IDs, forbidden fields, invalid values, or storage failures.
 * Notes: Legacy records receive all five PRD defaults together; no in-memory repository is used.
 * @param {*} id
 * @param {*} patch
 * @returns {object} */
export function updateRecruiterSubmission(id, patch) {
  requireRecruiter();
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(patch))) {
    throw new Error('Provide an editable submission patch.');
  }
  if (Object.keys(patch).some((key) => !EDITABLE_FIELDS.includes(key))) {
    throw new Error('Only recruiter-editable fields may be changed. Identity, email, ownership and timestamp are immutable.');
  }
  const records = readRecruiterSubmissions();
  const index = typeof id === 'string' && id.trim() ? records.findIndex((record) => record.id === id) : -1;
  if (index === -1) throw new Error('Submission not found. It may have already been removed.');
  const current = withRecruiterDefaults(records[index]);
  const result = validateRecruiterFields({ ...current, ...patch });
  if (Object.keys(result.errors).length) {
    const error = new Error('Please correct the submission fields.');
    error.fieldErrors = result.errors;
    throw error;
  }
  records[index] = {
    ...current,
    ...Object.fromEntries(Object.keys(patch).map((key) => [key, result.values[key]])),
  };
  if (!validSubmissions(records)) throw new Error('Unable to save an invalid submission dataset.');
  requireRecruiter();
  try {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
  } catch (cause) {
    throw new Error('Unable to save submissions. Check browser storage permissions or available space and try again.', { cause });
  }
  const saved = readRecruiterSubmissions().find((record) => record.id === id);
  if (!saved || Object.keys(patch).some((key) => saved[key] !== records[index][key])) {
    throw new Error('Unable to verify saved submission. Refresh the dashboard before retrying.');
  }
  return saved;
}
