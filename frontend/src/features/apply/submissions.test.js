/** Verify persisted CRUD outcomes, corruption recovery, schema integrity, and browser failures. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSubmission, deleteSubmission, DUPLICATE_EMAIL_ERROR, readSubmissions, SUBMISSIONS_KEY, updateSubmission,
} from './submissions';
import { SAMPLE_RESUMES, validateMaterials } from './submissions';
import { seedMockData, DEFAULT_SUBMISSIONS } from '../data/mockData';
import { getSession, login, registerCandidate } from '../admin/auth';

const valid = { fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789', department: 'Engineering' };
const stored = { id: 'record-one', ...valid, submittedAt: '2026-03-04T12:00:00.000Z' };

/** Read actual serialized storage independently of the application reader. */
function persisted() {
  return JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Requery browser storage after every mutation and failed mutation. */
describe('submission persistence', () => {
  it('reads absent storage without inventing a dataset', () => {
    expect(readSubmissions()).toEqual([]);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBeNull();
  });

  it('creates a normalized complete record with a real UUID and ISO date', () => {
    const before = Date.now();
    const created = createSubmission({ ...valid, fullName: ' Alice Smith ', email: ' Alice@Example.com ' });
    expect(created).toEqual({
      ...valid, email: 'Alice@Example.com', id: expect.any(String), submittedAt: expect.any(String),
      userId: '', status: 'received', notes: '', portfolioUrl: '', sampleResume: '',
    });
    expect(created.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    expect(new Date(created.submittedAt).toISOString()).toBe(created.submittedAt);
    expect(Date.parse(created.submittedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(created.submittedAt)).toBeLessThanOrEqual(Date.now());
    expect(persisted()).toEqual([created]);
    expect(readSubmissions()).toEqual([created]);
    const queried = readSubmissions();
    queried[0].fullName = 'Changed In Memory';
    expect(readSubmissions()).toEqual([created]);
  });

  it.each(['alice@example.com', ' ALICE@EXAMPLE.COM ', 'Alice@Example.Com'])('rejects duplicate email %s without changing storage', (email) => {
    const created = createSubmission(valid);
    expect(() => createSubmission({ ...valid, email })).toThrow(DUPLICATE_EMAIL_ERROR);
    expect(readSubmissions()).toEqual([created]);
    expect(persisted()).toEqual([created]);
  });

  it('requeries externally changed storage before create/update/delete', () => {
    createSubmission(valid);
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    const second = createSubmission({ ...valid, email: 'second@example.com' });
    expect(readSubmissions()).toEqual([stored, second]);
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([second]));
    expect(() => updateSubmission(stored.id, valid)).toThrow('Submission not found.');
    expect(() => deleteSubmission(stored.id)).toThrow('Submission not found.');
    expect(readSubmissions()).toEqual([second]);
  });

  it('updates only editable fields while ignoring attempted immutable changes', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    const updated = updateSubmission(stored.id, {
      fullName: ' Bob Jones ', mobile: ' 9876543210 ', department: ' Design ',
      email: 'changed@example.com', id: 'changed', submittedAt: 'invalid', extra: 'ignored',
    });
    expect(updated).toEqual({ ...stored, fullName: 'Bob Jones', mobile: '9876543210', department: 'Design' });
    expect(persisted()).toEqual([updated]);
    expect(readSubmissions()).toEqual([updated]);
  });

  it('deletes only the requested record and persists empty after deleting the last', () => {
    const first = createSubmission(valid);
    const second = createSubmission({ ...valid, email: 'second@example.com' });
    expect(deleteSubmission(first.id)).toEqual(first);
    expect(persisted()).toEqual([second]);
    expect(readSubmissions()).toEqual([second]);
    expect(deleteSubmission(second.id)).toEqual(second);
    expect(persisted()).toEqual([]);
    expect(readSubmissions()).toEqual([]);
  });

  it.each([undefined, null, '', ' ', 1, {}, 'missing'])('reports missing/invalid ID %s without mutation', (id) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    expect(() => updateSubmission(id, valid)).toThrow('Submission not found.');
    expect(() => deleteSubmission(id)).toThrow('Submission not found.');
    expect(persisted()).toEqual([stored]);
    expect(readSubmissions()).toEqual([stored]);
  });

  it.each([undefined, null, false, [], {}, { ...valid, fullName: '<script>alert(1)</script>' }, { ...valid, mobile: 1234567890 }])
    ('rejects invalid create and update input %s without changing records', (input) => {
      localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
      expect(() => createSubmission(input)).toThrow('Please correct the application fields.');
      expect(() => updateSubmission(stored.id, input)).toThrow('Please correct the application fields.');
      expect(persisted()).toEqual([stored]);
      expect(readSubmissions()).toEqual([stored]);
    });

  for (const [field, value] of [['fullName', 'A'.repeat(101)], ['email', 'invalid'], ['mobile', '123'], ['department', 'Legal']]) {
    it(`rejects invalid ${field} on create and exposes its field error`, () => {
      let error;
      try {
        createSubmission({ ...valid, [field]: value });
      } catch (caught) {
        error = caught;
      }
      expect(error.fieldErrors[field]).toEqual(expect.any(String));
      expect(readSubmissions()).toEqual([]);
      expect(localStorage.getItem(SUBMISSIONS_KEY)).toBeNull();
    });
  }

  it('handles 200 persisted records and requeries update/delete outcomes', () => {
    for (let index = 0; index < 200; index += 1) {
      createSubmission({ ...valid, email: `candidate${index}@example.com` });
    }
    const records = readSubmissions();
    expect(records).toHaveLength(200);
    expect(new Set(records.map((record) => record.id)).size).toBe(200);
    const changed = updateSubmission(records[199].id, { ...valid, fullName: 'Last Candidate', department: 'Data Science' });
    expect(readSubmissions()[199]).toEqual(changed);
    deleteSubmission(records[0].id);
    expect(readSubmissions()).toEqual([ ...records.slice(1, 199), changed ]);
    expect(persisted()).toHaveLength(199);
  });
});

