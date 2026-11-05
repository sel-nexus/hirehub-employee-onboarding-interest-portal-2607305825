/** Verify real localStorage seeding, mixed migration, strict validation and failure feedback. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  initializeDemo, readUsers, readDemoSubmissions, saveUsers, saveDemoSubmissions,
  readSession, saveSession, resetMockData, USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY, DEMO_RESET_EVENT,
} from './storage';
import { DEFAULT_USERS, DEFAULT_SUBMISSIONS, validDemoSubmission } from './seed';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

/** Inspect serialized data independently of the demo reader. */
function persisted(key) {
  return JSON.parse(localStorage.getItem(key));
}

describe('demo persistence', () => {
  it('seeds exactly eight coherent applications, all stages and five default accounts', () => {
    expect(initializeDemo().success).toBe(true);
    expect(persisted(DEMO_SUBMISSIONS_KEY)).toEqual(DEFAULT_SUBMISSIONS);
    expect(persisted(USERS_KEY)).toEqual(DEFAULT_USERS);
    expect(readDemoSubmissions().data).toHaveLength(8);
    expect(new Set(DEFAULT_SUBMISSIONS.map((record) => record.department)).size).toBe(5);
    expect(new Set(DEFAULT_SUBMISSIONS.map((record) => record.status)).size).toBe(5);
    for (const record of readDemoSubmissions().data) {
      expect(validDemoSubmission(record)).toBe(true);
      const user = readUsers().data.find((account) => account.id === record.userId);
      expect(user.email).toBe(record.email);
      expect(user.displayName).toBe(record.fullName);
      expect(record.sampleResume).toEqual(expect.any(String));
      expect(record.resumeText).toContain(record.sampleResume);
      expect(record.portfolioUrl).toMatch(/^https:\/\//);
    }
    expect(DEFAULT_USERS.slice(0, 3).map((user) => user.username))
      .toEqual(['alex@example.com', 'jordan@example.com', 'taylor@example.com']);
    expect(DEFAULT_USERS.slice(0, 3).map((user) => user.email))
      .toEqual(['alex@example.com', 'jordan@example.com', 'taylor@example.com']);
    expect(DEFAULT_USERS.every((user) => Object.keys(user).sort().join(',')
      === ['id', 'role', 'username', 'password', 'displayName', 'fullName', 'email', 'mobile'].sort().join(','))).toBe(true);
    const records = persisted(DEMO_SUBMISSIONS_KEY);
    expect(new Set(records.map((record) => `${record.userId}:${record.department}`)).size).toBe(8);
    expect(new Set(DEFAULT_SUBMISSIONS.map((record) => record.sampleResume)))
      .toEqual(new Set(['Full-Stack Developer Resume (Sample)', 'UI/UX Case Study']));
    expect(DEFAULT_USERS.slice(0, 3).map((user) => user.password)).toEqual(Array(3).fill('password123'));
    expect(DEFAULT_USERS[3]).toMatchObject({ username: 'admin', password: 'admin', role: 'admin' });
    expect(DEFAULT_USERS[4]).toMatchObject({ username: 'recruiter@hirehub.demo', password: 'admin123', role: 'admin' });
    expect(readSession().data).toBeNull();
  });

  it.each([
    ['alex@example.com', 'Engineering', 'interview'],
    ['jordan@example.com', 'Design', 'review'],
    ['taylor@example.com', 'Marketing', 'offer'],
  ])('seeds the required %s account status independently of record order', (username, department, status) => {
    initializeDemo();
    const account = persisted(USERS_KEY).find((user) => user.username === username);
    expect(account).toMatchObject({ role: 'candidate', password: 'password123' });
    const owned = persisted(DEMO_SUBMISSIONS_KEY).filter((record) => record.userId === account.id);
    expect(owned.find((record) => record.department === department)).toMatchObject({ status, email: username });
    if (username === 'jordan@example.com') expect(owned.some((record) => record.status === 'offer')).toBe(false);
  });

  it('preserves intentional empty arrays and returns fresh reads', () => {
    expect(saveUsers([]).success).toBe(true);
    expect(saveDemoSubmissions([]).success).toBe(true);
    expect(initializeDemo().data).toEqual({ users: [], submissions: [], session: null });
    resetMockData();
    const records = readDemoSubmissions().data;
    records[0].interview.location = 'Changed in memory';
    expect(readDemoSubmissions().data).toEqual(DEFAULT_SUBMISSIONS);
  });

  it('migrates legacy records losslessly without silently appending demo records', () => {
    const legacy = {
      id: 'legacy', fullName: 'Legacy Candidate', email: 'legacy@example.com', mobile: '0123456789',
      department: 'Finance', submittedAt: '2026-03-04T12:00:00.000Z',
    };
    const raw = JSON.stringify([legacy]);
    localStorage.setItem(DEMO_SUBMISSIONS_KEY, raw);
    expect(initializeDemo().success).toBe(true);
    expect(readDemoSubmissions().data).toEqual([legacy]);
    expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(raw);
    expect(saveDemoSubmissions([legacy, ...DEFAULT_SUBMISSIONS]).success).toBe(true);
    expect(persisted(DEMO_SUBMISSIONS_KEY)).toEqual([legacy, ...DEFAULT_SUBMISSIONS]);
  });

  it('persists changed materials and accounts, then reset clears test records and both sessions but not theme', () => {
    initializeDemo();
    const users = [...DEFAULT_USERS, { ...DEFAULT_USERS[0], id: 'test-user', email: 'test@example.com', username: 'test@example.com' }];
    expect(saveUsers(users).success).toBe(true);
    const records = DEFAULT_SUBMISSIONS.map((record) => ({ ...record, notes: 'Test note' }));
    expect(saveDemoSubmissions(records).success).toBe(true);
    expect(readDemoSubmissions().data).toEqual(records);
    expect(readUsers().data).toEqual(users);
    expect(saveSession({ userId: 'test-user', role: 'candidate', displayName: users.at(-1).displayName,
      loginTimestamp: '2026-10-26T14:30:00.000Z' }).success).toBe(true);
    sessionStorage.setItem('hirehub_admin_auth', 'true');
    localStorage.setItem('hirehub_theme', 'dark');
    localStorage.setItem('unrelated', 'keep');
    const listener = vi.fn();
    window.addEventListener(DEMO_RESET_EVENT, listener);
    try {
      expect(resetMockData().success).toBe(true);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(DEMO_RESET_EVENT, listener);
    }
    expect(persisted(USERS_KEY)).toEqual(DEFAULT_USERS);
    expect(persisted(DEMO_SUBMISSIONS_KEY)).toEqual(DEFAULT_SUBMISSIONS);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem('hirehub_admin_auth')).toBeNull();
    expect(localStorage.getItem('hirehub_theme')).toBe('dark');
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it.each(['{bad', '', 'null', '{}', '42', '[{}]'])('visibly recovers corrupted data %s only in affected keys', (raw) => {
    initializeDemo();
    saveDemoSubmissions([]);
    localStorage.setItem(USERS_KEY, raw);
    const recovered = readUsers();
    expect(recovered).toMatchObject({ success: true, data: DEFAULT_USERS, warning: expect.stringContaining('recovered') });
    expect(readDemoSubmissions().data).toEqual([]);
    localStorage.setItem(DEMO_SUBMISSIONS_KEY, raw);
    expect(readDemoSubmissions()).toMatchObject({ success: true, data: DEFAULT_SUBMISSIONS, warning: expect.stringContaining('Corrupted') });
    expect(persisted(DEMO_SUBMISSIONS_KEY)).toEqual(DEFAULT_SUBMISSIONS);
  });

  it.each([undefined, null, {}, [null], [{ ...DEFAULT_USERS[0], extra: true }],
    [{ ...DEFAULT_USERS[0], role: 'recruiter' }], [{ ...DEFAULT_USERS[0], mobile: 1234567890 }],
    [{ ...DEFAULT_USERS[0], password: '' }], [{ ...DEFAULT_USERS[0], email: 'invalid' }],
    [{ ...DEFAULT_USERS[0], fullName: '<script>' }], [{ ...DEFAULT_USERS[0], username: ' spaced ' }],
    ...Object.keys(DEFAULT_USERS[0]).map((key) => [{ ...DEFAULT_USERS[0], [key]: undefined }]),
    [{ ...DEFAULT_USERS[0], displayName: '' }], [{ ...DEFAULT_USERS[0], displayName: 123 }],
    [{ ...DEFAULT_USERS[0], displayName: ' spaced ' }], [{ ...DEFAULT_USERS[0], displayName: 'x'.repeat(101) }],
    [DEFAULT_USERS[0], DEFAULT_USERS[0]],
  ])('rejects malformed accounts %j without overwriting storage', (users) => {
    readUsers();
    expect(saveUsers(users).success).toBe(false);
    expect(persisted(USERS_KEY)).toEqual(DEFAULT_USERS);
  });

  const badRecords = [
    ...Object.keys(DEFAULT_SUBMISSIONS[0]).map((key) => ({ ...DEFAULT_SUBMISSIONS[0], [key]: undefined })),
    { ...DEFAULT_SUBMISSIONS[0], extra: true }, { ...DEFAULT_SUBMISSIONS[0], status: 'hired' },
    { ...DEFAULT_SUBMISSIONS[0], department: 'Finance' }, { ...DEFAULT_SUBMISSIONS[0], resumeText: '' },
    { ...DEFAULT_SUBMISSIONS[0], coverLetterText: 'x'.repeat(20001) }, { ...DEFAULT_SUBMISSIONS[0], notes: {} },
    { ...DEFAULT_SUBMISSIONS[0], portfolioUrl: 'javascript:alert(1)' },
    { ...DEFAULT_SUBMISSIONS[0], portfolioUrl: 'https://user:pass@example.com' },
    { ...DEFAULT_SUBMISSIONS[0], interview: null },
    { ...DEFAULT_SUBMISSIONS[0], sampleResume: '' }, { ...DEFAULT_SUBMISSIONS[0], sampleResume: 123 },
    { ...DEFAULT_SUBMISSIONS[0], sampleResume: ' spaced ' },
    { ...DEFAULT_SUBMISSIONS[0], sampleResume: 'x'.repeat(201) },
    { ...DEFAULT_SUBMISSIONS[0], interview: { ...DEFAULT_SUBMISSIONS[0].interview, date: '2026-02-30' } },
    { ...DEFAULT_SUBMISSIONS[0], interview: { ...DEFAULT_SUBMISSIONS[0].interview, time: '25:00' } },
    { ...DEFAULT_SUBMISSIONS[0], interview: { ...DEFAULT_SUBMISSIONS[0].interview, timezone: 'No/SuchZone' } },
    { ...DEFAULT_SUBMISSIONS[0], interview: { ...DEFAULT_SUBMISSIONS[0].interview, location: '' } },
  ];
  it.each(badRecords)('rejects incomplete or malformed extended records %j before saving', (record) => {
    readDemoSubmissions();
    expect(saveDemoSubmissions([record]).success).toBe(false);
    expect(persisted(DEMO_SUBMISSIONS_KEY)).toEqual(DEFAULT_SUBMISSIONS);
  });

  it('persists exact PRD sessions matching stored accounts and allows explicit logout', () => {
    const session = { userId: 'user-alex', role: 'candidate', displayName: DEFAULT_USERS[0].displayName,
      loginTimestamp: '2026-10-26T14:30:00.000Z' };
    expect(saveSession(session).success).toBe(true);
    expect(readSession().data).toEqual(session);
    expect(persisted(SESSION_KEY)).toEqual(session);
    for (const invalid of [undefined, {}, [], { userId: 'user-alex', role: 'candidate' },
      ...Object.keys(session).map((key) => ({ ...session, [key]: undefined })),
      { ...session, userId: 'missing' }, { ...session, role: 'admin' }, { ...session, extra: true },
      { ...session, displayName: 'Different User' }, { ...session, displayName: 123 },
      { ...session, loginTimestamp: 123 }, { ...session, loginTimestamp: '' },
      { ...session, loginTimestamp: '2026-02-30T14:30:00.000Z' },
      { ...session, loginTimestamp: '2026-10-26' },
    ]) {
      expect(saveSession(invalid).success).toBe(false);
      expect(persisted(SESSION_KEY)).toEqual(session);
    }
    const adminSession = { ...session, userId: DEFAULT_USERS[3].id, role: 'admin', displayName: DEFAULT_USERS[3].displayName };
    expect(saveSession(adminSession).success).toBe(true);
    expect(readSession().data).toEqual(adminSession);
    expect(saveSession(null).success).toBe(true);
    expect(readSession().data).toBeNull();
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    saveUsers([]);
    expect(readSession()).toMatchObject({ data: null, warning: expect.stringContaining('Corrupted') });
    expect(persisted(SESSION_KEY)).toBeNull();
  });

  it('recovers obsolete two-field sessions to signed out with a warning', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: 'user-alex', role: 'candidate' }));
    expect(readSession()).toMatchObject({ success: true, data: null, warning: expect.stringContaining('Corrupted') });
    expect(persisted(SESSION_KEY)).toBeNull();
  });

  it('surfaces denied reads on every reader and session writer without claiming data', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    for (const operation of [readUsers, readDemoSubmissions, readSession, initializeDemo, () => saveSession(null)]) {
      expect(operation()).toMatchObject({ success: false, error: expect.stringContaining('Unable to read') });
    }
    spy.mockRestore();
    expect(localStorage.length).toBe(0);
  });

  it('reports failed saves, initialization, recovery and reset while preserving existing values', () => {
    initializeDemo();
    localStorage.setItem(USERS_KEY, '{bad');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    for (const operation of [() => saveUsers(DEFAULT_USERS), () => saveDemoSubmissions([]), readUsers, initializeDemo, resetMockData]) {
      expect(operation()).toMatchObject({ success: false, error: expect.stringContaining('Unable to save') });
    }
    expect(readUsers().warning).toContain('not recovered');
    expect(localStorage.getItem(USERS_KEY)).toBe('{bad');
    expect(persisted(DEMO_SUBMISSIONS_KEY)).toEqual(DEFAULT_SUBMISSIONS);
    spy.mockRestore();
    readUsers();
    const sessionSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(saveSession(null).success).toBe(false);
    sessionSpy.mockRestore();
  });

  it('reports session cleanup failures and does not emit a successful reset event', () => {
    initializeDemo();
    sessionStorage.setItem('hirehub_admin_auth', 'true');
    const listener = vi.fn();
    window.addEventListener(DEMO_RESET_EVENT, listener);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      expect(resetMockData()).toMatchObject({ success: false, error: expect.stringContaining('sessions could not be cleared') });
      expect(listener).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('hirehub_admin_auth')).toBe('true');
    } finally {
      window.removeEventListener(DEMO_RESET_EVENT, listener);
    }
  });
});
