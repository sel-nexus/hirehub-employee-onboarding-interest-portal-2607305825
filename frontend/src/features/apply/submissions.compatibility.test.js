/** Protect strict legacy validation while proving lossless CRUD on shared demo data. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createSubmission, updateSubmission, deleteSubmission, readSubmissions, SUBMISSIONS_KEY } from './submissions';
import { DEFAULT_SUBMISSIONS } from '../demo/seed';

const legacy = {
  id: 'legacy', fullName: 'Legacy Candidate', email: 'legacy@example.com', mobile: '0123456789',
  department: 'Finance', submittedAt: '2026-03-04T12:00:00.000Z',
};

beforeEach(() => localStorage.clear());

/** Requery persisted mixed data independently of the service. */
function persisted() {
  return JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
}

describe('shared legacy and demo submissions', () => {
  it('reads all validated multi-department demo records and legacy records losslessly', () => {
    const records = [legacy, ...DEFAULT_SUBMISSIONS];
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
    expect(readSubmissions()).toEqual(records);
    expect(persisted()).toEqual(records);
  });

  it('preserves every demo field after legacy create, edit and delete', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([legacy, ...DEFAULT_SUBMISSIONS]));
    const created = createSubmission({ ...legacy, email: 'new@example.com' });
    expect(Object.keys(created)).toHaveLength(6);
    expect(persisted()).toEqual([legacy, ...DEFAULT_SUBMISSIONS, created]);
    const updated = updateSubmission(legacy.id, { ...legacy, fullName: 'Updated Legacy', department: 'Data Science' });
    expect(persisted()).toEqual([updated, ...DEFAULT_SUBMISSIONS, created]);
    deleteSubmission(legacy.id);
    expect(persisted()).toEqual([...DEFAULT_SUBMISSIONS, created]);
    expect(readSubmissions()).toEqual([...DEFAULT_SUBMISSIONS, created]);
  });

  it('keeps extended immutable metadata while editing demo contacts through the old service', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS));
    const original = DEFAULT_SUBMISSIONS[0];
    const updated = updateSubmission(original.id, {
      fullName: 'Alex Updated', mobile: '9876543210', department: 'Design',
      status: 'archived', notes: 'erase', userId: 'other', interview: null, resumeText: 'erase',
      sampleResume: 'erase', portfolioUrl: 'https://example.com/erase',
    });
    expect(updated).toEqual({ ...original, fullName: 'Alex Updated', mobile: '9876543210', department: 'Design' });
    expect(readSubmissions()).toEqual([updated, ...DEFAULT_SUBMISSIONS.slice(1)]);
    expect(deleteSubmission(updated.id)).toEqual(updated);
    expect(persisted()).toEqual(DEFAULT_SUBMISSIONS.slice(1));
  });

  it('accepts Product when unchanged on an extended edit, but rejects duplicate candidate departments', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS));
    expect(updateSubmission(DEFAULT_SUBMISSIONS[1].id, DEFAULT_SUBMISSIONS[1])).toEqual(DEFAULT_SUBMISSIONS[1]);
    expect(() => updateSubmission(DEFAULT_SUBMISSIONS[0].id, { ...DEFAULT_SUBMISSIONS[0], department: 'Product' }))
      .toThrow('already has an application');
    expect(persisted()).toEqual(DEFAULT_SUBMISSIONS);
    expect(() => updateSubmission(DEFAULT_SUBMISSIONS[0].id, { ...DEFAULT_SUBMISSIONS[0], department: 'Finance' }))
      .toThrow('Please correct');
    expect(persisted()).toEqual(DEFAULT_SUBMISSIONS);
  });

  it('still rejects public duplicate emails across departments and letter case', () => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS));
    expect(() => createSubmission({ ...DEFAULT_SUBMISSIONS[0], email: ' ALEX@EXAMPLE.COM ', department: 'Design' }))
      .toThrow('This email has already been submitted.');
    expect(persisted()).toEqual(DEFAULT_SUBMISSIONS);
  });

  it.each([
    { ...DEFAULT_SUBMISSIONS[0], id: 'duplicate' },
    { ...DEFAULT_SUBMISSIONS[1], userId: 'other-user' },
    { ...legacy, email: 'alex@example.com' },
    { ...legacy, extra: 'metadata is not enough to be demo' },
    { ...DEFAULT_SUBMISSIONS[0], status: 'unknown' },
    { ...DEFAULT_SUBMISSIONS[0], sampleResume: undefined },
    { ...DEFAULT_SUBMISSIONS[0], sampleResume: '' },
    { ...DEFAULT_SUBMISSIONS[0], sampleResume: 123 },
    { ...DEFAULT_SUBMISSIONS[0], portfolioUrl: undefined },
  ])('rejects invalid duplicates or partial extended records %j without trusting a partial array', (record) => {
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify([...DEFAULT_SUBMISSIONS, record]));
    expect(readSubmissions()).toEqual([]);
    expect(persisted()).toEqual([]);
  });
});
