/** Verify ownership, projection, profile/account consistency and every persistence failure boundary. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getSession, login, logout, registerCandidate } from '../admin/auth';
import { seedMockData, DEFAULT_SUBMISSIONS, SUBMISSIONS_KEY, USERS_KEY, SESSION_KEY } from '../data/mockData';
import { MILESTONES, stageFor, readCandidateApplications, validateContact, updateCandidateContact } from './candidateService';

const contact = { fullName: 'Alex Updated', email: 'updated@example.com', mobile: '0123456789' };
const read = (key) => JSON.parse(localStorage.getItem(key));
beforeEach(() => {
  localStorage.clear();
  seedMockData();
  login('alex@example.com', 'password123', 'candidate');
});
afterEach(() => vi.restoreAllMocks());

describe('candidate reads and stages', () => {
  it('projects only owned fields with no internal notes, password or other candidates', () => {
    const result = readCandidateApplications();
    expect(result).toEqual([{
      id: 'c-101', fullName: 'Alex Rivera', email: 'alex@example.com', mobile: '4155552671', department: 'Engineering',
      submittedAt: DEFAULT_SUBMISSIONS[0].submittedAt, portfolioUrl: 'https://alexrivera.dev',
      sampleResume: 'Frontend Software Engineer (5 YOE)', status: 'interview', interviewSchedule: { ...DEFAULT_SUBMISSIONS[0].interviewSchedule },
    }]);
    expect(result[0]).not.toHaveProperty('notes');
    expect(result[0]).not.toHaveProperty('password');
    result[0].interviewSchedule.location = 'memory only';
    expect(readCandidateApplications()[0].interviewSchedule.location).toBe('HireHub demo meeting room');
  });
  it('does not claim unowned legacy records even when their email matches; reads intentional empty', () => {
    const { id, fullName, email, mobile, department, submittedAt } = DEFAULT_SUBMISSIONS[0];
    const raw = JSON.stringify([{ id, fullName, email, mobile, department, submittedAt }]);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(readCandidateApplications()).toEqual([]);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
    localStorage.setItem(SUBMISSIONS_KEY, '[]');
    expect(readCandidateApplications()).toEqual([]);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('[]');
  });
  it('registration creates an account with no applications and never exposes seed peers', () => {
    registerCandidate({ displayName: 'New Candidate', username: 'new@example.com', password: 'password123', confirmPassword: 'password123' });
    expect(readCandidateApplications()).toEqual([]);
    expect(read(SUBMISSIONS_KEY)).toEqual(DEFAULT_SUBMISSIONS);
  });
  it.each(['logout', 'admin', 'forged'])('rejects reads and updates for %s access without writes', (mode) => {
    if (mode === 'logout') logout();
    if (mode === 'admin') login('admin', 'admin');
    if (mode === 'forged') localStorage.setItem(SESSION_KEY, JSON.stringify({ ...getSession(), role: 'admin' }));
    const before = { ...localStorage };
    expect(() => readCandidateApplications()).toThrow('Sign in as a candidate');
    expect(() => updateCandidateContact('c-101', contact)).toThrow('Sign in as a candidate');
    expect({ ...localStorage }).toEqual(before);
  });
  it.each(['{bad', 'null', '{}', '[{}]', JSON.stringify([{ ...DEFAULT_SUBMISSIONS[0], notes: null }])])('reports corrupt/missing records without destructive repair: %s', (raw) => {
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(() => readCandidateApplications()).toThrow('Unable to read your applications');
    expect(() => updateCandidateContact('c-101', contact)).toThrow('Unable to read your applications');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
  });
  it('reports an unavailable submissions read while preserving storage', () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === SUBMISSIONS_KEY) throw new Error('denied');
      return original.call(this, key);
    });
    expect(() => readCandidateApplications()).toThrow('Unable to read your applications');
  });
  it.each([
    ['received', 0, 'Application Received'], ['applied', 0, 'Application Received'], ['review', 1, 'Under Review'],
    ['interview', 2, 'Interview Scheduled'], ['offer', 3, 'Offer Extended'], ['archived', 3, 'Not Selected'],
    ['unknown', 0, 'Application Received'], [undefined, 0, 'Application Received'],
    ['__proto__', 0, 'Application Received'], ['constructor', 0, 'Application Received'],
    [null, 0, 'Application Received'], [42, 0, 'Application Received'], [{}, 0, 'Application Received'],
  ])('maps %s to four milestones with friendly next text', (status, index, label) => {
    expect(stageFor(status)).toEqual({ index, label, next: expect.stringMatching(/\S.{20}/) });
    expect(MILESTONES).toEqual(['Application Received', 'Profile Screening', 'Interview Scheduled', 'Final Decision']);
  });
});

describe('contact validation and update', () => {
  it('normalizes only contacts and rejects missing values without coercion', () => {
    expect(validateContact({ ...contact, fullName: ' Alex Updated ', email: ' Updated@Example.com ', status: 'offer' }))
      .toEqual({ values: contact, errors: {} });
    expect(Object.keys(validateContact(null).errors)).toEqual(['fullName', 'email', 'mobile']);
  });
  it.each([
    ['fullName', ''], ['fullName', 42], ['fullName', '<script>'], ['fullName', 'A'.repeat(101)],
    ['email', 'invalid'], ['email', {}], ['email', `${'a'.repeat(250)}@b.com`], ['mobile', '123'], ['mobile', 1234567890],
  ])('rejects invalid %s %j and preserves actual storage', (field, value) => {
    const before = { ...localStorage };
    expect(validateContact({ ...contact, [field]: value }).errors).toHaveProperty(field);
    expect(() => updateCandidateContact('c-101', { ...contact, [field]: value })).toThrow('Please correct your contact details');
    expect({ ...localStorage }).toEqual(before);
  });
  it.each([undefined, null, '', 'missing', 'c-102', 101, {}])('refuses missing/foreign id %j', (id) => {
    const before = { ...localStorage };
    expect(() => updateCandidateContact(id, contact)).toThrow('Application not found or not owned');
    expect({ ...localStorage }).toEqual(before);
  });
  it.each(['JORDAN@example.com', 'recruiter@hirehub.demo'])('rejects conflicting candidate/admin account %s', (email) => {
    const before = { ...localStorage };
    expect(() => updateCandidateContact('c-101', { ...contact, email })).toThrow('This email belongs to another account or application');
    expect({ ...localStorage }).toEqual(before);
  });
  it('rejects a conflicting unowned submission independently of accounts', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([...DEFAULT_SUBMISSIONS, {
      id: 'legacy', fullName: 'Legacy User', email: contact.email, mobile: '1234567890', department: 'Design', submittedAt: '2026-01-01T00:00:00.000Z',
    }]));
    const before = { ...localStorage };
    expect(() => updateCandidateContact('c-101', contact)).toThrow('This email belongs');
    expect({ ...localStorage }).toEqual(before);
  });
  it('preserves latest status, notes, resume, schedule and other users while updating account and valid session', () => {
    const records = read(SUBMISSIONS_KEY);
    records[0] = { ...records[0], status: 'offer', notes: 'Latest internal evaluation' };
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
    const users = read(USERS_KEY);
    const session = getSession();
    const saved = updateCandidateContact('c-101', { ...contact, status: 'archived', notes: 'attacker', userId: 'u-admin', password: 'new' });
    expect(saved).toMatchObject({ ...contact, status: 'offer' });
    expect(saved).not.toHaveProperty('notes');
    expect(read(SUBMISSIONS_KEY)).toEqual([{ ...records[0], ...contact }, ...records.slice(1)]);
    expect(read(USERS_KEY)).toEqual(users.map((user) => user.id === session.userId
      ? { ...user, username: contact.email, displayName: contact.fullName } : user));
    expect(getSession()).toEqual({ ...session, displayName: contact.fullName });
    expect(readCandidateApplications()).toEqual([saved]);
    logout();
    expect(login('alex@example.com', 'password123', 'candidate').success).toBe(false);
    expect(login(contact.email, 'password123', 'candidate').success).toBe(true);
    expect(readCandidateApplications()).toEqual([saved]);
  });
  it('allows saving unchanged email/name and keeps candidate ownership', () => {
    const saved = updateCandidateContact('c-101', DEFAULT_SUBMISSIONS[0]);
    expect(readCandidateApplications()).toEqual([saved]);
    expect(read(SUBMISSIONS_KEY)[0]).toEqual(DEFAULT_SUBMISSIONS[0]);
  });
  it.each([SUBMISSIONS_KEY, USERS_KEY, SESSION_KEY])('rolls back a one-shot write failure on %s without claiming success', (failedKey) => {
    const before = { ...localStorage };
    const original = Storage.prototype.setItem;
    let failed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === failedKey && !failed) { failed = true; throw new Error('quota'); }
      return original.call(this, key, value);
    });
    expect(() => updateCandidateContact('c-101', contact)).toThrow('Unable to save your profile');
    expect({ ...localStorage }).toEqual(before);
    expect(getSession()?.displayName).toBe('Alex Rivera');
  });
  it('reports rollback failure explicitly and never returns saved profile', () => {
    const before = { ...localStorage };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => updateCandidateContact('c-101', contact)).toThrow('could not be rolled back');
    expect({ ...localStorage }).toEqual(before);
  });
  it.each(['corrupt', 'missing', 'changed-role'])('fails closed on %s accounts during the profile operation', (mode) => {
    const original = Storage.prototype.getItem;
    let userReads = 0;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === USERS_KEY && ++userReads > 1) {
        if (mode === 'corrupt') return '{bad';
        const users = JSON.parse(original.call(this, key));
        return JSON.stringify(mode === 'missing' ? users.filter((user) => user.id !== 'u-201')
          : users.map((user) => user.id === 'u-201' ? { ...user, role: 'admin' } : user));
      }
      return original.call(this, key);
    });
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    expect(() => updateCandidateContact('c-101', contact)).toThrow('Unable to read your local account');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });
});
