/** Verify private reads, real persistent contact edits and honest multi-key rollback. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { DEFAULT_USERS, DEFAULT_SUBMISSIONS, USERS_KEY, SESSION_KEY } from '../demo/mockData';
import { SUBMISSIONS_KEY, readSubmissions, validDataset } from '../apply/submissions';
import { login, logout, readSession } from '../admin/auth';
import { readCandidate, validateProfile, saveProfile } from './profile';

const contact = { fullName: 'Alex Updated', email: 'updated@example.com', mobile: '0123456789' };
const keys = [USERS_KEY, SUBMISSIONS_KEY, SESSION_KEY];
/** Read exact persisted bytes independently of candidate helpers. */
function snapshot() { return keys.map((key) => localStorage.getItem(key)); }
/** Read a fresh parsed store to prove persistent state transitions. */
function stored(key) { return JSON.parse(localStorage.getItem(key)); }
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS, null, 2));
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS, null, 2));
  expect(login('alex@example.com', 'password123', 'candidate').success).toBe(true);
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe('readCandidate ownership and privacy', () => {
  it('returns only linked own fields, never passwords, recruiter notes or other candidates', () => {
    const view = readCandidate();
    expect(view.profile).toEqual({ fullName: 'Alex Rivera', email: 'alex@example.com', mobile: '4155552671' });
    expect(view.applications.map((record) => record.id)).toEqual(['c-101']);
    expect(view.applications[0].interviewSchedule).toContain('October 28');
    const text = JSON.stringify(view);
    for (const secret of ['notes', 'Strong background', 'Jordan', 'jordan@example.com', 'password', 'password123']) expect(text).not.toContain(secret);
  });
  it.each([undefined, 'u-202'])('never treats matching email as ownership for linkage %s', (userId) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([
      { ...DEFAULT_SUBMISSIONS[0], userId },
    ]));
    expect(readCandidate().applications).toEqual([]);
    expect(readCandidate().profile.mobile).toBe('');
  });
  it.each(['alex@example.com', 'other-alex@example.com'])('preserves same-user multi-applications with email %s across shared readers, profile save and reread', (email) => {
    const records = [
      DEFAULT_SUBMISSIONS[0], { ...DEFAULT_SUBMISSIONS[0], id: 'second', email, department: 'Design', status: 'review' }, DEFAULT_SUBMISSIONS[1],
    ];
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records, null, 2));
    const before = snapshot();
    expect(validDataset(records)).toBe(true);
    expect(readSubmissions()).toEqual(records);
    expect(readCandidate().applications).toHaveLength(2);
    expect(snapshot()).toEqual(before);
    expect(saveProfile('u-201', contact)).toEqual({ success: true, error: '' });
    const expected = records.map((record) => record.userId === 'u-201' ? { ...record, ...contact } : record);
    const after = snapshot();
    expect(stored(SUBMISSIONS_KEY)).toEqual(expected);
    expect(validDataset(stored(SUBMISSIONS_KEY))).toBe(true);
    expect(readSubmissions()).toEqual(expected);
    expect(readCandidate().applications.map((record) => record.email)).toEqual([contact.email, contact.email]);
    expect(readCandidate().applications.map((record) => record.id)).toEqual(['c-101', 'second']);
    expect(readCandidate().profile).toEqual(contact);
    expect(snapshot()).toEqual(after);
  });
  it('uses account contact for an empty account and does not claim an application exists', () => {
    localStorage.removeItem(SUBMISSIONS_KEY);
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS.map((user) => user.id === 'u-201' ? { ...user, mobile: '1234567890' } : user)));
    expect(readCandidate()).toMatchObject({ success: true, profile: { mobile: '1234567890' }, applications: [] });
  });
  it('returns fresh projections without mutating source records', () => {
    const before = snapshot();
    readCandidate().applications[0].fullName = 'Tampered';
    expect(readCandidate().applications[0].fullName).toBe('Alex Rivera');
    expect(snapshot()).toEqual(before);
  });
  it.each(['missing', 'admin', 'removed', 'tampered'])('fails closed for %s identity without retained profile or applications', (mode) => {
    if (mode === 'missing') logout();
    if (mode === 'admin') login('admin', 'admin');
    if (mode === 'removed') localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS.filter((user) => user.id !== 'u-201')));
    if (mode === 'tampered') localStorage.setItem(SESSION_KEY, JSON.stringify({ ...readSession(), displayName: 'Forged' }));
    expect(readCandidate()).toEqual({ success: false, error: expect.any(String) });
  });
  it.each(['{bad', '{}', 'null', '[null]', '[{}]', JSON.stringify([DEFAULT_SUBMISSIONS[0], DEFAULT_SUBMISSIONS[0]]),
    JSON.stringify([{ ...DEFAULT_SUBMISSIONS[0], userId: 42 }])])('rejects corrupt submissions %s without modifying storage', (raw) => {
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    const before = snapshot();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(readCandidate()).toEqual({ success: false, error: expect.stringContaining('Unable to read') });
    expect(saveProfile('u-201', contact).success).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it.each([
    ...['id', 'fullName', 'email', 'mobile', 'department', 'submittedAt'].flatMap((field) => [
      [field, undefined], [field, null], [field, 42],
    ]),
    ['id', ' padded '], ['fullName', 'Alex2'], ['fullName', ' Alex Rivera '], ['fullName', 'A'.repeat(101)],
    ['email', 'bad'], ['email', '<a>@b.com'], ['mobile', '12345678901'], ['mobile', '(415) 555-2671'],
    ['department', 'Unknown'], ['submittedAt', 'bad date'], ['submittedAt', '2026-02-30T00:00:00.000Z'], ['submittedAt', '2026-10-20'],
    ['status', 'future'], ['status', null], ['userId', ''], ['userId', ' u-201 '],
    ['notes', {}], ['notes', 'x'.repeat(5001)], ['portfolioUrl', 'javascript:alert(1)'], ['portfolioUrl', []],
    ['sampleResume', 'Unknown resume'], ['sampleResume', []], ['interviewSchedule', {}], ['interviewSchedule', 'x'.repeat(501)],
    ['internalMetadata', { reviewer: 'PRIVATE' }], ['unknown', 'PRIVATE'],
  ])('rejects malformed stored %s %j on read and save without any storage mutation', (field, value) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([{ ...DEFAULT_SUBMISSIONS[0], [field]: value }]));
    const before = snapshot();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    expect(readCandidate()).toEqual({ success: false, error: expect.stringContaining('Unable to read candidate data') });
    expect(saveProfile('u-201', contact)).toMatchObject({ success: false, error: expect.stringContaining('Previous data was retained') });
    expect(snapshot()).toEqual(before);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it.each([undefined, 'u-202'])('rejects repeated email without the same linked owner (%s) without mutation', (userId) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([
      DEFAULT_SUBMISSIONS[0], { ...DEFAULT_SUBMISSIONS[0], id: 'conflict', userId },
    ]));
    const before = snapshot();
    expect(readCandidate().success).toBe(false);
    expect(saveProfile('u-201', contact).success).toBe(false);
    expect(snapshot()).toEqual(before);
  });
  it.each(['getter', USERS_KEY, SUBMISSIONS_KEY, SESSION_KEY])('fails closed when %s cannot be read', (blocked) => {
    if (blocked === 'getter') vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    else {
      const get = Storage.prototype.getItem;
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
        if (key === blocked) throw new Error('blocked');
        return get.call(this, key);
      });
    }
    expect(readCandidate()).toEqual({ success: false, error: expect.any(String) });
  });
});

