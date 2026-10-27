/** Verify seeding, non-destructive legacy preservation, recovery and transactional storage failures. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  USERS_KEY, SUBMISSIONS_KEY, DEPARTMENTS_KEY, SESSION_KEY, DATA_STORAGE_ERROR,
  DEFAULT_USERS, DEFAULT_SUBMISSIONS, DEFAULT_DEPARTMENTS,
  seedMockData, resetToDefaults, readMockData, validUsers, validSubmissions, persistChanges,
} from './mockData';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Return an intact legacy six-field record with the original ISO timestamp. */
function legacyRecord() {
  const { id, fullName, email, mobile, department, submittedAt } = DEFAULT_SUBMISSIONS[0];
  return { id, fullName, email, mobile, department, submittedAt };
}

describe('seedMockData and readMockData', () => {
  it('seeds eight owned applications, ten accounts and five departments with source keys', () => {
    expect(seedMockData()).toEqual({ success: true, error: '', recovered: [] });
    const data = readMockData();
    expect(data.success).toBe(true);
    expect(data.submissions).toEqual(DEFAULT_SUBMISSIONS);
    expect(data.users).toEqual(DEFAULT_USERS);
    expect(data.departments).toEqual(DEFAULT_DEPARTMENTS);
    expect(data.submissions).toHaveLength(8);
    expect(data.users.filter((user) => user.role === 'candidate')).toHaveLength(8);
    expect(new Set(data.submissions.map((record) => record.department))).toEqual(new Set(DEFAULT_DEPARTMENTS));
    expect(new Set(data.submissions.map((record) => record.status))).toEqual(new Set(['received', 'applied', 'review', 'interview', 'offer', 'archived']));
    for (const record of data.submissions) {
      expect(Object.keys(record).filter((key) => key !== 'interviewSchedule')).toEqual(['id', 'userId', 'fullName', 'email', 'mobile', 'department', 'status', 'submittedAt', 'notes', 'portfolioUrl', 'sampleResume']);
      if (record.interviewSchedule) expect(record.interviewSchedule).toEqual({
        dateTime: '2026-11-02T15:00:00.000Z', format: 'Video interview', location: 'HireHub demo meeting room',
      });
      expect(data.users.find((user) => user.id === record.userId)?.username).toBe(record.email);
    }
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('is idempotent, performs no writes to valid datasets, and re-reads rather than caching', () => {
    seedMockData();
    const snapshot = { ...localStorage };
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(seedMockData().success).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(snapshot);
    localStorage.setItem(SUBMISSIONS_KEY, '[]');
    expect(readMockData().submissions).toEqual([]);
  });

  it('preserves deliberately empty arrays across all datasets without replacing them', () => {
    for (const key of [USERS_KEY, SUBMISSIONS_KEY, DEPARTMENTS_KEY]) localStorage.setItem(key, '[]');
    expect(seedMockData()).toEqual({ success: true, error: '', recovered: [] });
    expect(readMockData()).toEqual({ success: true, error: '', users: [], submissions: [], departments: [] });
    for (const key of [USERS_KEY, SUBMISSIONS_KEY, DEPARTMENTS_KEY]) expect(localStorage.getItem(key)).toBe('[]');
  });

  it('preserves legacy records byte-for-byte, seeds missing peers and never changes timestamp or ID', () => {
    const raw = JSON.stringify([legacyRecord()], null, 2);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(seedMockData().success).toBe(true);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
    expect(readMockData().submissions).toEqual([legacyRecord()]);
  });

  it('preserves mixed legacy and extended records and optional future schedule metadata', () => {
    const records = [legacyRecord(), { ...DEFAULT_SUBMISSIONS[1], interviewSchedule: { dateTime: '2026-11-01T09:00:00.000Z', format: 'In person', location: 'Demo office' } }];
    const raw = JSON.stringify(records);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    seedMockData();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
    expect(readMockData().submissions).toEqual(records);
  });

  it.each([USERS_KEY, SUBMISSIONS_KEY, DEPARTMENTS_KEY])('recovers corrupt %s only and reports recovery', (key) => {
    seedMockData();
    localStorage.setItem(SESSION_KEY, 'old-session');
    localStorage.setItem(key, '{broken');
    const before = { ...localStorage };
    expect(seedMockData()).toEqual({ success: true, error: '', recovered: [key] });
    expect(readMockData().success).toBe(true);
    for (const other of [USERS_KEY, SUBMISSIONS_KEY, DEPARTMENTS_KEY].filter((value) => value !== key)) {
      expect(localStorage.getItem(other)).toBe(before[other]);
    }
    expect(localStorage.getItem(SESSION_KEY)).toBe(key === USERS_KEY ? null : 'old-session');
  });

  it.each(['null', '{}', 'true', '123', '"text"', '[null]', '[{}]'])('recovers malformed dataset %s rather than trusting it', (raw) => {
    for (const key of [USERS_KEY, SUBMISSIONS_KEY, DEPARTMENTS_KEY]) localStorage.setItem(key, raw);
    const result = seedMockData();
    expect(result.success).toBe(true);
    expect(result.recovered).toEqual([USERS_KEY, SUBMISSIONS_KEY, DEPARTMENTS_KEY]);
    expect(readMockData().submissions).toHaveLength(8);
  });

  it('fails a read without writes when data is missing or invalid', () => {
    expect(readMockData()).toMatchObject({ success: false, submissions: [] });
    localStorage.setItem(SUBMISSIONS_KEY, '{bad');
    expect(readMockData()).toMatchObject({ success: false, error: DATA_STORAGE_ERROR });
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('{bad');
  });

  it('reports getter and read failures safely, without using in-memory defaults as persisted data', () => {
    const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    expect(seedMockData()).toEqual({ success: false, error: DATA_STORAGE_ERROR, recovered: [] });
    expect(readMockData()).toMatchObject({ success: false, error: DATA_STORAGE_ERROR, submissions: [] });
    expect(resetToDefaults()).toEqual({ success: false, error: DATA_STORAGE_ERROR });
    getter.mockRestore();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(seedMockData().success).toBe(false);
    expect(readMockData().success).toBe(false);
  });

  it('does not report recovery or leave partial defaults after a quota failure', () => {
    localStorage.setItem(SUBMISSIONS_KEY, '{corrupt');
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SUBMISSIONS_KEY) throw new Error('quota');
      return originalSet.call(this, key, value);
    });
    expect(seedMockData()).toMatchObject({ success: false, recovered: [] });
    expect(localStorage.getItem(USERS_KEY)).toBeNull();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('{corrupt');
  });

  it('accepts an independent storage implementation without touching browser storage', () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    expect(seedMockData(storage).success).toBe(true);
    expect(readMockData(storage).submissions).toHaveLength(8);
    expect(resetToDefaults(storage).success).toBe(true);
    expect(localStorage.length).toBe(0);
  });
});

