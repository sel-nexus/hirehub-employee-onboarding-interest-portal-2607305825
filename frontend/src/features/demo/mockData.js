/** Supply browser-only demo fixtures and explicit, best-effort storage recovery. */
import { SUBMISSIONS_KEY, validDataset } from '../apply/submissions';
import { AUTH_KEY } from '../admin/auth';

export const USERS_KEY = 'hirehub_users';
export const DEPARTMENTS_KEY = 'hirehub_departments';
export const SESSION_KEY = 'hirehub_session';
export const DEFAULT_DEPARTMENTS = Object.freeze(['Engineering', 'Design', 'Product', 'Marketing', 'Operations']);
export const SAMPLE_RESUMES = Object.freeze({
  'Frontend Software Engineer (5 YOE)': 'Alex Rivera — Frontend Software Engineer (5 YOE)\nFive years building accessible React applications and frontend architecture.\nSkills: React, JavaScript, testing, design systems.\nMock resume text for demonstration only.',
  'Full-Stack Developer Resume (Sample)': 'Full-Stack Developer Resume (Sample)\nExperience delivering browser applications and reliable services.\nSkills: JavaScript, SQL, automated testing, collaborative delivery.\nMock resume text for demonstration only.',
  'UI/UX Case Study': 'UI/UX Case Study\nResearch-led redesign of a candidate application journey.\nMethods: interviews, prototyping, usability testing, accessible interaction design.\nMock portfolio text for demonstration only.',
});

export const DEFAULT_USERS = Object.freeze([
  Object.freeze({ id: 'u-admin', role: 'admin', username: 'admin', password: 'admin', displayName: 'Talent Admin' }),
  Object.freeze({ id: 'u-recruiter', role: 'admin', username: 'recruiter@hirehub.demo', password: 'admin123', displayName: 'Demo Recruiter' }),
  Object.freeze({ id: 'u-201', role: 'candidate', username: 'alex@example.com', password: 'password123', displayName: 'Alex Rivera' }),
  Object.freeze({ id: 'u-202', role: 'candidate', username: 'jordan@example.com', password: 'password123', displayName: 'Jordan Chen' }),
  Object.freeze({ id: 'u-203', role: 'candidate', username: 'taylor@example.com', password: 'password123', displayName: 'Taylor Morgan' }),
]);

export const DEFAULT_SUBMISSIONS = Object.freeze([
  Object.freeze({
    id: 'c-101', userId: 'u-201', fullName: 'Alex Rivera', email: 'alex@example.com', mobile: '4155552671',
    department: 'Engineering', status: 'interview', submittedAt: '2026-10-20T10:15:00.000Z',
    notes: 'Strong background in React and frontend architecture.', portfolioUrl: 'https://alexrivera.dev',
    sampleResume: 'Frontend Software Engineer (5 YOE)', interviewSchedule: 'October 28, 2026 at 10:00 AM Pacific — video interview with the Engineering team.',
  }),
  Object.freeze({
    id: 'c-102', userId: 'u-202', fullName: 'Jordan Chen', email: 'jordan@example.com', mobile: '2125550142',
    department: 'Design', status: 'review', submittedAt: '2026-10-21T09:30:00.000Z',
    notes: 'Thoughtful research and accessible interaction design.', portfolioUrl: 'https://example.com/jordan',
    sampleResume: 'UI/UX Case Study', interviewSchedule: '',
  }),
  Object.freeze({
    id: 'c-103', userId: 'u-203', fullName: 'Taylor Morgan', email: 'taylor@example.com', mobile: '3125550183',
    department: 'Product', status: 'offer', submittedAt: '2026-10-18T14:00:00.000Z',
    notes: 'Clear product strategy and cross-functional leadership.', portfolioUrl: 'https://example.com/taylor',
    sampleResume: 'Full-Stack Developer Resume (Sample)', interviewSchedule: '',
  }),
  Object.freeze({
    id: 'c-104', fullName: 'Priya Shah', email: 'priya@example.com', mobile: '6175550194',
    department: 'Marketing', status: 'applied', submittedAt: '2026-10-25T11:45:00.000Z',
    notes: '', portfolioUrl: 'https://example.com/priya', sampleResume: 'UI/UX Case Study', interviewSchedule: '',
  }),
  Object.freeze({
    id: 'c-105', fullName: 'Sam Okafor', email: 'sam@example.com', mobile: '2065550155',
    department: 'Operations', status: 'archived', submittedAt: '2026-10-15T08:00:00.000Z',
    notes: 'Keep in mind for future operations opportunities.', portfolioUrl: '',
    sampleResume: 'Full-Stack Developer Resume (Sample)', interviewSchedule: '',
  }),
  Object.freeze({
    id: 'c-106', fullName: 'Morgan Lee', email: 'morgan@example.com', mobile: '5125550166',
    department: 'Engineering', status: 'applied', submittedAt: '2026-10-24T16:20:00.000Z',
    notes: '', portfolioUrl: 'https://example.com/morgan', sampleResume: 'Full-Stack Developer Resume (Sample)', interviewSchedule: '',
  }),
  Object.freeze({
    id: 'c-107', fullName: 'Casey Brooks', email: 'casey@example.com', mobile: '3035550177',
    department: 'Design', status: 'interview', submittedAt: '2026-10-19T13:10:00.000Z',
    notes: 'Strong prototyping and visual communication.', portfolioUrl: 'https://example.com/casey',
    sampleResume: 'UI/UX Case Study', interviewSchedule: 'October 29, 2026 at 2:00 PM Mountain — design portfolio review.',
  }),
  Object.freeze({
    id: 'c-108', fullName: 'Riley Patel', email: 'riley@example.com', mobile: '4045550188',
    department: 'Operations', status: 'review', submittedAt: '2026-10-22T15:05:00.000Z',
    notes: 'Experience improving team coordination and onboarding.', portfolioUrl: '',
    sampleResume: 'Full-Stack Developer Resume (Sample)', interviewSchedule: '',
  }),
]);