describe('validateProfile and save validation', () => {
  it('trims contacts and normalizes the new login email', () => {
    expect(validateProfile({ fullName: ' Alex Updated ', email: ' UPDATED@EXAMPLE.COM ', mobile: ' 0123456789 ' })).toEqual({ values: contact, errors: {} });
  });
  it.each([null, undefined, [], 42, 'name', {},
    ...['fullName', 'email', 'mobile'].flatMap((field) => [
      { ...contact, [field]: undefined }, { ...contact, [field]: null }, { ...contact, [field]: 123 },
      { ...contact, [field]: {} }, { ...contact, [field]: [] },
    ]),
  ])('rejects missing fields and invalid types %j without persistent changes', (input) => {
    const before = snapshot();
    expect(Object.keys(validateProfile(input).errors).length).toBeGreaterThan(0);
    expect(saveProfile('u-201', input).success).toBe(false);
    expect(snapshot()).toEqual(before);
  });
  it.each([
    ['fullName', ''], ['fullName', '   '], ['fullName', 'A'.repeat(101)], ['fullName', 'Alex2'], ['fullName', '<script>'],
    ['email', ''], ['email', 'a@b'], ['email', 'a @b.com'], ['email', '<a>@b.com'], ['email', 'a'.repeat(249) + '@b.com'],
    ['mobile', ''], ['mobile', '123456789'], ['mobile', '12345678901'], ['mobile', '+14155552671'], ['mobile', 'abcdefghij'],
  ])('rejects invalid %s %j using existing contact rules', (field, value) => {
    const before = snapshot();
    expect(validateProfile({ ...contact, [field]: value }).errors[field]).toBeTruthy();
    expect(saveProfile('u-201', { ...contact, [field]: value }).success).toBe(false);
    expect(snapshot()).toEqual(before);
  });
  it('accepts name/email/mobile boundaries and stores them exactly', () => {
    const boundary = { fullName: 'A'.repeat(100), email: 'a'.repeat(248) + '@b.com', mobile: '0000000000' };
    expect(validateProfile(boundary).errors).toEqual({});
    expect(saveProfile('u-201', boundary).success).toBe(true);
    expect(stored(USERS_KEY).find((user) => user.id === 'u-201')).toMatchObject({ username: boundary.email, mobile: boundary.mobile, displayName: boundary.fullName });
  });
});