describe('schema validation', () => {
  it.each([null, {}, 1, 'users', [null], [{ ...DEFAULT_USERS[0], role: 'owner' }], [{ ...DEFAULT_USERS[0], password: '' }], [{ ...DEFAULT_USERS[0], displayName: [] }], [DEFAULT_USERS[0], DEFAULT_USERS[0]], [DEFAULT_USERS[0], { ...DEFAULT_USERS[0], id: 'other', username: 'ADMIN' }]])('rejects invalid users %j', (users) => {
    expect(validUsers(users)).toBe(false);
  });
  it('accepts valid empty and default user arrays', () => {
    expect(validUsers([])).toBe(true);
    expect(validUsers(DEFAULT_USERS)).toBe(true);
  });
  it.each([
    { id: '' }, { id: ' spaced ' }, { fullName: '<script>' }, { email: 'bad' }, { mobile: '123' },
    { department: 'Unknown' }, { submittedAt: 'not-a-date' }, { submittedAt: '2026-10-20' },
    { userId: 1 }, { status: 'owner' }, { notes: {} }, { portfolioUrl: null }, { sampleResume: [] },
  ])('rejects invalid record fields %j', (fields) => {
    expect(validSubmissions([{ ...DEFAULT_SUBMISSIONS[0], ...fields }])).toBe(false);
  });
  it.each([null, {}, 'records', 1, [null], [[]], [{ id: 'x' }], [DEFAULT_SUBMISSIONS[0], DEFAULT_SUBMISSIONS[0]], [DEFAULT_SUBMISSIONS[0], { ...DEFAULT_SUBMISSIONS[0], id: 'other', email: 'ALEX@example.com' }]])('rejects invalid or duplicate submissions %j', (records) => {
    expect(validSubmissions(records)).toBe(false);
  });
  it('accepts legacy, extended and intentional empty submissions', () => {
    expect(validSubmissions([legacyRecord()])).toBe(true);
    expect(validSubmissions(DEFAULT_SUBMISSIONS)).toBe(true);
    expect(validSubmissions([])).toBe(true);
  });
  it.each(['["Engineering","Engineering"]', '[" "]', '[3]'])('recovers invalid departments %s', (raw) => {
    localStorage.setItem(DEPARTMENTS_KEY, raw);
    expect(seedMockData().recovered).toEqual([DEPARTMENTS_KEY]);
    expect(readMockData().departments).toEqual(DEFAULT_DEPARTMENTS);
  });
});

