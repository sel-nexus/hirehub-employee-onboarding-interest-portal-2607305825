/**
 * Manage the complete browser-local pipeline behind fresh administrator checks.
 * Notes:
 *   Every service returns {success,data,error,warning,fields?}. No account writes.
 *   Basic legacy edits retain six fields; lifecycle/notes edits promote records
 *   with explanatory missing materials and a candidate-email or stable anonymous ID.
 *   Interview transitions reuse existing details or the approved deterministic
 *   sample schedule below. This is inferred demo data, not a scheduling workflow.
 */
import { requireRole, validateContact } from '../access/accounts';
import { readDemoSubmissions, saveDemoSubmissions, readUsers } from '../demo/storage';
import { DEMO_DEPARTMENTS, STATUSES } from '../demo/seed';

export const DEPARTMENTS = DEMO_DEPARTMENTS;
export const STATUS_LABELS = Object.freeze({ applied: 'Applied', review: 'Under Review',
  interview: 'Interview Scheduled', offer: 'Offer Extended', archived: 'Archived' });
export const MOCK_INTERVIEW = Object.freeze({ date: '2026-04-15', time: '14:00',
  timezone: 'America/New_York', location: 'Mock schedule: Demo video meeting — no live call' });

/** Return an actionable failure without suggesting a write succeeded. */
function failure(error, warning = '', fields = {}) {
  return { success: false, data: null, error, warning, fields };
}

/** Read the full dataset only after checking fresh administrator identity. */
function context() {
  const admin = requireRole('admin');
  if (!admin.success) return admin;
  const records = readDemoSubmissions();
  return { ...records, warning: [admin.warning, records.warning].filter(Boolean).join(' ') };
}

/**
 * Search names/emails and combine with a supported department, without writes.
 * @param {{search?: string, department?: string}} options Untrusted filter values.
 * @returns {object} Result envelope containing matching records (legacy unchanged).
 */
export function readRecruiterRecords(options = {}) {
  const state = context();
  if (!state.success) return state;
  const { search = '', department = 'All' } = options || {};
  if (typeof search !== 'string' || !['All', ...DEPARTMENTS].includes(department)) {
    return failure('Choose a valid search and department.', state.warning);
  }
  const query = search.trim().toLowerCase();
  return { ...state, data: state.data.filter((record) => (department === 'All' || record.department === department)
    && [record.fullName, record.email].some((value) => value.toLowerCase().includes(query))) };
}

/** Promote only when extended fields are needed; never invent applicant experience. */
function promote(record) {
  if (record.userId) return { success: true, data: record, error: '', warning: '' };
  const users = readUsers();
  if (!users.success) return users;
  const candidate = users.data.find((user) => user.role === 'candidate'
    && user.email.toLowerCase() === record.email.toLowerCase());
  return { success: true, error: '', warning: users.warning, data: { ...record,
    userId: candidate?.id || `anonymous-${record.id}`, status: 'applied', notes: '', portfolioUrl: '',
    sampleResume: 'Legacy interest record — no resume supplied',
    resumeText: 'No resume was supplied with this public interest record.',
    coverLetterText: 'No cover letter was supplied with this public interest record.', interview: null } };
}

/** Requery by ID, transform one record, validate and save the entire dataset. */
function mutate(id, transform) {
  const state = context();
  if (!state.success) return state;
  if (typeof id !== 'string' || !id.trim()) return failure('A record ID is required.', state.warning);
  const record = state.data.find((item) => item.id === id);
  if (!record) return failure('This record no longer exists. Refresh the pipeline.', state.warning);
  const changed = transform(record, state.data);
  if (!changed.success) return { ...changed, warning: state.warning || changed.warning };
  const records = changed.data === null ? state.data.filter((item) => item.id !== id)
    : state.data.map((item) => item.id === id ? changed.data : item);
  const saved = saveDemoSubmissions(records);
  return { ...saved, data: saved.success ? changed.data : null,
    warning: [state.warning, changed.warning, saved.warning].filter(Boolean).join(' ') };
}

/** Update only name/mobile/department; preserve email, identity, dates and materials. */
export function editRecord(id, details = {}) {
  return mutate(id, (record, records) => {
    const fields = validateContact({ ...details, email: record.email });
    if (!DEPARTMENTS.includes(details?.department)) fields.department = 'Choose a valid department.';
    if (Object.keys(fields).length) return failure('Check the highlighted fields.', '', fields);
    if (record.userId && records.some((item) => item.id !== id && item.userId === record.userId
      && item.department === details.department)) {
      return failure('This candidate already has a record in that department.', '', { department: 'Choose another department.' });
    }
    return { success: true, data: { ...record, fullName: details.fullName.trim(),
      mobile: details.mobile.trim(), department: details.department }, error: '', warning: '' };
  });
}

/** Persist supported lifecycle changes, retaining schedules even after terminal outcomes. */
export function updateStatus(id, status) {
  return mutate(id, (record) => {
    if (!STATUSES.includes(status)) return failure('Choose a valid status.');
    if (!record.userId && status === 'applied') return { success: true, data: record, error: '', warning: '' };
    const extended = promote(record);
    if (!extended.success) return extended;
    return { ...extended, data: { ...extended.data, status,
      interview: status === 'interview' ? extended.data.interview || { ...MOCK_INTERVIEW } : extended.data.interview },
    warning: status === 'interview' && !record.interview
      ? 'A deterministic mock schedule was added for this demo; no real interview was booked.' : extended.warning };
  });
}

/** Save internal notes, promoting legacy materials explicitly when needed. */
export function saveNotes(id, notes) {
  return mutate(id, (record) => {
    if (typeof notes !== 'string' || notes.length > 10000) {
      return failure('Use notes up to 10,000 characters.', '', { notes: 'Use notes up to 10,000 characters.' });
    }
    const extended = promote(record);
    return extended.success ? { ...extended, data: { ...extended.data, notes } } : extended;
  });
}

/** Delete only a fresh matching record; confirmation belongs to the accessible UI. */
export function deleteRecord(id) {
  return mutate(id, () => ({ success: true, data: null, error: '', warning: '' }));
}
