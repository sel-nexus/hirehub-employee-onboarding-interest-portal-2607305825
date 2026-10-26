/** Verify persisted CRUD outcomes, corruption recovery, schema integrity, and browser failures. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSubmission, deleteSubmission, DUPLICATE_EMAIL_ERROR, readSubmissions, SUBMISSIONS_KEY, updateSubmission,
  updateSubmissionStatus, validDataset, validateSubmissionMetadata, METADATA_LIMITS,
} from './submissions';
import { DEFAULT_SUBMISSIONS, SAMPLE_RESUMES, seedDemoData } from '../demo/mockData';

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

/** Preserve legacy integrity while accepting only validated optional demo fields. */
describe('optional demo submission schema', () => {
  const extended = {
    ...stored, userId: 'u-201', status: 'interview', notes: 'Recruiter notes',
    portfolioUrl: 'https://example.com/portfolio', sampleResume: 'Frontend Software Engineer (5 YOE)',
    interviewSchedule: 'October 28, 2026 at 10:00 AM Pacific',
  };

  it('round-trips extended records and keeps metadata unchanged during existing contact edits', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([extended]));
    expect(readSubmissions()).toEqual([extended]);
    const changed = updateSubmission(extended.id, {
      ...valid, fullName: 'Updated Name', userId: 'hijack', status: 'archived',
      id: 'changed', submittedAt: 'invalid', email: 'changed@example.com', extra: 'ignored',
    });
    expect(changed).toEqual({ ...extended, fullName: 'Updated Name' });
    expect(persisted()).toEqual([changed]);
    expect(readSubmissions()).toEqual([changed]);
    expect(deleteSubmission(changed.id)).toEqual(changed);
    expect(persisted()).toEqual([]);
  });

  it('creates optional fields but still generates immutable identity and time', () => {
    const created = createSubmission({ ...extended, id: 'attempted', submittedAt: 'invalid' });
    expect(created).toEqual({ ...extended, id: expect.any(String), submittedAt: expect.any(String) });
    expect(created.id).not.toBe('attempted');
    expect(new Date(created.submittedAt).toISOString()).toBe(created.submittedAt);
    expect(persisted()).toEqual([created]);
    expect(readSubmissions()).toEqual([created]);
  });

  it.each(['applied', 'review', 'interview', 'offer', 'archived'])('accepts the canonical %s status', (status) => {
    const created = createSubmission({ ...valid, status });
    expect(readSubmissions()).toEqual([created]);
    expect(created.status).toBe(status);
  });

  it.each(['', 'https://example.com/path?x=1', 'http://example.com'])('accepts optional safe portfolio %s and empty text fields', (portfolioUrl) => {
    const created = createSubmission({ ...valid, portfolioUrl, notes: '', sampleResume: '', interviewSchedule: '' });
    expect(readSubmissions()).toEqual([created]);
    expect(created.portfolioUrl).toBe(portfolioUrl);
  });

  const invalidOptionals = [
    ...['userId', 'status', 'notes', 'portfolioUrl', 'sampleResume', 'interviewSchedule'].flatMap((key) => [
      [key, null], [key, 42], [key, {}], [key, []], [key, undefined],
    ]),
    ['userId', ''], ['userId', ' '], ['userId', ' padded '],
    ['status', ''], ['status', 'unknown'], ['status', 'Interview'],
    ['portfolioUrl', 'javascript:alert(1)'], ['portfolioUrl', 'data:text/html,bad'],
    ['portfolioUrl', '/relative'], ['portfolioUrl', 'https://'], ['portfolioUrl', ' https://example.com '],
    ['portfolioUrl', 'ftp://example.com'],
  ];
  it.each(invalidOptionals)('rejects invalid optional %s=%j on creation without changing existing data', (key, value) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    let error;
    try {
      createSubmission({ ...valid, email: 'second@example.com', [key]: value });
    } catch (caught) {
      error = caught;
    }
    expect(error?.message).toBe('Please correct the application fields.');
    expect(error?.fieldErrors[key]).toEqual(expect.any(String));
    expect(readSubmissions()).toEqual([stored]);
    expect(persisted()).toEqual([stored]);
  });

  it.each(invalidOptionals.filter(([, value]) => value !== undefined))('resets invalid optional %s=%j in stored records', (key, value) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([{ ...extended, [key]: value }]));
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
  });

  it.each(Object.keys(stored))('still rejects a missing required %s even when demo fields are present', (key) => {
    const record = { ...extended };
    delete record[key];
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([record]));
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
  });

  it('accepts the PRD Product department for create, read and existing contact updates', () => {
    const created = createSubmission({ ...valid, department: ' Product ' });
    expect(created.department).toBe('Product');
    expect(readSubmissions()).toEqual([created]);
    const updated = updateSubmission(created.id, { ...valid, department: 'Product', fullName: 'Product Candidate' });
    expect(persisted()).toEqual([updated]);
    expect(readSubmissions()).toEqual([updated]);
    expect(updated).toMatchObject({ id: created.id, email: created.email, submittedAt: created.submittedAt });
  });

  it.each([undefined, null, 42, '', ' ', 'product', 'Legal'])('rejects missing or noncanonical department %j without weakening required fields', (department) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    expect(() => createSubmission({ ...valid, email: 'new@example.com', department })).toThrow('Please correct the application fields.');
    expect(() => updateSubmission(stored.id, { ...valid, department })).toThrow('Please correct the application fields.');
    expect(persisted()).toEqual([stored]);
  });

  it.each(['fullName', 'email', 'mobile'])('rejects invalid %s even with the new Product department', (key) => {
    expect(() => createSubmission({ ...valid, department: 'Product', [key]: '' })).toThrow('Please correct the application fields.');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBeNull();
  });

  it('accepts mixed valid legacy and extended records without normalizing or adding fields', () => {
    const records = [stored, { ...extended, id: 'second', email: 'second@example.com' }];
    const raw = JSON.stringify(records, null, 2);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(readSubmissions()).toEqual(records);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
  });
});

