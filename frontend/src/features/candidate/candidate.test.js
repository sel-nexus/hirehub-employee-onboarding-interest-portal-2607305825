/** Exercise candidate services against real jsdom localStorage, including failed transactions. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { authenticate, currentUser } from '../access/accounts';
import { initializeDemo, readUsers, readDemoSubmissions, saveDemoSubmissions,
  USERS_KEY, SESSION_KEY, DEMO_SUBMISSIONS_KEY } from '../demo/storage';
import { createApplication, readCandidatePortal, updateContact, RESUME_PRESETS } from './candidate';

const contacts = { fullName: 'Alex Quinn', email: 'alex.quinn@example.com', mobile: '2025550199' };
/** Re-read serialized state rather than trusting service return values. */
function persisted(key) {
  return JSON.parse(localStorage.getItem(key));
}

beforeEach(() => {
  localStorage.clear();
  initializeDemo();
  authenticate('alex@example.com', 'password123', 'candidate');
});
afterEach(() => vi.restoreAllMocks());

describe('readCandidatePortal', () => {
  it('shows only owned applications and omits recruiter notes and passwords', () => {
    const result = readCandidatePortal();
    expect(result.success).toBe(true);
    expect(result.data.applications).toHaveLength(3);
    expect(result.data.applications.every((record) => record.userId === 'user-alex')).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('Strong profile');
    expect(result.data.applications.every((record) => !Object.hasOwn(record, 'notes'))).toBe(true);
    expect(result.data.contact).toEqual({ fullName: 'Alex Morgan', email: 'alex@example.com', mobile: '2025550101' });
  });
  it('preserves intentional empty datasets', () => {
    saveDemoSubmissions([]);
    expect(readCandidatePortal().data.applications).toEqual([]);
  });
  it.each(['read', 'update', 'create'])('denies wrong role for %s', (operation) => {
    authenticate('admin', 'admin', 'admin');
    const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
    const result = operation === 'read' ? readCandidatePortal()
      : operation === 'update' ? updateContact(contacts) : createApplication({ department: 'Design', sampleResume: RESUME_PRESETS[0] });
    expect(result.success).toBe(false);
    expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
  });
  it.each(['read', 'update', 'create'])('denies a missing account for %s', (operation) => {
    localStorage.setItem(USERS_KEY, JSON.stringify(readUsers().data.filter((user) => user.id !== 'user-alex')));
    const result = operation === 'read' ? readCandidatePortal()
      : operation === 'update' ? updateContact(contacts) : createApplication({ department: 'Design', sampleResume: RESUME_PRESETS[0] });
    expect(result.success).toBe(false);
  });
  it('fails closed when storage is unreadable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
    expect(readCandidatePortal().success).toBe(false);
    expect(updateContact(contacts).success).toBe(false);
    expect(createApplication({}).success).toBe(false);
  });
});

