/** Exercise recruiter filtering, validation, authorization and real localStorage state transitions. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SUBMISSIONS, DEFAULT_USERS, USERS_KEY, validSubmissions } from '../data/mockData';
import { SUBMISSIONS_KEY, readSubmissions } from '../apply/submissions';
import { AUTH_KEY, login } from './auth';
import {
  filterSubmissions, NOTES_MAX_LENGTH, readRecruiterSubmissions, requireRecruiter,
  STATUS_LABELS, updateRecruiterSubmission, validateRecruiterFields, withRecruiterDefaults,
} from './recruiterService';

const alex = DEFAULT_SUBMISSIONS[0];
const legacy = {
  id: 'legacy', fullName: 'Legacy Person', email: 'legacy@example.com', mobile: '1234567890',
  department: 'Engineering', submittedAt: '2026-01-01T00:00:00.000Z',
};

/** Write valid fixtures into the application's actual persistence boundary. */
function seed(records = DEFAULT_SUBMISSIONS) {
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  expect(login('admin', 'admin').success).toBe(true);
  seed();
});
afterEach(() => vi.restoreAllMocks());

describe('recruiter reads and filters', () => {
  it('reads fresh records each time, never retaining a repository cache', () => {
    expect(readRecruiterSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
    seed([legacy]);
    expect(readRecruiterSubmissions()).toEqual([legacy]);
    const defaults = withRecruiterDefaults(legacy);
    expect(defaults).toEqual({ ...legacy, userId: '', status: 'received', notes: '', portfolioUrl: '', sampleResume: '' });
    expect(readSubmissions()).toEqual([legacy]);
  });

  it.each([null, '{broken', '[{}]'])('recovers absent or corrupt data %s via the shared validated read', (raw) => {
    if (raw === null) localStorage.removeItem(SUBMISSIONS_KEY);
    else localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(readRecruiterSubmissions()).toEqual([]);
    if (raw !== null) expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('[]');
  });

  it('surfaces read errors and failed corruption recovery rather than inventing empty data', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => readRecruiterSubmissions()).toThrow('Unable to read submissions');
    spy.mockRestore();
    localStorage.setItem(SUBMISSIONS_KEY, '{bad');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => readRecruiterSubmissions()).toThrow('Unable to save submissions');
  });

  it('matches case-insensitive names or emails, combines filters and preserves ordering/input', () => {
    const records = [...DEFAULT_SUBMISSIONS, legacy];
    const before = JSON.stringify(records);
    expect(filterSubmissions(records)).toEqual(records);
    expect(filterSubmissions(records, { search: '  ALEX@EXAMPLE ' })).toEqual([alex]);
    expect(filterSubmissions(records, { search: 'rIvErA', department: 'Engineering', status: 'interview' })).toEqual([alex]);
    expect(filterSubmissions(records, { search: 'Rivera', department: 'Design' })).toEqual([]);
    expect(filterSubmissions(records, { search: 'Rivera', status: 'review' })).toEqual([]);
    expect(filterSubmissions(records, { department: 'Engineering', status: 'received' })).toEqual([legacy]);
    expect(filterSubmissions(records, { search: 42 })).toEqual(records);
    expect(filterSubmissions([], { search: 'alex' })).toEqual([]);
    expect(filterSubmissions(records, { department: 'Unknown' })).toEqual([]);
    expect(JSON.stringify(records)).toBe(before);
  });

  it.each(['Engineering', 'Design', 'Product', 'Marketing', 'Operations'])('filters the named department %s', (department) => {
    expect(filterSubmissions(DEFAULT_SUBMISSIONS, { department })).toEqual(DEFAULT_SUBMISSIONS.filter((r) => r.department === department));
  });
});