/** Exercise linked multi-applications and strict recruiter mutation boundaries. */
describe('recruiter record mutations', () => {
  it('round-trips linked repeated emails and preserves the exact dataset through seeding', () => {
    const first = createSubmission({ ...valid, userId: 'u-alice', status: 'applied' });
    const second = createSubmission({ ...valid, email: 'ALICE@EXAMPLE.COM', department: 'Product', userId: 'u-alice' });
    const third = createSubmission({ ...valid, department: 'Design', userId: 'u-alice' });
    const records = [first, second, third];
    expect(new Set(records.map((record) => record.id)).size).toBe(3);
    expect(validDataset(records)).toBe(true);
    expect(readSubmissions()).toEqual(records);
    const raw = JSON.stringify(records, null, 2);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    expect(seedDemoData().success).toBe(true);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
    expect(readSubmissions()).toEqual(records);
    const updated = updateSubmissionStatus(second.id, 'offer');
    expect(readSubmissions()).toEqual([first, updated, third]);
    deleteSubmission(first.id);
    expect(readSubmissions()).toEqual([updated, third]);
  });

  it('preserves the eight fixtures plus an additional linked application through seed and read', () => {
    seedDemoData();
    const alex = DEFAULT_SUBMISSIONS[0];
    const created = createSubmission({ ...alex, department: 'Product' });
    const records = [...DEFAULT_SUBMISSIONS, created];
    expect(validDataset(records)).toBe(true);
    expect(readSubmissions()).toEqual(records);
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    expect(seedDemoData().seededKeys).toEqual([]);
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
    expect(readSubmissions()).toEqual(records);
  });

  it.each([
    [undefined, undefined], ['u-alice', undefined], [undefined, 'u-alice'], ['u-alice', 'u-other'],
  ])('rejects duplicate emails for linked/unlinked ownership %s/%s in create and stored datasets', (firstUser, secondUser) => {
    const first = { ...stored, ...(firstUser ? { userId: firstUser } : {}) };
    const second = { ...stored, id: 'second', email: 'ALICE@EXAMPLE.COM', ...(secondUser ? { userId: secondUser } : {}) };
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([first]));
    expect(() => createSubmission(second)).toThrow(DUPLICATE_EMAIL_ERROR);
    expect(persisted()).toEqual([first]);
    expect(validDataset([first, second])).toBe(false);
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([first, second]));
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
  });

  it('still rejects repeated record IDs even when email and user linkage agree', () => {
    const first = { ...stored, userId: 'u-alice' };
    expect(validDataset([first, { ...first, department: 'Product' }])).toBe(false);
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([first]));
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(first.id);
    expect(() => createSubmission(first)).toThrow('unique submission identity');
    expect(persisted()).toEqual([first]);
  });

  it('updates allowed metadata while preserving immutable identity, email, time, user and current status', () => {
    const original = { ...stored, userId: 'u-alice', status: 'review', notes: 'Old notes' };
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([original]));
    const metadata = {
      notes: 'Follow up with the team', portfolioUrl: 'http://example.com/work',
      sampleResume: 'UI/UX Case Study', interviewSchedule: 'Tuesday at 10 AM Pacific',
    };
    const updated = updateSubmission(original.id, {
      ...valid, ...metadata, fullName: ' Alice Updated ', department: ' Product ',
      id: 'spoof', userId: 'spoof', email: 'spoof@example.com', submittedAt: 'invalid', status: 'archived', extra: 'ignored',
    });
    expect(updated).toEqual({ ...original, ...metadata, fullName: 'Alice Updated', department: 'Product' });
    expect(readSubmissions()).toEqual([updated]);
    expect(persisted()).toEqual([updated]);
    const cleared = updateSubmission(original.id, { ...valid, notes: '', portfolioUrl: '', sampleResume: '', interviewSchedule: '' });
    expect(readSubmissions()).toEqual([cleared]);
    expect(cleared).toMatchObject({ userId: 'u-alice', status: 'review', notes: '', portfolioUrl: '', sampleResume: '', interviewSchedule: '' });
  });

  it.each(['applied', 'review', 'interview', 'offer', 'archived'])('persists status-only %s without overwriting any other field', (status) => {
    const current = { ...DEFAULT_SUBMISSIONS[0], notes: 'Latest external notes' };
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([current]));
    expect(updateSubmissionStatus(current.id, status)).toEqual({ ...current, status });
    expect(readSubmissions()).toEqual([{ ...current, status }]);
    expect(persisted()).toEqual([{ ...current, status }]);
  });

  it.each([undefined, null, 42, {}, [], '', 'Offer', 'unknown', ' review '])('rejects status %j without mutation', (status) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    expect(() => updateSubmissionStatus(stored.id, status)).toThrow('Select a valid hiring status.');
    expect(readSubmissions()).toEqual([stored]);
    expect(persisted()).toEqual([stored]);
  });

  it.each([undefined, null, '', ' ', 42, {}, 'missing'])('rejects stale or invalid status identity %j', (id) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    expect(() => updateSubmissionStatus(id, 'offer')).toThrow('Submission not found.');
    expect(persisted()).toEqual([stored]);
  });

  const badMetadata = [
    ...['notes', 'portfolioUrl', 'sampleResume', 'interviewSchedule'].flatMap((key) => [
      [key, undefined], [key, null], [key, 42], [key, false], [key, []], [key, {}],
    ]),
    ['sampleResume', 'Unknown resume'], ['sampleResume', 'toString'],
    ['portfolioUrl', 'javascript:alert(1)'], ['portfolioUrl', 'data:text/html,bad'], ['portfolioUrl', '/relative'],
    ...Object.entries(METADATA_LIMITS).filter(([key]) => key !== 'userId').map(([key, limit]) => [key, 'x'.repeat(limit + 1)]),
  ];
  it.each(badMetadata)('rejects supplied metadata %s=%j on update, retaining all records', (key, value) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    let error;
    try { updateSubmission(stored.id, { ...valid, [key]: value }); } catch (caught) { error = caught; }
    expect(error?.fieldErrors[key]).toEqual(expect.any(String));
    expect(persisted()).toEqual([stored]);
    expect(readSubmissions()).toEqual([stored]);
  });

  it('accepts maximum notes, URL and schedule lengths but rejects the next character', () => {
    const values = { notes: 'n'.repeat(5000), interviewSchedule: 's'.repeat(500), portfolioUrl: 'https://example.com/' + 'x'.repeat(2028) };
    expect(values.portfolioUrl).toHaveLength(2048);
    expect(validateSubmissionMetadata(values)).toEqual({});
    const record = createSubmission({ ...valid, ...values });
    expect(readSubmissions()).toEqual([record]);
    for (const key of Object.keys(values)) {
      expect(validateSubmissionMetadata({ [key]: values[key] + 'x' })[key]).toEqual(expect.any(String));
    }
  });

  it('accepts every bundled label and rejects unknown labels, keeping fixture contracts aligned', () => {
    expect(Object.keys(SAMPLE_RESUMES)).toEqual([
      'Frontend Software Engineer (5 YOE)', 'Full-Stack Developer Resume (Sample)', 'UI/UX Case Study',
    ]);
    Object.keys(SAMPLE_RESUMES).forEach((sampleResume) => expect(validateSubmissionMetadata({ sampleResume })).toEqual({}));
    expect(validateSubmissionMetadata({ sampleResume: 'not bundled' }).sampleResume).toBe('Select a bundled sample resume.');
  });

  it('preserves current data on quota failures for notes and quick status, then saves on retry', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => updateSubmissionStatus(stored.id, 'offer')).toThrow('Unable to save submissions.');
    expect(() => updateSubmission(stored.id, { ...valid, notes: 'New notes' })).toThrow('Unable to save submissions.');
    expect(persisted()).toEqual([stored]);
    spy.mockRestore();
    updateSubmissionStatus(stored.id, 'offer');
    updateSubmission(stored.id, { ...valid, notes: 'New notes' });
    expect(readSubmissions()).toEqual([{ ...stored, status: 'offer', notes: 'New notes' }]);
  });

  it('never reports success when storage silently drops a write or read-back fails', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([stored]));
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    expect(() => updateSubmissionStatus(stored.id, 'offer')).toThrow('Unable to save submissions.');
    expect(() => updateSubmission(stored.id, { ...valid, notes: 'New notes' })).toThrow('Unable to save submissions.');
    expect(persisted()).toEqual([stored]);
    spy.mockRestore();
    const get = Storage.prototype.getItem;
    let reads = 0;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      reads += 1;
      if (reads === 2) throw new Error('read-back denied');
      return get.call(this, key);
    });
    expect(() => updateSubmissionStatus(stored.id, 'offer')).toThrow('Unable to save submissions.');
    expect(persisted()).toEqual([{ ...stored, status: 'offer' }]);
  });
});
