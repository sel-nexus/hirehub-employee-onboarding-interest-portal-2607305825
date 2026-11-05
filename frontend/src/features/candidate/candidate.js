/**
 * Manage fresh, role-owned browser-local candidate data without remote requests.
 * Notes:
 *   Public services return {success, data, error, warning, fields?}. Ownership
 *   comes only from requireRole, never caller-supplied userId. Portal reads omit
 *   internal notes and credentials. Contact writes preserve username and metadata.
 *   Portfolio-only records explain that no mock resume was selected, preserving
 *   the storage contract without inventing resume experience.
 */
import { requireRole, readSession, validateContact, SESSION_EVENT } from '../access/accounts';
import { readUsers, saveUsers, readDemoSubmissions, saveDemoSubmissions, saveSession } from '../demo/storage';
import { DEMO_DEPARTMENTS, safePortfolio } from '../demo/seed';

export const CANDIDATE_EVENT = 'hirehub:candidate-change';
export const RESUME_PRESETS = Object.freeze(['Full-Stack Developer Resume (Sample)', 'UI/UX Case Study']);

/** Return actionable failures without implying persistence. */
function failure(error, warning = '', fields = {}) {
  return { success: false, data: null, error, warning, fields };
}

/** Notify consumers only after the synchronous transaction has settled. */
function notify() {
  window.dispatchEvent(new CustomEvent(CANDIDATE_EVENT));
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

/** Read the signed-in candidate and complete dataset before filtering or writing. */
function context() {
  const user = requireRole('candidate');
  if (!user.success) return user;
  const records = readDemoSubmissions();
  if (!records.success) return records;
  return { success: true, data: { user: user.data, records: records.data }, error: '',
    warning: [user.warning, records.warning].filter(Boolean).join(' ') };
}

/**
 * Read only the current candidate's contacts, materials and lifecycle information.
 * Returns:
 *   {contact: {fullName,email,mobile}, applications: records without notes}.
 */
export function readCandidatePortal() {
  const state = context();
  if (!state.success) return state;
  const { user, records } = state.data;
  const { fullName, email, mobile } = user;
  const applications = records.filter((record) => record.userId === user.id).map((record) => {
    const { notes, ...visible } = record;
    return visible;
  });
  return { success: true, data: { contact: { fullName, email, mobile }, applications }, error: '', warning: state.warning };
}

/**
 * Update current account contacts and its submissions, then the session identity.
 * Args:
 *   details: Untrusted fullName, email and mobile; extra identity fields are ignored.
 * Returns:
 *   Fresh portal data after all writes succeed, or explicit rollback failure.
 * Notes:
 *   Browser storage is not transactional. Failed subsequent writes restore every
 *   touched key best-effort and report incomplete rollback rather than success.
 */
export function updateContact(details = {}) {
  const state = context();
  if (!state.success) return state;
  const fields = validateContact(details);
  if (Object.keys(fields).length) return failure('Check the highlighted fields.', state.warning, fields);
  const users = readUsers();
  if (!users.success) return users;
  const session = readSession();
  if (!session.success || !session.data) return failure(session.error || 'Please log in to continue.');
  const { user, records } = state.data;
  const contact = { fullName: details.fullName.trim(), email: details.email.trim().toLowerCase(), mobile: details.mobile.trim() };
  if (users.data.some((item) => item.id !== user.id
    && (item.email.toLowerCase() === contact.email || item.username.toLowerCase() === contact.email))) {
    return failure('This email is already registered.', state.warning, { email: 'This email is already registered.' });
  }
  const changedUsers = users.data.map((item) => item.id === user.id ? { ...item, ...contact, displayName: contact.fullName } : item);
  const changedRecords = records.map((record) => record.userId === user.id ? { ...record, ...contact } : record);
  const savedUsers = saveUsers(changedUsers);
  if (!savedUsers.success) return savedUsers;
  const savedRecords = saveDemoSubmissions(changedRecords);
  const savedSession = savedRecords.success
    ? saveSession({ ...session.data, displayName: contact.fullName }) : savedRecords;
  if (!savedSession.success) {
    const restoredUsers = saveUsers(users.data);
    const restoredRecords = savedRecords.success ? saveDemoSubmissions(records) : { success: true };
    const restoredSession = saveSession(session.data);
    notify();
    const rolledBack = restoredUsers.success && restoredRecords.success && restoredSession.success;
    return failure(`${savedSession.error} ${rolledBack ? 'Contact changes were rolled back; please retry.'
      : 'Rollback failed; some contact changes may remain. Enable storage and log in again or Reset demo.'}`, state.warning);
  }
  notify();
  return readCandidatePortal();
}

/**
 * Create one application per department for the authenticated candidate.
 * Args:
 *   details: department, optional credential-free HTTP(S) portfolioUrl and/or
 *     sampleResume matching RESUME_PRESETS. Caller identity/status is ignored.
 * Returns:
 *   Fresh portal data or validation/persistence failure; no automatic fetching.
 */
export function createApplication(details = {}) {
  const state = context();
  if (!state.success) return state;
  const fields = {};
  const department = details?.department;
  const portfolioUrl = typeof details?.portfolioUrl === 'string' ? details.portfolioUrl.trim() : '';
  const sampleResume = details?.sampleResume || '';
  if (!DEMO_DEPARTMENTS.includes(department)) fields.department = 'Choose a valid department.';
  if ((details?.portfolioUrl != null && typeof details.portfolioUrl !== 'string') || !safePortfolio(portfolioUrl)) {
    fields.portfolioUrl = 'Use a complete HTTP(S) URL without username or password.';
  }
  if (sampleResume && !RESUME_PRESETS.includes(sampleResume)) fields.sampleResume = 'Choose a supplied mock resume.';
  if (!portfolioUrl && !sampleResume) fields.sampleResume = 'Add a portfolio URL or choose a mock resume.';
  if (Object.keys(fields).length) return failure('Check the highlighted fields.', state.warning, fields);
  const { user, records } = state.data;
  if (records.some((record) => record.userId === user.id && record.department === department)) {
    return failure('You already have an application for this department.', state.warning, { department: 'Choose another department.' });
  }
  const record = { id: `submission-${crypto.randomUUID()}`, fullName: user.fullName, email: user.email, mobile: user.mobile,
    department, submittedAt: new Date().toISOString(), userId: user.id, status: 'applied', notes: '', portfolioUrl,
    sampleResume: sampleResume || 'Portfolio supplied; no mock resume selected',
    resumeText: sampleResume ? `${user.fullName} — ${sampleResume}\nMock experience for the ${department} team.`
      : 'No mock resume selected. Review the supplied portfolio link.',
    coverLetterText: `Mock cover letter: I would love to contribute to the HireHub ${department} team.`, interview: null };
  const saved = saveDemoSubmissions([...records, record]);
  if (!saved.success) return saved;
  notify();
  return readCandidatePortal();
}