describe('recruiter updates', () => {
  it.each(Object.keys(STATUS_LABELS))('persists strict status %s and preserves every other field and record', (status) => {
    const saved = updateRecruiterSubmission(alex.id, { status });
    expect(saved).toEqual({ ...alex, status });
    expect(readSubmissions()).toEqual([{ ...alex, status }, ...DEFAULT_SUBMISSIONS.slice(1)]);
  });

  it('normalizes contact/material edits and preserves immutable metadata and interview schedule', () => {
    const saved = updateRecruiterSubmission(alex.id, {
      fullName: ' Alex Updated ', mobile: ' 9876543210 ', department: ' Product ',
      notes: 'Private evaluation', portfolioUrl: ' https://example.com/work ', sampleResume: ' UI/UX Case Study ',
    });
    expect(saved).toEqual({
      ...alex, fullName: 'Alex Updated', mobile: '9876543210', department: 'Product', notes: 'Private evaluation',
      portfolioUrl: 'https://example.com/work', sampleResume: 'UI/UX Case Study',
    });
    expect(readSubmissions()[0]).toEqual(saved);
    expect(readSubmissions().slice(1)).toEqual(DEFAULT_SUBMISSIONS.slice(1));
  });

  it('merges a patch into latest candidate contact, notes, stage and schedule rather than stale metadata', () => {
    const latest = { ...alex, fullName: 'Alex Current', mobile: '9876543210', status: 'offer', notes: 'Concurrent notes',
      interviewSchedule: { ...alex.interviewSchedule, location: 'New demo room' } };
    seed([latest, legacy]);
    updateRecruiterSubmission(alex.id, { portfolioUrl: '' });
    expect(readSubmissions()).toEqual([{ ...latest, portfolioUrl: '' }, legacy]);
  });

  it('enriches legacy records atomically and retains their identity/email/timestamp on edit', () => {
    seed([legacy]);
    expect(updateRecruiterSubmission(legacy.id, { notes: 'New note', status: 'review' })).toEqual({
      ...withRecruiterDefaults(legacy), notes: 'New note', status: 'review',
    });
    expect(validSubmissions(readSubmissions())).toBe(true);
    expect(updateRecruiterSubmission(legacy.id, {})).toEqual(readSubmissions()[0]);
  });

  it.each([
    ['status', 'unknown'], ['status', 'Review'], ['status', ' review '], ['status', ''], ['status', 2], ['status', null],
    ['status', { toString: () => 'review' }], ['notes', null], ['notes', 42], ['notes', []], ['notes', 'x'.repeat(NOTES_MAX_LENGTH + 1)],
    ['fullName', ''], ['fullName', 'Alex1'], ['fullName', '<script>x</script>'], ['fullName', 42],
    ['fullName', 'A'.repeat(101)], ['mobile', '123'], ['mobile', 1234567890], ['department', 'Unknown'], ['department', null],
    ['portfolioUrl', 'javascript:alert(1)'], ['portfolioUrl', 'data:text/html,x'], ['portfolioUrl', '//example.com'],
    ['portfolioUrl', 'https://user:password@example.com'], ['portfolioUrl', 'https://example.com/' + 'x'.repeat(2048)],
    ['portfolioUrl', 42], ['portfolioUrl', undefined], ['sampleResume', 'Unknown PDF'],
    ['sampleResume', {}], ['sampleResume', undefined],
  ])('rejects invalid %s patch input without changing storage', (field, value) => {
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    let error;
    try { updateRecruiterSubmission(alex.id, { [field]: value }); } catch (caught) { error = caught; }
    expect(error?.fieldErrors[field]).toBeTruthy();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });

  it('accepts bounded notes, empty materials and explicit HTTP links', () => {
    updateRecruiterSubmission(alex.id, { notes: 'x'.repeat(NOTES_MAX_LENGTH), portfolioUrl: 'http://example.com', sampleResume: '' });
    expect(readSubmissions()[0].notes).toHaveLength(NOTES_MAX_LENGTH);
    updateRecruiterSubmission(alex.id, { notes: '', portfolioUrl: '' });
    expect(readSubmissions()[0]).toEqual({ ...alex, notes: '', portfolioUrl: '', sampleResume: '' });
    expect(validateRecruiterFields(null).errors).toHaveProperty('status');
    expect(validateRecruiterFields([]).errors).toHaveProperty('notes');
  });

  it.each([null, undefined, [], 'status', 42, new Date()])('rejects non-object patch %s', (patch) => {
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    expect(() => updateRecruiterSubmission(alex.id, patch)).toThrow('editable submission patch');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });

  it.each(['id', 'email', 'userId', 'submittedAt', 'interviewSchedule', 'unexpected', '__proto__'])('rejects forbidden patch field %s', (key) => {
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    const patch = Object.fromEntries([[key, 'changed']]);
    expect(() => updateRecruiterSubmission(alex.id, patch)).toThrow('immutable');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });

  it.each([null, undefined, 42, '', ' ', 'missing', ' c-101 '])('rejects invalid or missing ID %s', (id) => {
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    expect(() => updateRecruiterSubmission(id, { notes: 'test' })).toThrow('Submission not found');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });

  it.each(['missing', 'candidate', 'revoked', 'tampered', 'corrupt-users'])('fails closed for %s authorization at mutation time', (state) => {
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    if (state === 'missing') localStorage.removeItem(AUTH_KEY);
    if (state === 'candidate') expect(login('alex@example.com', 'password123', 'candidate').success).toBe(true);
    if (state === 'revoked') localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS.filter((u) => u.id !== 'u-admin')));
    if (state === 'tampered') {
      const session = JSON.parse(localStorage.getItem(AUTH_KEY));
      localStorage.setItem(AUTH_KEY, JSON.stringify({ ...session, userId: 'u-201' }));
    }
    if (state === 'corrupt-users') localStorage.setItem(USERS_KEY, '{bad');
    expect(() => requireRecruiter()).toThrow('Administrator access');
    expect(() => updateRecruiterSubmission(alex.id, { notes: 'not allowed' })).toThrow('Administrator access');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });

  it('rechecks the role immediately before writing if it changes during the fresh read', () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      const value = original.call(this, key);
      if (key === SUBMISSIONS_KEY) localStorage.removeItem(AUTH_KEY);
      return value;
    });
    expect(() => updateRecruiterSubmission(alex.id, { notes: 'blocked' })).toThrow('Administrator access');
    expect(JSON.parse(original.call(localStorage, SUBMISSIONS_KEY))).toEqual(DEFAULT_SUBMISSIONS);
  });

  it('reports failed writes, leaves stored state intact, and allows a real retry', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => updateRecruiterSubmission(alex.id, { status: 'review' })).toThrow('Unable to save submissions');
    expect(readSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
    spy.mockRestore();
    updateRecruiterSubmission(alex.id, { status: 'review' });
    expect(readSubmissions()[0].status).toBe('review');
  });

  it('surfaces mutation-time read failures without touching records', () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === SUBMISSIONS_KEY) throw new Error('denied');
      return original.call(this, key);
    });
    expect(() => updateRecruiterSubmission(alex.id, { notes: 'new' })).toThrow('Unable to read submissions');
    expect(JSON.parse(original.call(localStorage, SUBMISSIONS_KEY))).toEqual(DEFAULT_SUBMISSIONS);
  });

  it('never reports success when the post-write read fails', () => {
    const original = Storage.prototype.getItem;
    let reads = 0;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === SUBMISSIONS_KEY && ++reads === 2) throw new Error('denied');
      return original.call(this, key);
    });
    expect(() => updateRecruiterSubmission(alex.id, { notes: 'persisted' })).toThrow('Unable to read submissions');
    expect(JSON.parse(original.call(localStorage, SUBMISSIONS_KEY))[0].notes).toBe('persisted');
  });

  it('detects ignored storage writes instead of falsely returning success', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    expect(() => updateRecruiterSubmission(alex.id, { notes: 'not saved' })).toThrow('Unable to verify');
    expect(readSubmissions()).toEqual(DEFAULT_SUBMISSIONS);
  });
});
