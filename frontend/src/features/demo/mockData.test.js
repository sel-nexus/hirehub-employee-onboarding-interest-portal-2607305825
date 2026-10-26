/** Verify curated fixtures and real browser storage seeding/reset outcomes. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_KEY } from '../admin/auth';
import { validateSubmission } from '../apply/validation';
import { readSubmissions, SUBMISSIONS_KEY, SUBMISSION_STATUSES, validDataset } from '../apply/submissions';
import {
  DEFAULT_SUBMISSIONS, DEFAULT_USERS, DEFAULT_DEPARTMENTS, SAMPLE_RESUMES,
  USERS_KEY, DEPARTMENTS_KEY, SESSION_KEY, seedDemoData, resetToDefaults, validUsers, validDepartments,
} from './mockData';

const legacy = { id: 'legacy', fullName: 'Legacy Candidate', email: 'legacy@example.com', mobile: '0123456789', department: 'Engineering', submittedAt: '2026-03-04T12:00:00.000Z' };
const stores = [
  [SUBMISSIONS_KEY, DEFAULT_SUBMISSIONS],
  [USERS_KEY, DEFAULT_USERS],
  [DEPARTMENTS_KEY, DEFAULT_DEPARTMENTS],
];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

/** Assert baseline persistence independently of the application reader. */
function expectDefaults() {
  for (const [key, records] of stores) expect(JSON.parse(localStorage.getItem(key))).toEqual(records);
}