/** Reset the entire dataset instead of partially trusting corrupt records. */
describe('corrupt storage recovery', () => {
  it.each(['{bad', '', 'null', '{}', '42', '"array"'])('persists an empty reset for malformed/nonarray contents %s', (raw) => {
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
    expect(readSubmissions()).toEqual([]);
  });

  const malformed = [
    null, false, 17, 'record', [], {},
    ...Object.keys(stored).map((key) => ({ ...stored, [key]: undefined })),
    ...Object.keys(stored).map((key) => ({ ...stored, [key]: 42 })),
    { ...stored, extra: 'unexpected' },
    { ...stored, id: '' }, { ...stored, id: ' ' }, { ...stored, id: ' record ' },
    { ...stored, fullName: 'A'.repeat(101) }, { ...stored, fullName: '<img src=x onerror=alert(1)>' },
    { ...stored, fullName: ' Alice Smith ' }, { ...stored, email: 'invalid' },
    { ...stored, email: ' alice@example.com ' }, { ...stored, mobile: '123' },
    { ...stored, department: 'Legal' }, { ...stored, submittedAt: 'not-a-date' },
    { ...stored, submittedAt: '2026-03-04' }, { ...stored, submittedAt: '2026-02-30T12:00:00.000Z' },
  ];

  it.each(malformed)('resets invalid schema record %j and preserves no partial dataset', (record) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored, record]));
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
    expect(readSubmissions()).toEqual([]);
  });

  it.each([
    { ...stored, email: 'other@example.com' },
    { ...stored, id: 'other' },
    { ...stored, id: 'other', email: 'ALICE@EXAMPLE.COM' },
  ])('resets duplicate identity or email records %j', (duplicate) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored, duplicate]));
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
  });

  it('reads a valid existing array without changing it', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    expect(readSubmissions()).toEqual([stored]);
    expect(persisted()).toEqual([stored]);
  });
});