describe('saveProfile persistence, identity and failure recovery', () => {
  it('updates user, matching submissions and session while preserving identity, credentials, dates, notes and metadata', () => {
    const users = stored(USERS_KEY);
    users[2].internal = { retain: true };
    const records = stored(SUBMISSIONS_KEY);
    records[0].notes = 'PRIVATE reviewer notes retained exactly';
    records[0].portfolioUrl = 'https://example.com/private-portfolio';
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
    localStorage.setItem('hirehub_theme', 'dark');
    const oldSession = stored(SESSION_KEY);
    expect(saveProfile('u-201', contact)).toEqual({ success: true, error: '' });
    expect(stored(USERS_KEY)).toEqual(users.map((user) => user.id === 'u-201' ? { ...user, displayName: contact.fullName, username: contact.email, mobile: contact.mobile } : user));
    expect(stored(SUBMISSIONS_KEY)).toEqual(records.map((record) => record.userId === 'u-201' ? { ...record, ...contact } : record));
    expect(stored(SESSION_KEY)).toEqual({ ...oldSession, displayName: contact.fullName });
    expect(readSession().userId).toBe('u-201');
    expect(readCandidate().applications[0].fullName).toBe(contact.fullName);
    expect(localStorage.getItem('hirehub_theme')).toBe('dark');
    logout(); expect(login('alex@example.com', 'password123', 'candidate').success).toBe(false);
    expect(login(contact.email, 'password123', 'candidate').success).toBe(true);
    expect(saveProfile('u-201', { ...contact, email: 'again@example.com' }).success).toBe(true);
    expect(readCandidate().applications[0].email).toBe('again@example.com');
  });
  it('saves contact for a candidate with no applications, including an absent submissions key', () => {
    localStorage.removeItem(SUBMISSIONS_KEY);
    expect(saveProfile('u-201', contact).success).toBe(true);
    expect(stored(SUBMISSIONS_KEY)).toEqual([]);
    expect(readCandidate().profile).toEqual(contact);
    expect(stored(USERS_KEY).find((user) => user.id === 'u-201').mobile).toBe(contact.mobile);
  });
  it.each([' JORDAN@EXAMPLE.COM ', ' PRIYA@EXAMPLE.COM '])('blocks case-insensitive collision with user or unlinked submission %s', (email) => {
    const before = snapshot();
    expect(saveProfile('u-201', { ...contact, email })).toMatchObject({ success: false, errors: { email: expect.any(String) } });
    expect(snapshot()).toEqual(before);
  });
  it('allows retaining own email but never excludes a different owner with that email', () => {
    expect(saveProfile('u-201', { ...contact, email: ' ALEX@EXAMPLE.COM ' }).success).toBe(true);
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([{ ...DEFAULT_SUBMISSIONS[0], userId: 'u-202' }]));
    const before = snapshot();
    expect(saveProfile('u-201', { ...contact, email: 'alex@example.com' }).success).toBe(false);
    expect(snapshot()).toEqual(before);
  });
  it.each(['guest', 'admin', 'different', 'removed'])('rejects %s identity before writing contacts', (mode) => {
    if (mode === 'guest') logout();
    if (mode === 'admin') login('admin', 'admin');
    if (mode === 'different') login('jordan@example.com', 'password123', 'candidate');
    if (mode === 'removed') localStorage.setItem(USERS_KEY, '[]');
    const before = snapshot();
    expect(saveProfile('u-201', contact).success).toBe(false);
    expect(snapshot()).toEqual(before);
  });
  it.each(['getter', 'read', 'corrupt'])('reports %s storage error without overwriting existing data', (mode) => {
    if (mode === 'corrupt') localStorage.setItem(SUBMISSIONS_KEY, '{bad');
    const before = snapshot();
    if (mode === 'getter') vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    if (mode === 'read') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(saveProfile('u-201', contact).success).toBe(false);
    vi.restoreAllMocks(); expect(snapshot()).toEqual(before);
  });
  it.each(keys)('rolls back exact previous bytes when writing %s fails', (blocked) => {
    const before = snapshot();
    const set = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === blocked) throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, key, value);
    });
    const result = saveProfile('u-201', contact);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Previous data was retained');
    expect(snapshot()).toEqual(before);
    spy.mockRestore();
    expect(saveProfile('u-201', contact).success).toBe(true);
    expect(readCandidate().profile).toEqual(contact);
  });
  it('restores an absent submissions key after a later session failure', () => {
    localStorage.removeItem(SUBMISSIONS_KEY);
    const before = snapshot();
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, raw) {
      if (key === SESSION_KEY) throw new Error('quota');
      return set.call(this, key, raw);
    });
    expect(saveProfile('u-201', contact).success).toBe(false);
    expect(snapshot()).toEqual(before);
  });
  it('detects a silently dropped write and restores earlier writes rather than claiming success', () => {
    const before = snapshot();
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, raw) {
      if (key === SUBMISSIONS_KEY) return;
      return set.call(this, key, raw);
    });
    expect(saveProfile('u-201', contact).success).toBe(false);
    expect(snapshot()).toEqual(before);
  });
  it('warns explicitly when rollback fails and re-read identity fails closed', () => {
    const set = Storage.prototype.setItem;
    let changedUsers = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, raw) {
      if (key === SESSION_KEY || (key === USERS_KEY && changedUsers)) throw new Error('quota');
      if (key === USERS_KEY) changedUsers = true;
      return set.call(this, key, raw);
    });
    const result = saveProfile('u-201', contact);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Rollback also failed');
    expect(result.error).toContain('changes may be partial');
    expect(stored(USERS_KEY).find((user) => user.id === 'u-201').username).toBe(contact.email);
    expect(stored(SUBMISSIONS_KEY)).toEqual(DEFAULT_SUBMISSIONS);
    expect(readSession()).toBeNull();
    expect(readCandidate()).toEqual({ success: false, error: expect.any(String) });
  });
  it('warns exactly when a later session write fails and USERS rollback is silently ineffective', () => {
    const before = snapshot();
    const users = stored(USERS_KEY);
    const set = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, raw) {
      if (key === SESSION_KEY) throw new Error('session quota');
      if (key === USERS_KEY && raw === before[0]) return;
      return set.call(this, key, raw);
    });
    expect(saveProfile('u-201', contact)).toEqual({
      success: false,
      error: 'Unable to save your profile. Check browser storage permissions or available space and try again. Rollback also failed; changes may be partial. Check your account or try Reset Mock Data before retrying.',
    });
    expect(write).toHaveBeenCalledWith(USERS_KEY, before[0]);
    expect(stored(USERS_KEY)).toEqual(users.map((user) => user.id === 'u-201'
      ? { ...user, displayName: contact.fullName, username: contact.email, mobile: contact.mobile } : user));
    expect(localStorage.getItem(USERS_KEY)).not.toBe(before[0]);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before[1]);
    expect(localStorage.getItem(SESSION_KEY)).toBe(before[2]);
    expect(readSession()).toBeNull();
    expect(readCandidate()).toEqual({ success: false, error: expect.any(String) });
  });
  it('reports rollback removal failure for an originally absent submissions key', () => {
    localStorage.removeItem(SUBMISSIONS_KEY);
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, raw) {
      if (key === SESSION_KEY) throw new Error('quota');
      return set.call(this, key, raw);
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(saveProfile('u-201', contact)).toMatchObject({ success: false, error: expect.stringContaining('Rollback also failed') });
    expect(stored(SUBMISSIONS_KEY)).toEqual([]);
    expect(stored(USERS_KEY)).toEqual(DEFAULT_USERS);
  });
});