describe('curated demo seeding', () => {
  it.each(DEFAULT_SUBMISSIONS.map((record) => [record.id, record]))('accepts fixture %s through the shared record schema', (_id, record) => {
    // Use a legacy department to prove contact validation remains unchanged;
    // the shared storage schema adds the PRD's Product label separately.
    const { values, errors } = validateSubmission({ ...record, department: 'Engineering' });
    expect(errors).toEqual({});
    expect(values).toEqual({ fullName: record.fullName, email: record.email, mobile: record.mobile, department: 'Engineering' });
    expect(validDataset([record])).toBe(true);
  });
  it('seeds eight schema-valid records across all five departments and stages with bundled materials', () => {
    expect(seedDemoData()).toEqual({ success: true, seededKeys: stores.map(([key]) => key), error: '' });
    expectDefaults();
    const records = readSubmissions();
    expect(records).toHaveLength(8);
    expect(validDataset(records)).toBe(true);
    expect(new Set(records.map((record) => record.department))).toEqual(new Set(DEFAULT_DEPARTMENTS));
    expect(new Set(records.map((record) => record.status))).toEqual(new Set(SUBMISSION_STATUSES));
    for (const record of records) expect(SAMPLE_RESUMES[record.sampleResume]).toContain('Mock');
    expect(records[0]).toMatchObject({
      id: 'c-101', userId: 'u-201', fullName: 'Alex Rivera', email: 'alex@example.com', mobile: '4155552671',
      department: 'Engineering', status: 'interview', submittedAt: '2026-10-20T10:15:00.000Z',
      notes: 'Strong background in React and frontend architecture.', portfolioUrl: 'https://alexrivera.dev',
      sampleResume: 'Frontend Software Engineer (5 YOE)', interviewSchedule: expect.stringContaining('October 28'),
    });
    expect(validUsers(DEFAULT_USERS)).toBe(true);
    expect(validDepartments(DEFAULT_DEPARTMENTS)).toBe(true);
  });

  it.each([
    ['admin', 'admin', 'admin', 'u-admin', 'Talent Admin'],
    ['recruiter@hirehub.demo', 'admin123', 'admin', 'u-recruiter', 'Demo Recruiter'],
    ['alex@example.com', 'password123', 'candidate', 'u-201', 'Alex Rivera'],
    ['jordan@example.com', 'password123', 'candidate', 'u-202', 'Jordan Chen'],
    ['taylor@example.com', 'password123', 'candidate', 'u-203', 'Taylor Morgan'],
  ])('persists required account %s and coherent candidate ownership', (username, password, role, id, displayName) => {
    seedDemoData();
    const account = JSON.parse(localStorage.getItem(USERS_KEY)).find((user) => user.username === username);
    expect(account).toEqual({ id, username, password, role, displayName });
    if (role === 'candidate') {
      expect(readSubmissions().find((record) => record.userId === id)).toMatchObject({ email: username, fullName: displayName });
    }
  });

  it('is idempotent and returns fresh parsed records without mutating frozen fixtures', () => {
    seedDemoData();
    expect(seedDemoData()).toEqual({ success: true, seededKeys: [], error: '' });
    const records = readSubmissions();
    records[0].fullName = 'Changed';
    expect(readSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
    expect(DEFAULT_SUBMISSIONS[0].fullName).toBe('Alex Rivera');
  });

  it.each(['[ ]', '{bad', '', 'null', '{}', '42', '"array"'])('replaces empty or corrupt stores %s', (raw) => {
    for (const [key] of stores) localStorage.setItem(key, raw);
    expect(seedDemoData().success).toBe(true);
    expectDefaults();
  });

  it('replaces invalid nonempty datasets rather than partially trusting them', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([legacy, { ...legacy, id: 'other', status: 'invalid' }]));
    localStorage.setItem(USERS_KEY, JSON.stringify([{ username: 'incomplete' }]));
    localStorage.setItem(DEPARTMENTS_KEY, JSON.stringify(['Engineering', 42]));
    expect(seedDemoData().success).toBe(true);
    expectDefaults();
  });

  it.each([{ records: [legacy] }, { records: [{ ...legacy, status: 'review', notes: 'Existing notes' }] }])('preserves valid nonempty old and extended submissions byte-for-byte $records', ({ records }) => {
    const raw = JSON.stringify(records, null, 2);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(seedDemoData().seededKeys).toEqual([USERS_KEY, DEPARTMENTS_KEY]);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
    expect(readSubmissions()).toEqual(records);
  });

  it('preserves valid custom users and departments independently, including extras on users', () => {
    const users = JSON.stringify([{ ...DEFAULT_USERS[0], username: 'custom', password: 'changed', extra: 'retain' }]);
    const departments = '["Custom Team"]';
    localStorage.setItem(USERS_KEY, users);
    localStorage.setItem(DEPARTMENTS_KEY, departments);
    expect(seedDemoData().seededKeys).toEqual([SUBMISSIONS_KEY]);
    expect(localStorage.getItem(USERS_KEY)).toBe(users);
    expect(localStorage.getItem(DEPARTMENTS_KEY)).toBe(departments);
  });

  it('does not touch sessions, theme or unrelated data during seeding', () => {
    localStorage.setItem(SESSION_KEY, 'session');
    sessionStorage.setItem(AUTH_KEY, 'true');
    localStorage.setItem('hirehub_theme', 'dark');
    localStorage.setItem('other', 'retain');
    seedDemoData();
    expect(localStorage.getItem(SESSION_KEY)).toBe('session');
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
    expect(localStorage.getItem('hirehub_theme')).toBe('dark');
    expect(localStorage.getItem('other')).toBe('retain');
  });

  it.each(stores.map(([key]) => key))('surfaces read failure for %s without overwriting unreadable data', (blockedKey) => {
    localStorage.setItem(blockedKey, 'unreadable-existing');
    const get = Storage.prototype.getItem;
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (this === localStorage && key === blockedKey) throw new Error('denied');
      return get.call(this, key);
    });
    const result = seedDemoData();
    expect(result.success).toBe(false);
    expect(result.error).toContain(`Unable to read ${blockedKey}`);
    expect(result.seededKeys).not.toContain(blockedKey);
    spy.mockRestore();
    expect(localStorage.getItem(blockedKey)).toBe('unreadable-existing');
    for (const [key, defaults] of stores.filter(([key]) => key !== blockedKey)) {
      expect(JSON.parse(localStorage.getItem(key))).toEqual(defaults);
    }
  });

  it.each(stores.map(([key]) => key))('surfaces quota failure for %s, preserves stored value and allows retry', (blockedKey) => {
    localStorage.setItem(blockedKey, '{bad');
    const set = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (this === localStorage && key === blockedKey) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, key, value);
    });
    const result = seedDemoData();
    expect(result.success).toBe(false);
    expect(result.error).toContain(`Unable to save ${blockedKey}`);
    expect(result.error).toContain('available space');
    expect(localStorage.getItem(blockedKey)).toBe('{bad');
    spy.mockRestore();
    expect(seedDemoData().success).toBe(true);
    expectDefaults();
  });

  it('reports unavailable storage accessors without throwing', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    const result = seedDemoData();
    expect(result.success).toBe(false);
    expect(result.seededKeys).toEqual([]);
    for (const [key] of stores) expect(result.error).toContain(`Unable to read ${key}`);
  });
});