/** Extended schema/materials preserve legacy data and derive ownership only from current sessions. */
describe('extended applications', () => {
  it('preserves mixed legacy/PRD records and optional schedule byte-for-byte across reads and permitted updates', () => {
    const records = [stored, ...DEFAULT_SUBMISSIONS];
    const raw = JSON.stringify(records, null, 2);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(readSubmissions()).toEqual(records);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
    const updated = updateSubmission('c-101', { fullName: 'Alex Updated', mobile: '0123456789', department: 'Product',
      status: 'archived', notes: 'ignore', userId: 'u-admin', sampleResume: 'ignore', portfolioUrl: 'javascript:bad' });
    expect(updated).toEqual({ ...DEFAULT_SUBMISSIONS[0], fullName: 'Alex Updated', mobile: '0123456789', department: 'Product' });
    expect(readSubmissions()).toEqual([stored, updated, ...DEFAULT_SUBMISSIONS.slice(1)]);
    expect(persisted()).toEqual([stored, updated, ...DEFAULT_SUBMISSIONS.slice(1)]);
  });
  it.each([
    ...['userId', 'status', 'notes', 'portfolioUrl', 'sampleResume'].map((key) => { const record = { ...DEFAULT_SUBMISSIONS[1] }; delete record[key]; return record; }),
    { ...DEFAULT_SUBMISSIONS[1], userId: 42 }, { ...DEFAULT_SUBMISSIONS[1], userId: ' spaced ' },
    { ...DEFAULT_SUBMISSIONS[1], status: 'hired' }, { ...DEFAULT_SUBMISSIONS[1], notes: {} },
    { ...DEFAULT_SUBMISSIONS[1], portfolioUrl: 'javascript:alert(1)' }, { ...DEFAULT_SUBMISSIONS[1], portfolioUrl: ' https://example.com ' },
    { ...DEFAULT_SUBMISSIONS[1], portfolioUrl: 'https://name:pass@example.com' },
    { ...DEFAULT_SUBMISSIONS[0], portfolioUrl: 'not a url' },
    { ...DEFAULT_SUBMISSIONS[0], interviewSchedule: { ...DEFAULT_SUBMISSIONS[0].interviewSchedule, dateTime: '2026-11-01' } },
    { ...DEFAULT_SUBMISSIONS[1], sampleResume: 'Unknown' }, { ...DEFAULT_SUBMISSIONS[1], extra: 'unknown' },
    { ...DEFAULT_SUBMISSIONS[1], interviewSchedule: null }, { ...DEFAULT_SUBMISSIONS[1], interviewSchedule: [] },
    { ...DEFAULT_SUBMISSIONS[1], interviewSchedule: { dateTime: 'invalid', format: 'Video', location: 'Demo' } },
    { ...DEFAULT_SUBMISSIONS[1], interviewSchedule: { dateTime: '2026-11-01T09:00:00.000Z', format: ' ', location: 'Demo' } },
    { ...DEFAULT_SUBMISSIONS[1], interviewSchedule: { dateTime: '2026-11-01T09:00:00.000Z', format: 'Video', location: 'Demo', extra: 'unknown' } },
  ])('resets malformed extended schema %j instead of trusting a partial dataset', (record) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([record]));
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
  });
  it('creates owned applications with selected materials and ignores input privilege fields', () => {
    seedMockData();
    registerCandidate({ displayName: 'New Candidate', username: 'new@example.com', password: 'password123', confirmPassword: 'password123' });
    const created = createSubmission({ ...valid, email: 'new@example.com', portfolioUrl: ' https://example.com/work ', sampleResume: SAMPLE_RESUMES[1],
      userId: 'u-admin', notes: 'attacker', status: 'offer', submittedAt: 'bad', id: 'forged' });
    expect(created).toEqual({ ...valid, email: 'new@example.com', id: expect.any(String), userId: getSession().userId, status: 'received',
      submittedAt: expect.any(String), notes: '', portfolioUrl: 'https://example.com/work', sampleResume: 'UI/UX Case Study' });
    expect(persisted()).toEqual([...DEFAULT_SUBMISSIONS, created]);
    expect(readSubmissions()).toEqual(persisted());
  });
  it('admin sessions and public input cannot create candidate ownership', () => {
    seedMockData();
    login('admin', 'admin');
    const created = createSubmission({ ...valid, userId: 'u-201' });
    expect(created.userId).toBe('');
    expect(persisted().at(-1)).toEqual(created);
  });
  it('rejects UUID collision without corrupting existing data', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(stored.id);
    expect(() => createSubmission({ ...valid, email: 'other@example.com' })).toThrow('Unable to create a valid unique submission');
    expect(persisted()).toEqual([stored]);
  });
  it.each(SAMPLE_RESUMES)('persists sample selection %s', (sampleResume) => {
    const record = createSubmission({ ...valid, sampleResume });
    expect(readSubmissions()[0].sampleResume).toBe(sampleResume);
    expect(persisted()).toEqual([record]);
  });
  it.each(['javascript:alert(1)', 'data:text/html,bad', 'ftp://example.com', '//example.com', 'example.com', 'https://u:p@example.com', `https://example.com/${'x'.repeat(2048)}`])('rejects unsafe portfolio %s before saving', (portfolioUrl) => {
    expect(validateMaterials({ portfolioUrl }).errors).toHaveProperty('portfolioUrl');
    expect(() => createSubmission({ ...valid, portfolioUrl })).toThrow('Please correct the application materials');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBeNull();
  });
  it.each(['http://example.com', 'https://example.com/work?q=one#two'])('accepts explicit safe URL %s', (portfolioUrl) => {
    const created = createSubmission({ ...valid, portfolioUrl });
    expect(created.portfolioUrl).toBe(portfolioUrl);
    expect(persisted()).toEqual([created]);
  });
  it.each([undefined, null, false, 42, [], {}])('handles empty/non-object materials %j without coercion', (input) => {
    expect(validateMaterials(input)).toEqual({ values: { portfolioUrl: '', sampleResume: '' }, errors: {} });
  });
  it.each([{ portfolioUrl: 42 }, { portfolioUrl: null }, { sampleResume: {} }, { sampleResume: 'Unknown resume' }])('rejects invalid typed/unknown material %j', (input) => {
    expect(Object.keys(validateMaterials(input).errors)).toHaveLength(1);
    expect(() => createSubmission({ ...valid, ...input })).toThrow('Please correct the application materials');
    expect(persisted()).toBeNull();
  });
});