describe('resetToDefaults and persistChanges', () => {
  it('restores defaults, removes stale registrations/session, and preserves theme and unrelated keys', () => {
    seedMockData();
    localStorage.setItem(USERS_KEY, '[]');
    localStorage.setItem(SUBMISSIONS_KEY, '[]');
    localStorage.setItem(DEPARTMENTS_KEY, '[]');
    localStorage.setItem(SESSION_KEY, 'session');
    localStorage.setItem('hirehub_theme', 'dark');
    localStorage.setItem('unrelated', 'keep');
    expect(resetToDefaults()).toEqual({ success: true, error: '' });
    expect(readMockData()).toEqual({ success: true, error: '', users: DEFAULT_USERS, submissions: DEFAULT_SUBMISSIONS, departments: DEFAULT_DEPARTMENTS });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem('hirehub_theme')).toBe('dark');
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(resetToDefaults().success).toBe(true);
  });
  it('restores the session and previous data after a one-shot partial reset write failure', () => {
    seedMockData();
    localStorage.setItem(SESSION_KEY, 'old-session');
    localStorage.setItem(USERS_KEY, '[]');
    const before = { ...localStorage };
    const original = Storage.prototype.setItem;
    let failed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SUBMISSIONS_KEY && !failed) {
        failed = true;
        throw new Error('quota');
      }
      return original.call(this, key, value);
    });
    expect(resetToDefaults()).toEqual({ success: false, error: DATA_STORAGE_ERROR });
    expect({ ...localStorage }).toEqual(before);
  });
  it('reports removal failure and preserves the prior session on failed reset', () => {
    localStorage.setItem(SESSION_KEY, 'keep');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(resetToDefaults().success).toBe(false);
    expect(localStorage.getItem(SESSION_KEY)).toBe('keep');
  });
  it('reports rollback failure explicitly rather than promising atomicity', () => {
    localStorage.setItem('existing', 'old');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const result = persistChanges(localStorage, { existing: 'new' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('could not be rolled back');
    expect(localStorage.getItem('existing')).toBe('old');
  });
  it('returns errors for failed reads before any changes are applied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(persistChanges(localStorage, { newKey: 'new' })).toEqual({ success: false, error: DATA_STORAGE_ERROR });
    expect(localStorage.length).toBe(0);
  });
});