describe('account and department validation', () => {
  it.each(['0123456789', '+1 (415) 555-2671', '123456789012345'])('preserves optional validated account mobile %s without reseeding', (mobile) => {
    const users = [{ ...DEFAULT_USERS[2], mobile }];
    const raw = JSON.stringify(users, null, 2);
    expect(validUsers(users)).toBe(true);
    expect(validUsers(DEFAULT_USERS)).toBe(true);
    localStorage.setItem(USERS_KEY, raw);
    seedDemoData();
    expect(localStorage.getItem(USERS_KEY)).toBe(raw);
  });
  it.each([null, undefined, 123, {}, [], '', '123456789', '1234567890123456', '123abc4567890', '++1234567890'])('rejects explicitly invalid optional account mobile %j', (mobile) => {
    expect(validUsers([{ ...DEFAULT_USERS[2], mobile }])).toBe(false);
  });
  it.each([null, {}, 42, [null], [[]], [{}], [{ ...DEFAULT_USERS[0], role: 'owner' }],
    ...['id', 'role', 'username', 'password', 'displayName'].flatMap((key) => [
      [{ ...DEFAULT_USERS[0], [key]: 42 }], [{ ...DEFAULT_USERS[0], [key]: '' }],
    ]), [{ ...DEFAULT_USERS[0], id: ' padded ' }], [{ ...DEFAULT_USERS[0], username: ' padded ' }],
    [DEFAULT_USERS[0], { ...DEFAULT_USERS[0], username: 'other' }],
    [DEFAULT_USERS[0], { ...DEFAULT_USERS[0], id: 'other', username: 'ADMIN' }],
  ].map((users) => [users]))('rejects malformed or duplicate accounts %j', (users) => {
    expect(validUsers(users)).toBe(false);
  });
  it.each([null, {}, 42, [42], [''], [' padded '], ['Engineering', 'engineering']].map((departments) => [departments]))(
    'rejects malformed or duplicate departments %j', (departments) => {
      expect(validDepartments(departments)).toBe(false);
    },
  );
  it('allows valid empty arrays so the seeder can classify them as empty', () => {
    expect(validUsers([])).toBe(true);
    expect(validDepartments([])).toBe(true);
  });
});

describe('explicit reset', () => {
  it('replaces stale records/accounts/departments, clears both sessions, preserves theme and unrelated keys', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([legacy]));
    localStorage.setItem(USERS_KEY, 'stale');
    localStorage.setItem(DEPARTMENTS_KEY, 'stale');
    localStorage.setItem(SESSION_KEY, 'session');
    sessionStorage.setItem(AUTH_KEY, 'true');
    sessionStorage.setItem('other', 'retain');
    localStorage.setItem('other', 'retain');
    localStorage.setItem('hirehub_theme', 'dark');
    expect(resetToDefaults()).toEqual({ success: true, error: '' });
    expectDefaults();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(sessionStorage.getItem('other')).toBe('retain');
    expect(localStorage.getItem('other')).toBe('retain');
    expect(localStorage.getItem('hirehub_theme')).toBe('dark');
  });

  it.each(stores.map(([key]) => key))('never claims success when resetting %s exceeds quota and succeeds on retry', (blockedKey) => {
    localStorage.setItem(blockedKey, 'stale');
    const set = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === blockedKey) throw new Error('quota');
      return set.call(this, key, value);
    });
    expect(resetToDefaults()).toEqual({ success: false, error: expect.stringContaining('Changes may be partial') });
    expect(localStorage.getItem(blockedKey)).toBe('stale');
    spy.mockRestore();
    expect(resetToDefaults().success).toBe(true);
    expectDefaults();
  });

  it.each(['local', 'legacy'])('reports %s session removal failure and clears it on retry', (store) => {
    localStorage.setItem(SESSION_KEY, 'session');
    sessionStorage.setItem(AUTH_KEY, 'true');
    const remove = Storage.prototype.removeItem;
    const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (key) {
      if (this === (store === 'local' ? localStorage : sessionStorage)) throw new Error('denied');
      return remove.call(this, key);
    });
    expect(resetToDefaults().success).toBe(false);
    expectDefaults();
    expect((store === 'local' ? localStorage : sessionStorage).getItem(store === 'local' ? SESSION_KEY : AUTH_KEY)).not.toBeNull();
    spy.mockRestore();
    expect(resetToDefaults().success).toBe(true);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  });
});