/** Surface storage failures and never fall back to in-memory success. */
describe('storage failures', () => {
  it('throws descriptive get errors for every operation', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => readSubmissions()).toThrow('Unable to read submissions.');
    expect(() => createSubmission(valid)).toThrow('Unable to read submissions.');
    expect(() => updateSubmission(stored.id, valid)).toThrow('Unable to read submissions.');
    expect(() => deleteSubmission(stored.id)).toThrow('Unable to read submissions.');
    spy.mockRestore();
    expect(readSubmissions()).toEqual([stored]);
  });

  it.each(['{bad', '{}'])('throws when the necessary corruption reset cannot be written: %s', (raw) => {
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => readSubmissions()).toThrow('Unable to save submissions.');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
    spy.mockRestore();
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
  });

  it('throws on create/update/delete write errors and preserves the actual stored dataset', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => createSubmission({ ...valid, email: 'second@example.com' })).toThrow('Unable to save submissions.');
    expect(() => updateSubmission(stored.id, { ...valid, fullName: 'Bob' })).toThrow('Unable to save submissions.');
    expect(() => deleteSubmission(stored.id)).toThrow('Unable to save submissions.');
    expect(readSubmissions()).toEqual([stored]);
    expect(persisted()).toEqual([stored]);
    spy.mockRestore();
    expect(readSubmissions()).toEqual([stored]);
  });
});
