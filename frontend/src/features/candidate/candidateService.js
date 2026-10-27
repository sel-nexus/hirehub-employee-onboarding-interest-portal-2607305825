/** Ownership-safe browser-local candidate reads and contact updates. */
import { getSession } from '../admin/auth';
import { SUBMISSIONS_KEY, USERS_KEY, SESSION_KEY, validSubmissions, validUsers, persistChanges } from '../data/mockData';
import { validateSubmission } from '../apply/validation';

export const MILESTONES = Object.freeze(['Application Received', 'Profile Screening', 'Interview Scheduled', 'Final Decision']);
const STAGES = {
  received: [0, 'Application Received', 'We have your application. Our recruiting team will review your profile next.'],
  applied: [0, 'Application Received', 'We have your application. Our recruiting team will review your profile next.'],
  review: [1, 'Under Review', 'Our team is screening your profile. We will share the next step here.'],
  interview: [2, 'Interview Scheduled', 'Prepare for your interview. Check your mock schedule below for details.'],
  offer: [3, 'Offer Extended', 'Congratulations! Your local demo application has reached an offer decision.'],
  archived: [3, 'Not Selected', 'This application is closed. Thank you for your interest; you can explore future roles.'],
};

/** Map a persisted status to a friendly four-milestone description. @param {string} status @returns {object} */
export function stageFor(status = 'received') {
  const [index, label, next] = typeof status === 'string' && Object.hasOwn(STAGES, status) ? STAGES[status] : STAGES.received;
  return { index, label, next };
}

/** Require a freshly validated candidate, never a caller-supplied identity. @returns {object} @throws {Error} Wrong role. */
function currentCandidate() {
  const session = getSession();
  if (session?.role !== 'candidate') throw new Error('Sign in as a candidate to access your applications.');
  return session;
}

/** Read without repairing untrusted records; candidate errors must not destroy any user's data. @returns {object[]} */
function readRecords() {
  try {
    const records = JSON.parse(window.localStorage.getItem(SUBMISSIONS_KEY));
    if (!validSubmissions(records)) throw new Error('Invalid records');
    return records;
  } catch (cause) {
    throw new Error('Unable to read your applications. Local submissions are missing, corrupt, or unavailable. Retry after restoring browser storage.', { cause });
  }
}

/** Explicitly project candidate-visible fields; notes and account passwords never cross this boundary. @param {object} record @returns {object} */
function visibleRecord(record) {
  const { id, fullName, email, mobile, department, submittedAt, portfolioUrl = '', sampleResume = '', status = 'received', interviewSchedule } = record;
  return { id, fullName, email, mobile, department, submittedAt, portfolioUrl, sampleResume, status,
    ...(interviewSchedule ? { interviewSchedule: { ...interviewSchedule } } : {}) };
}

/** Return only records with the active candidate's exact userId. Legacy unowned records remain unclaimed. @returns {object[]} */
export function readCandidateApplications() {
  const session = currentCandidate();
  return readRecords().filter((record) => record.userId === session.userId).map(visibleRecord);
}

/** Validate only contact fields using existing public rules. @param {*} input @returns {{values: object, errors: object}} */
export function validateContact(input) {
  const { values, errors } = validateSubmission({ ...(input && typeof input === 'object' && !Array.isArray(input) ? input : {}), department: 'Engineering' });
  const { fullName, email, mobile } = values;
  if (email.length > 254) errors.email = 'Enter a valid email address (maximum 254 characters).';
  return { values: { fullName, email: email.toLowerCase(), mobile }, errors };
}

/** Persist owned contact details plus account/session changes together with best-effort rollback.
 * Re-read latest pipeline metadata and other users; caller-supplied status/notes/identity are ignored.
 * @param {string} id @param {*} input @returns {object} Safe saved application. @throws {Error} Invalid/unauthorized/conflicting/failed writes. */
export function updateCandidateContact(id, input) {
  const session = currentCandidate();
  const records = readRecords();
  const index = records.findIndex((record) => typeof id === 'string' && record.id === id && record.userId === session.userId);
  if (index === -1) throw new Error('Application not found or not owned by your candidate account.');
  const { values, errors } = validateContact(input);
  if (Object.keys(errors).length) {
    const error = new Error('Please correct your contact details.');
    error.fieldErrors = errors;
    throw error;
  }
  let users;
  try {
    users = JSON.parse(window.localStorage.getItem(USERS_KEY));
    if (!validUsers(users) || !users.some((user) => user.id === session.userId && user.role === 'candidate')) {
      throw new Error('Invalid or missing candidate account');
    }
  } catch (cause) {
    throw new Error('Unable to read your local account. Retry after restoring browser storage.', { cause });
  }
  if (users.some((user) => user.id !== session.userId && user.username.toLowerCase() === values.email)
    || records.some((record) => record.id !== id && record.email.toLowerCase() === values.email)) {
    const error = new Error('This email belongs to another account or application.');
    error.fieldErrors = { email: error.message };
    throw error;
  }
  const updated = { ...records[index], ...values };
  records[index] = updated;
  const accounts = users.map((user) => user.id === session.userId
    ? { ...user, username: values.email, displayName: values.fullName } : user);
  const refreshedSession = { ...session, displayName: values.fullName };
  const result = persistChanges(window.localStorage, {
    [SUBMISSIONS_KEY]: JSON.stringify(records), [USERS_KEY]: JSON.stringify(accounts), [SESSION_KEY]: JSON.stringify(refreshedSession),
  });
  if (!result.success) throw new Error(`Unable to save your profile. ${result.error}`);
  return visibleRecord(updated);
}