describe('updateContact', () => {
  it('updates own contacts and session while preserving unrelated accounts and metadata', () => {
    const users = persisted(USERS_KEY);
    const records = persisted(DEMO_SUBMISSIONS_KEY);
    const session = persisted(SESSION_KEY);
    expect(updateContact({ ...contacts, userId: 'user-jordan' }).success).toBe(true);
    const changed = persisted(USERS_KEY);
    expect(changed.filter((user) => user.id !== 'user-alex')).toEqual(users.filter((user) => user.id !== 'user-alex'));
    expect(changed.find((user) => user.id === 'user-alex')).toEqual({ ...users[0], ...contacts, displayName: contacts.fullName });
    expect(persisted(SESSION_KEY)).toEqual({ ...session, displayName: contacts.fullName });
    expect(currentUser().success).toBe(true);
    for (const record of records) {
      expect(persisted(DEMO_SUBMISSIONS_KEY).find((item) => item.id === record.id))
        .toEqual(record.userId === 'user-alex' ? { ...record, ...contacts } : record);
    }
  });
  it.each([{ fullName: '123' }, { email: 'bad' }, { mobile: '12' }])('rejects invalid contact %j', (invalid) => {
    const before = localStorage.getItem(USERS_KEY);
    expect(updateContact({ ...contacts, ...invalid }).success).toBe(false);
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
  });
  it.each(['fullName', 'email', 'mobile'])('rejects an omitted %s independently without changing any serialized records', (field) => {
    const details = { ...contacts };
    delete details[field];
    const before = [USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
    const result = updateContact(details);
    expect(result.success).toBe(false);
    expect(Object.keys(result.fields)).toEqual([field]);
    expect([USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
  });
  it.each(['fullName', 'email', 'mobile'].flatMap((field) => (
    [undefined, null, 123, {}, [], true, '', '   '].map((value) => [field, value])
  )))('rejects invalid %s value %j independently without changing serialized records', (field, value) => {
    const before = [USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
    const result = updateContact({ ...contacts, [field]: value });
    expect(result.success).toBe(false);
    expect(Object.keys(result.fields)).toEqual([field]);
    expect([USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
  });
  it.each([
    ['fullName', 'A'.repeat(100), 'A'.repeat(101)],
    ['email', `${'a'.repeat(242)}@example.com`, `${'a'.repeat(243)}@example.com`],
    ['mobile', '0123456789', '01234567890'],
  ])('accepts the %s maximum and rejects one character over independently', (field, maximum, over) => {
    expect(updateContact({ ...contacts, [field]: maximum }).success).toBe(true);
    expect(persisted(USERS_KEY).find((user) => user.id === 'user-alex')[field]).toBe(maximum);
    expect(persisted(DEMO_SUBMISSIONS_KEY).filter((record) => record.userId === 'user-alex')
      .every((record) => record[field] === maximum)).toBe(true);
    const before = [USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
    const result = updateContact({ ...contacts, [field]: over });
    expect(result.success).toBe(false);
    expect(Object.keys(result.fields)).toEqual([field]);
    expect([USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
  });
  it('rejects another account email without changing ownership', () => {
    expect(updateContact({ ...contacts, email: 'jordan@example.com' }).fields.email).toBeTruthy();
    expect(persisted(USERS_KEY)[1].fullName).toBe('Jordan Lee');
  });
  it('reports quota failure on the first write without changes', () => {
    const before = localStorage.getItem(USERS_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(updateContact(contacts).success).toBe(false);
    expect(localStorage.getItem(USERS_KEY)).toBe(before);
  });
  it.each([DEMO_SUBMISSIONS_KEY, SESSION_KEY])('rolls back all touched keys after %s write failure', (failedKey) => {
    const before = [USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
    const original = Storage.prototype.setItem;
    let failed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === failedKey && !failed) { failed = true; throw new Error('quota'); }
      return original.call(this, key, value);
    });
    const result = updateContact(contacts);
    expect(result.success).toBe(false);
    expect(result.error).toContain('rolled back');
    expect([USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
    expect(currentUser().success).toBe(true);
  });
  it('reports incomplete rollback honestly and denies mismatched session identity', () => {
    const original = Storage.prototype.setItem;
    let writes = 0;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      writes += 1;
      if (writes > 1) throw new Error('quota');
      return original.call(this, key, value);
    });
    const result = updateContact(contacts);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Rollback failed');
    expect(currentUser().success).toBe(false);
  });
});

describe('createApplication', () => {
  it('creates initial applied/null records for multiple departments using current identity', () => {
    const before = persisted(DEMO_SUBMISSIONS_KEY);
    expect(createApplication({ department: 'Design', sampleResume: RESUME_PRESETS[1], portfolioUrl: 'https://example.com/work',
      userId: 'user-jordan', status: 'offer' }).success).toBe(true);
    expect(createApplication({ department: 'Marketing', sampleResume: RESUME_PRESETS[0] }).success).toBe(true);
    const records = persisted(DEMO_SUBMISSIONS_KEY);
    expect(records.slice(0, before.length)).toEqual(before);
    expect(records.at(-2)).toMatchObject({ department: 'Design', userId: 'user-alex', status: 'applied', interview: null,
      sampleResume: RESUME_PRESETS[1], notes: '', portfolioUrl: 'https://example.com/work' });
    expect(Object.keys(records.at(-1))).toHaveLength(14);
    expect(readDemoSubmissions().data).toEqual(records);
  });
  it('rejects duplicate departments only for the current candidate', () => {
    expect(createApplication({ department: 'Engineering', sampleResume: RESUME_PRESETS[0] }).success).toBe(false);
    expect(createApplication({ department: 'Design', sampleResume: RESUME_PRESETS[0] }).success).toBe(true);
  });
  it.each(['javascript:alert(1)', 'ftp://example.com', '/relative', 'https://user:pass@example.com', 'bad', 123])(
    'rejects unsafe URL %s without persistence', (portfolioUrl) => {
      const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
      expect(createApplication({ department: 'Design', portfolioUrl, sampleResume: RESUME_PRESETS[0] }).success).toBe(false);
      expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
    });
  it.each([{}, { department: 'Other', sampleResume: RESUME_PRESETS[0] }, { department: 'Design', sampleResume: 'unknown' }])(
    'rejects missing or invalid material/department %j', (details) => {
      const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
      expect(createApplication(details).success).toBe(false);
      expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
    });
  it.each([undefined, null, '', '   ', 123, {}, [], true, 'Other'])(
    'requires a valid department even with valid materials: %j', (department) => {
      const before = [USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
      const result = createApplication({ department, sampleResume: RESUME_PRESETS[0] });
      expect(result.success).toBe(false);
      expect(Object.keys(result.fields)).toEqual(['department']);
      expect([USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
    });
  it('requires an omitted department independently of valid materials', () => {
    const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
    expect(createApplication({ sampleResume: RESUME_PRESETS[0] }).fields).toEqual({ department: expect.any(String) });
    expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
  });
  it.each([{}, { portfolioUrl: undefined, sampleResume: undefined }, { portfolioUrl: null, sampleResume: null },
    { portfolioUrl: '', sampleResume: '' }, { portfolioUrl: '   ' }])(
    'requires at least one material with a valid department: %j', (materials) => {
      const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
      const result = createApplication({ department: 'Design', ...materials });
      expect(result.success).toBe(false);
      expect(Object.keys(result.fields)).toEqual(['sampleResume']);
      expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
    });
  it.each([undefined, null, '', '   '])('allows an optional empty portfolio %j with a valid resume', (portfolioUrl) => {
    expect(createApplication({ department: 'Design', sampleResume: RESUME_PRESETS[0], portfolioUrl }).success).toBe(true);
    expect(persisted(DEMO_SUBMISSIONS_KEY).at(-1).portfolioUrl).toBe('');
  });
  it.each([undefined, null, ''])('allows an optional empty resume %j with a valid portfolio', (sampleResume) => {
    expect(createApplication({ department: 'Design', portfolioUrl: 'https://example.com/work', sampleResume }).success).toBe(true);
    expect(persisted(DEMO_SUBMISSIONS_KEY).at(-1).sampleResume).toBe('Portfolio supplied; no mock resume selected');
  });
  it.each([false, 0])('rejects falsy non-string resume %j with a valid portfolio without changing serialized records', (sampleResume) => {
    const before = [USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
    const result = createApplication({ department: 'Design', portfolioUrl: 'https://example.com/work', sampleResume });
    expect(result.success).toBe(false);
    expect(result.fields).toEqual({ sampleResume: 'Choose a supplied mock resume.' });
    expect([USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
  });
  it.each([
    ...[123, {}, [], true].map((value) => ['portfolioUrl', value]),
    ...[123, {}, [], true, '   ', 'unknown'].map((value) => ['sampleResume', value]),
  ])('rejects invalid optional %s value %j despite another valid material', (field, value) => {
    const before = [USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
    const result = createApplication({ department: 'Design', portfolioUrl: 'https://example.com/work',
      sampleResume: RESUME_PRESETS[0], [field]: value });
    expect(result.success).toBe(false);
    expect(Object.keys(result.fields)).toEqual([field]);
    expect([USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
  });
  it('accepts a 2000-character URL and rejects 2001 without weakening storage validation', () => {
    const prefix = 'https://example.com/';
    const portfolioUrl = prefix + 'a'.repeat(2000 - prefix.length);
    expect(portfolioUrl).toHaveLength(2000);
    expect(createApplication({ department: 'Design', portfolioUrl }).success).toBe(true);
    expect(persisted(DEMO_SUBMISSIONS_KEY).at(-1).portfolioUrl).toBe(portfolioUrl);
    expect(readDemoSubmissions().success).toBe(true);
    const before = [USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key));
    const result = createApplication({ department: 'Marketing', portfolioUrl: `${portfolioUrl}a`, sampleResume: RESUME_PRESETS[0] });
    expect(result.success).toBe(false);
    expect(Object.keys(result.fields)).toEqual(['portfolioUrl']);
    expect([USERS_KEY, DEMO_SUBMISSIONS_KEY, SESSION_KEY].map((key) => localStorage.getItem(key))).toEqual(before);
  });
  it('persists and re-reads a safe portfolio-only application without inventing a resume', () => {
    const before = persisted(DEMO_SUBMISSIONS_KEY);
    const result = createApplication({ department: 'Design', portfolioUrl: 'https://example.com/work' });
    expect(result.success).toBe(true);
    const records = persisted(DEMO_SUBMISSIONS_KEY);
    expect(records).toHaveLength(before.length + 1);
    expect(records.slice(0, before.length)).toEqual(before);
    const application = records.at(-1);
    expect(application).toMatchObject({ department: 'Design', userId: 'user-alex', status: 'applied', interview: null,
      portfolioUrl: 'https://example.com/work', sampleResume: 'Portfolio supplied; no mock resume selected',
      resumeText: 'No mock resume selected. Review the supplied portfolio link.' });
    const reread = readDemoSubmissions();
    expect(reread.success).toBe(true);
    expect(reread.data).toEqual(records);
    const portal = readCandidatePortal();
    expect(portal.success).toBe(true);
    const { notes, ...visible } = application;
    expect(portal.data.applications.at(-1)).toEqual(visible);
    expect(result.data).toEqual(portal.data);
  });
  it.each([{ sampleResume: RESUME_PRESETS[0] }, { portfolioUrl: 'https://example.com/work' }])(
    'reports quota without persisting or declaring success for %j', (materials) => {
    const before = localStorage.getItem(DEMO_SUBMISSIONS_KEY);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const result = createApplication({ department: 'Design', ...materials });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unable to save');
    expect(result.error).not.toContain('requires a mock resume');
    expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe(before);
  });
});