/**
 * Reject malformed or duplicate locally stored account identities.
 * Args:
 *   users: Untrusted parsed account records.
 * Returns:
 *   Whether every record contains the required demo account fields.
 * @param {*} users
 * @returns {boolean}
 */
export function validUsers(users) {
  if (!Array.isArray(users)) return false;
  const ids = new Set();
  const usernames = new Set();
  return users.every((user) => {
    if (!user || typeof user !== 'object' || Array.isArray(user)) return false;
    if (!['id', 'role', 'username', 'password', 'displayName'].every((key) => typeof user[key] === 'string' && user[key].trim())) return false;
    if (!['admin', 'candidate'].includes(user.role) || user.id !== user.id.trim() || user.username !== user.username.trim()) return false;
    const username = user.username.toLowerCase();
    if (ids.has(user.id) || usernames.has(username)) return false;
    ids.add(user.id);
    usernames.add(username);
    return true;
  });
}

/**
 * Check a nonduplicate configuration while allowing valid custom department names.
 * Args:
 *   departments: Untrusted parsed department labels.
 * Returns:
 *   Whether all labels are nonempty, trimmed strings with unique names.
 * @param {*} departments
 * @returns {boolean}
 */
export function validDepartments(departments) {
  return Array.isArray(departments)
    && departments.every((name) => typeof name === 'string' && name.trim() && name === name.trim())
    && new Set(departments.map((name) => name.toLowerCase())).size === departments.length;
}

const STORES = [
  { key: SUBMISSIONS_KEY, defaults: DEFAULT_SUBMISSIONS, validate: validDataset },
  { key: USERS_KEY, defaults: DEFAULT_USERS, validate: validUsers },
  { key: DEPARTMENTS_KEY, defaults: DEFAULT_DEPARTMENTS, validate: validDepartments },
];

/**
 * Seed only empty or invalid stores, never overwriting an unreadable store.
 * Returns:
 *   Success, newly seeded keys, and actionable errors for failed reads or writes.
 * Notes:
 *   Call from an effect, not during render. Independent stores are best-effort;
 *   repeat calls preserve nonempty valid legacy data byte-for-byte.
 * @returns {{success: boolean, seededKeys: string[], error: string}}
 */
export function seedDemoData() {
  const seededKeys = [];
  const errors = [];
  for (const { key, defaults, validate } of STORES) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      errors.push(`Unable to read ${key}. Check browser storage permissions and try Reset Mock Data again.`);
      continue;
    }
    let records;
    try {
      records = JSON.parse(raw);
    } catch {
      records = null;
    }
    if (validate(records) && records.length > 0) continue;
    try {
      localStorage.setItem(key, JSON.stringify(defaults));
      seededKeys.push(key);
    } catch {
      errors.push(`Unable to save ${key}. Check browser storage permissions or available space and try Reset Mock Data again.`);
    }
  }
  return { success: errors.length === 0, seededKeys, error: errors.join(' ') };
}

/**
 * Restore curated records and remove current and legacy authentication, not theme.
 * Returns:
 *   Success or an actionable error; never claims success after a failed operation.
 * Notes:
 *   Writes across browser keys are not transactional. Failure can leave a partial
 *   reset; retry the action once storage becomes available. Unrelated keys survive.
 * @returns {{success: boolean, error: string}}
 */
export function resetToDefaults() {
  try {
    for (const { key, defaults } of STORES) {
      localStorage.setItem(key, JSON.stringify(defaults));
    }
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    return { success: true, error: '' };
  } catch {
    return {
      success: false,
      error: 'Unable to reset mock data. Changes may be partial. Check browser storage permissions or available space and try Reset Mock Data again.',
    };
  }
}
