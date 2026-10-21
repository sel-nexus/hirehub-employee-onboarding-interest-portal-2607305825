/** Verify persisted CRUD outcomes, corruption recovery, schema integrity, and browser failures. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSubmission, deleteSubmission, DUPLICATE_EMAIL_ERROR, readSubmissions, SUBMISSIONS_KEY, updateSubmission,
} from './submissions';

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
