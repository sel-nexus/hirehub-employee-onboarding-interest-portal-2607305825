/** Define browser-only demo fixtures and the strict extended submission contract. */
export const DEMO_DEPARTMENTS = Object.freeze(['Engineering', 'Design', 'Product', 'Marketing', 'Operations']);
export const STATUSES = Object.freeze(['applied', 'review', 'interview', 'offer', 'archived']);
const SUBMISSION_FIELDS = [
  'id', 'fullName', 'email', 'mobile', 'department', 'submittedAt', 'userId', 'status',
  'notes', 'sampleResume', 'resumeText', 'coverLetterText', 'portfolioUrl', 'interview',
];

/** Check exact own fields, excluding arrays and unknown metadata. */
export function hasFields(value, fields) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field)));
}

/** Check canonical nonempty text without coercing external values. */
export function canonicalText(value, max = 200) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim();
}

/** Check an exact ISO timestamp, rejecting impossible calendar dates. */
export function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

/** Accept only user-initiated HTTP(S) portfolio navigation or an empty link. */
export function safePortfolio(value) {
  if (value === '') return true;
  if (!canonicalText(value, 2000)) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Validate explicit interview details; null means no scheduled interview. */
function validInterview(value) {
  if (!hasFields(value, ['date', 'time', 'timezone', 'location'])) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !validTimestamp(`${value.date}T00:00:00.000Z`)) return false;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time) || !canonicalText(value.location, 500)) return false;
  if (!canonicalText(value.timezone)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate every extended field without depending on the storage service.
 * Args:
 *   record: Untrusted extended submission; extra or missing fields are rejected.
 * Returns:
 *   True only for canonical contacts, materials, lifecycle and schedule details.
 */
export function validDemoSubmission(record) {
  if (!hasFields(record, SUBMISSION_FIELDS)) return false;
  return canonicalText(record.id) && canonicalText(record.userId)
    && canonicalText(record.fullName, 100) && /^[A-Za-z ]+$/.test(record.fullName)
    && canonicalText(record.email, 254) && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(record.email)
    && typeof record.mobile === 'string' && /^\d{10}$/.test(record.mobile)
    && DEMO_DEPARTMENTS.includes(record.department) && STATUSES.includes(record.status)
    && validTimestamp(record.submittedAt)
    && typeof record.notes === 'string' && record.notes.length <= 10000
    && canonicalText(record.sampleResume, 200) && canonicalText(record.resumeText, 20000)
    && canonicalText(record.coverLetterText, 20000)
    && safePortfolio(record.portfolioUrl)
    && (record.interview === null ? record.status !== 'interview' : validInterview(record.interview));
}

/** Create a complete demonstration account with a stable identity. */
function account(id, fullName, email, mobile, role, password, username = email) {
  return { id, displayName: fullName, fullName, email, mobile, role, password, username };
}

export const DEFAULT_USERS = [
  account('user-alex', 'Alex Morgan', 'alex@example.com', '2025550101', 'candidate', 'password123'),
  account('user-jordan', 'Jordan Lee', 'jordan@example.com', '2025550102', 'candidate', 'password123'),
  account('user-taylor', 'Taylor Brooks', 'taylor@example.com', '2025550103', 'candidate', 'password123'),
  account('user-admin', 'Demo Administrator', 'admin@hirehub.demo', '2025550104', 'admin', 'admin', 'admin'),
  account('user-recruiter', 'Demo Recruiter', 'recruiter@hirehub.demo', '2025550105', 'admin', 'admin123'),
];

/** Build a curated application joined to its candidate account. */
function submission(index, userIndex, department, status) {
  const user = DEFAULT_USERS[userIndex];
  const sampleResume = department === 'Design' ? 'UI/UX Case Study' : 'Full-Stack Developer Resume (Sample)';
  return {
    id: `submission-${index}`, userId: user.id, fullName: user.fullName, email: user.email, mobile: user.mobile,
    department, status, submittedAt: `2026-03-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    notes: status === 'interview' ? 'Strong profile. Discuss collaboration and recent project work.' : '',
    sampleResume,
    resumeText: `${user.fullName} — ${sampleResume}\nMock experience delivering thoughtful ${department.toLowerCase()} projects.`,
    coverLetterText: `Mock cover letter: I would love to contribute to the HireHub ${department} team.`,
    portfolioUrl: `https://example.com/portfolio/${user.id}`,
    interview: status === 'interview' ? {
      date: '2026-04-15', time: '14:00', timezone: 'America/New_York', location: 'Demo video meeting — no live call',
    } : null,
  };
}

export const DEFAULT_SUBMISSIONS = [
  submission(1, 0, 'Engineering', 'interview'),
  submission(2, 0, 'Product', 'review'),
  submission(3, 0, 'Operations', 'applied'),
  submission(4, 1, 'Design', 'offer'),
  submission(5, 1, 'Marketing', 'review'),
  submission(6, 1, 'Product', 'archived'),
  submission(7, 2, 'Marketing', 'applied'),
  submission(8, 2, 'Operations', 'interview'),
];
