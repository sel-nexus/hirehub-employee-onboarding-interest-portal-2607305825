/** Verify management against real browser storage, including denied and failed writes. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { authenticate, logout } from '../access/accounts';
import { readDemoSubmissions, saveDemoSubmissions, DEMO_SUBMISSIONS_KEY, USERS_KEY, SESSION_KEY } from '../demo/storage';
import { validDemoSubmission } from '../demo/seed';
import { readRecruiterRecords, editRecord, updateStatus, saveNotes, deleteRecord, MOCK_INTERVIEW, DEPARTMENTS } from './recruiter';

const legacy = { id: 'public-record', fullName: 'Casey Quinn', email: 'casey@example.com', mobile: '2025550199',
  department: 'Design', submittedAt: '2026-03-01T12:00:00.000Z' };
const edits = { fullName: 'Alex Smith', mobile: '2025550198', department: 'Engineering' };
/** Requery serialized state independently of service return values. */
const persisted = () => JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY));
beforeEach(() => {
  localStorage.clear();
  authenticate('admin', 'admin', 'admin');
  readDemoSubmissions();
});
afterEach(() => vi.restoreAllMocks());

describe('recruiter services', () => {
  it('reads all submissions and combines case-insensitive name/email search with every department', () => {
    expect(readRecruiterRecords().data).toHaveLength(8);
    expect(readRecruiterRecords({ search: ' ALEX@EXAMPLE.COM ' }).data).toHaveLength(3);
    for (const department of DEPARTMENTS) {
      const result = readRecruiterRecords({ department, search: 'o' });
      expect(result.success).toBe(true);
      expect(result.data.every((record) => record.department === department
        && [record.fullName, record.email].some((value) => value.toLowerCase().includes('o')))).toBe(true);
    }
    expect(readRecruiterRecords({ search: 'absent' }).data).toEqual([]);
    expect(readRecruiterRecords({ search: 2 }).success).toBe(false);
    expect(readRecruiterRecords({ department: 'Legal' }).success).toBe(false);
    expect(persisted()).toHaveLength(8);
  });

  it.each(['signed out', 'candidate'])('denies every read/write for %s and preserves records', (role) => {
    const before = persisted();
    logout();
    if (role === 'candidate') authenticate('alex@example.com', 'password123', 'candidate');
    for (const result of [readRecruiterRecords(), editRecord('submission-1', edits), updateStatus('submission-1', 'offer'),
      saveNotes('submission-1', 'secret'), deleteRecord('submission-1')]) expect(result.success).toBe(false);
    expect(persisted()).toEqual(before);
  });

  it('denies stale sessions and storage read failures', () => {
    localStorage.setItem(SESSION_KEY, '{}');
    expect(readRecruiterRecords().success).toBe(false);
    authenticate('admin', 'admin', 'admin');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(deleteRecord('submission-1').error).toMatch(/Unable to read/);
  });

  it.each([undefined, '', 'missing'])('rejects missing IDs for all mutations (%s)', (id) => {
    const before = persisted();
    for (const result of [editRecord(id, edits), updateStatus(id, 'offer'), saveNotes(id, ''), deleteRecord(id)]) {
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ID|no longer exists/);
    }
    expect(persisted()).toEqual(before);
  });

  it('edits contacts only, retains all metadata and never changes account credentials', () => {
    const before = persisted();
    const users = localStorage.getItem(USERS_KEY);
    const result = editRecord('submission-1', { ...edits, email: 'ignored@example.com', id: 'wrong', password: 'wrong' });
    expect(result.success).toBe(true);
    expect(persisted()[0]).toEqual({ ...before[0], ...edits });
    expect(persisted().slice(1)).toEqual(before.slice(1));
    expect(localStorage.getItem(USERS_KEY)).toBe(users);
  });

  it.each([{ ...edits, fullName: '' }, { ...edits, mobile: '123' }, { ...edits, department: 'Legal' }, null])('rejects invalid edits %j', (details) => {
    const before = persisted();
    expect(editRecord('submission-1', details).success).toBe(false);
    expect(persisted()).toEqual(before);
  });

  it.each([
    ['fullName', 'Enter a name using letters and spaces (up to 100 characters).', [
      ['omitted'], ['undefined', undefined], ['null', null], ['number', 123],
      ['object', {}], ['array', ['Alex']], ['boolean', true], ['empty', ''],
      ['whitespace', '   '], ['invalid characters', 'Alex1'], ['over limit', 'A'.repeat(101)],
    ]],
    ['mobile', 'Enter a 10-digit mobile number.', [
      ['omitted'], ['undefined', undefined], ['null', null], ['number', 2025550198],
      ['object', {}], ['array', ['2025550198']], ['boolean', true], ['empty', ''],
      ['whitespace', '   '], ['below limit', '202555019'], ['above limit', '20255501988'],
      ['non-digit', '202555019x'],
    ]],
    ['department', 'Choose a valid department.', [
      ['omitted'], ['undefined', undefined], ['null', null], ['number', 1],
      ['object', {}], ['array', ['Engineering']], ['boolean', true], ['empty', ''],
      ['whitespace', '   '], ['unknown', 'Legal'], ['wrong case', 'engineering'],
      ['padded', ' Engineering '],
    ]],
  ].flatMap(([field, error, cases]) => cases.map(([kind, value]) => ({ field, error, kind, value }))))(
    'rejects $field $kind independently with a specific field error and unchanged whole storage',
    ({ field, error, kind, value }) => {
      const details = { ...edits };
      if (kind === 'omitted') delete details[field];
      else details[field] = value;
      const before = persisted();
      const storageBefore = { ...localStorage };

      const result = editRecord('submission-1', details);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Check the highlighted fields.');
      expect(result.fields).toEqual({ [field]: error });
      expect(persisted()).toEqual(before);
      expect({ ...localStorage }).toEqual(storageBefore);
    },
  );

  it.each([
    ['minimum name length', { ...edits, fullName: 'A' }],
    ['maximum name length', { ...edits, fullName: 'A'.repeat(100) }],
    ['ten digits including leading zeros', { ...edits, mobile: '0000000000' }],
    ['trimmed contacts', { ...edits, fullName: ' Alex Smith ', mobile: ' 2025550198 ' }],
  ])('persists valid contact boundary: %s without changing other rows or metadata', (_, details) => {
    const before = persisted();
    const users = localStorage.getItem(USERS_KEY);
    const session = localStorage.getItem(SESSION_KEY);
    expect(editRecord('submission-1', details).success).toBe(true);
    expect(persisted()).toEqual([
      { ...before[0], ...details, fullName: details.fullName.trim(), mobile: details.mobile.trim() },
      ...before.slice(1),
    ]);
    expect(localStorage.getItem(USERS_KEY)).toBe(users);
    expect(localStorage.getItem(SESSION_KEY)).toBe(session);
  });

  it.each(DEPARTMENTS)('persists supported department %s while preserving all other records', (department) => {
    const independentRecord = {
      ...persisted()[0],
      id: 'independent-record',
      userId: 'independent-candidate',
      email: 'independent-recruiter-test@example.com',
    };
    expect(saveDemoSubmissions([...persisted(), independentRecord]).success).toBe(true);
    const before = persisted();
    expect(editRecord(independentRecord.id, { ...edits, department }).success).toBe(true);
    expect(persisted()).toEqual([
      ...before.slice(0, -1),
      { ...independentRecord, ...edits, department },
    ]);
  });

  it('rejects candidate-department collisions and preserves full dataset', () => {
    const before = persisted();
    expect(editRecord('submission-1', { ...edits, department: 'Product' }).error).toMatch(/already/);
    expect(persisted()).toEqual(before);
  });

  it('persists all statuses while retaining the seeded interview and rejecting unknown statuses', () => {
    const schedule = persisted()[0].interview;
    for (const status of ['applied', 'review', 'interview', 'offer', 'archived']) {
      expect(updateStatus('submission-1', status).success).toBe(true);
      expect(persisted()[0]).toMatchObject({ status, interview: schedule });
    }
    const before = persisted();
    expect(updateStatus('submission-1', 'hired').success).toBe(false);
    expect(persisted()).toEqual(before);
  });

  it('adds an explicit deterministic mock schedule to unscheduled interviews without bypassing validation', () => {
    expect(persisted()[1].interview).toBeNull();
    expect(updateStatus('submission-2', 'interview').warning).toMatch(/mock schedule/);
    expect(persisted()[1].interview).toEqual(MOCK_INTERVIEW);
    expect(validDemoSubmission(persisted()[1])).toBe(true);
  });

  it('saves and clears notes, rejects wrong types/length and leaves unrelated records intact', () => {
    const before = persisted();
    expect(saveNotes('submission-1', '  Private notes\nNext step  ').success).toBe(true);
    expect(persisted()[0].notes).toBe('  Private notes\nNext step  ');
    expect(persisted().slice(1)).toEqual(before.slice(1));
    expect(saveNotes('submission-1', '').success).toBe(true);
    for (const notes of [null, 5, 'x'.repeat(10001)]) expect(saveNotes('submission-1', notes).success).toBe(false);
    expect(persisted()[0].notes).toBe('');
  });

  it('preserves six-field legacy basic edits, then promotes notes with stable anonymous identity', () => {
    saveDemoSubmissions([legacy]);
    expect(readRecruiterRecords().data[0].status).toBeUndefined();
    expect(editRecord(legacy.id, { ...edits, department: 'Design' }).success).toBe(true);
    expect(Object.keys(persisted()[0])).toHaveLength(6);
    expect(updateStatus(legacy.id, 'applied').success).toBe(true);
    expect(Object.keys(persisted()[0])).toHaveLength(6);
    expect(saveNotes(legacy.id, 'Follow up').success).toBe(true);
    expect(persisted()[0]).toMatchObject({ userId: 'anonymous-public-record', status: 'applied', notes: 'Follow up',
      resumeText: 'No resume was supplied with this public interest record.' });
    expect(validDemoSubmission(persisted()[0])).toBe(true);
    updateStatus(legacy.id, 'interview');
    expect(persisted()[0]).toMatchObject({ userId: 'anonymous-public-record', interview: MOCK_INTERVIEW });
  });

  it('maps promoted public records to a matching candidate email, without account edits', () => {
    saveDemoSubmissions([{ ...legacy, email: 'alex@example.com' }]);
    const users = localStorage.getItem(USERS_KEY);
    expect(updateStatus(legacy.id, 'review').success).toBe(true);
    expect(persisted()[0].userId).toBe('user-alex');
    expect(localStorage.getItem(USERS_KEY)).toBe(users);
  });

  it('deletes a matching record only once and preserves other rows', () => {
    const before = persisted();
    expect(deleteRecord('submission-1').success).toBe(true);
    expect(persisted()).toEqual(before.slice(1));
    expect(deleteRecord('submission-1').success).toBe(false);
  });

  it.each(['edit', 'status', 'notes', 'delete'])('reports quota failures for %s without changing serialized state', (operation) => {
    const before = persisted();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    const result = { edit: () => editRecord('submission-1', edits), status: () => updateStatus('submission-1', 'offer'),
      notes: () => saveNotes('submission-1', 'new'), delete: () => deleteRecord('submission-1') }[operation]();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unable to save/);
    expect(persisted()).toEqual(before);
  });

  it('propagates submission read failure without modifying data', () => {
    const before = persisted();
    const get = Storage.prototype.getItem;
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === DEMO_SUBMISSIONS_KEY) throw new Error('blocked');
      return get.call(this, key);
    });
    expect(readRecruiterRecords().error).toMatch(/Unable to read/);
    expect(saveNotes('submission-1', 'new').success).toBe(false);
    blocked.mockRestore();
    expect(persisted()).toEqual(before);
  });

  it.each(['notes', 'status'])('propagates a failed legacy identity lookup for %s without promoting', (operation) => {
    saveDemoSubmissions([legacy]);
    const get = Storage.prototype.getItem;
    let userReads = 0;
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      // requireRole reads accounts twice; the next read is the promotion lookup.
      if (key === USERS_KEY && ++userReads === 3) throw new Error('blocked');
      return get.call(this, key);
    });
    const result = operation === 'notes' ? saveNotes(legacy.id, 'follow up') : updateStatus(legacy.id, 'review');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unable to read/);
    blocked.mockRestore();
    expect(persisted()).toEqual([legacy]);
  });

  it('preserves empty submissions and reports failed corruption recovery explicitly', () => {
    saveDemoSubmissions([]);
    expect(readRecruiterRecords().data).toEqual([]);
    localStorage.setItem(DEMO_SUBMISSIONS_KEY, '{');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const result = readRecruiterRecords();
    expect(result.success).toBe(false);
    expect(result.warning).toMatch(/not recovered/);
    expect(localStorage.getItem(DEMO_SUBMISSIONS_KEY)).toBe('{');
  });

  it('surfaces corruption/unsafe material recovery warning and validates recovered data', () => {
    const bad = persisted();
    bad[0].portfolioUrl = 'https://user:password@example.com';
    localStorage.setItem(DEMO_SUBMISSIONS_KEY, JSON.stringify(bad));
    const result = readRecruiterRecords();
    expect(result.warning).toMatch(/Corrupted/);
    expect(result.data.every(validDemoSubmission)).toBe(true);
    expect(persisted()[0].portfolioUrl).toBe('https://example.com/portfolio/user-alex');
  });
});
