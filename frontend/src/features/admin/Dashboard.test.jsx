/** Verify dashboard review and CRUD outcomes against the actual browser-storage helpers. */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as rtlRender, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_USERS, USERS_KEY } from '../data/mockData';
import { AUTH_KEY, login } from './auth';
import { withRecruiterDefaults } from './recruiterService';

/** Render the standalone dashboard with the application router contract. */
function render(ui, options) {
  return rtlRender(<MemoryRouter>{ui}</MemoryRouter>, options);
}
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard';
import { readSubmissions, SUBMISSIONS_KEY } from '../apply/submissions';

const alice = {
  id: 'alice', fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
  department: 'Engineering', submittedAt: '2026-03-04T12:00:00.000Z',
  ...withRecruiterDefaults({}),
};
const bob = {
  ...alice, id: 'bob', fullName: 'Bob Jones', email: 'bob@example.com',
  department: 'Design', submittedAt: '2026-02-02T12:00:00.000Z',
};

/** Seed canonical records without replacing application persistence behavior. */
function seed(records = [alice]) {
  localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(records));
}

/** Assert the value associated with a summary label. */
function expectStat(label, value) {
  expect(screen.getByText(label).nextElementSibling).toHaveTextContent(value);
}

/** Open Alice's editor through its disambiguated row action. */
async function openEditor(user) {
  await user.click(screen.getByRole('button', { name: 'Edit submission for Alice Smith, alice@example.com' }));
  return within(screen.getByRole('dialog', { name: 'Edit Submission' }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  expect(login('admin', 'admin').success).toBe(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Dashboard', () => {
  it('renders exact title, all details, scoped headers and accurate unsorted summary', () => {
    seed([alice, bob, { ...bob, id: 'third', email: 'third@example.com' }]);
    render(<Dashboard onLogout={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Submissions Dashboard' })).toBeVisible();
    expectStat('Total Submissions', '3');
    expectStat('Departments', '2');
    expectStat('Latest Submission', 'Mar 4, 2026');
    const columns = screen.getAllByRole('columnheader');
    expect(columns.map((cell) => cell.textContent.trim())).toEqual([
      '#', 'Full Name', 'Email', 'Mobile', 'Department', 'Submitted On', 'Stage', 'Actions',
    ]);
    columns.forEach((cell) => expect(cell).toHaveAttribute('scope', 'col'));
    expect(screen.getByRole('region', { name: 'Submissions table, scroll horizontally' })).toHaveAttribute('tabindex', '0');
    const row = within(screen.getAllByRole('row')[1]);
    for (const value of ['1', alice.fullName, alice.email, alice.mobile, alice.department, 'Mar 4, 2026']) {
      expect(row.getByRole('cell', { name: value, exact: true })).toBeVisible();
    }
    expect(row.getByRole('button', { name: /Delete submission for Alice Smith, alice@example.com/ })).toBeVisible();
  });

  it.each([null, '{broken', JSON.stringify({ unexpected: true })])('shows safe empty summary for absent/corrupt data %s', (raw) => {
    if (raw !== null) localStorage.setItem(SUBMISSIONS_KEY, raw);
    render(<Dashboard onLogout={vi.fn()} />);
    expect(screen.getByText('No submissions yet.')).toBeVisible();
    expectStat('Total Submissions', '0');
    expectStat('Departments', '0');
    expectStat('Latest Submission', 'N/A');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(readSubmissions()).toEqual([]);
    if (raw !== null) expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('[]');
  });

  it('reviews 200 records without relying on ordering for the maximum timestamp', () => {
    const records = Array.from({ length: 200 }, (_, index) => ({
      ...alice, id: `record-${index}`, email: `candidate${index}@example.com`,
      department: index % 2 ? 'Design' : 'Engineering', submittedAt: bob.submittedAt,
    }));
    records[47].submittedAt = '2027-12-25T12:00:00.000Z';
    seed(records);
    render(<Dashboard onLogout={vi.fn()} />);
    expectStat('Total Submissions', '200');
    expectStat('Departments', '2');
    expectStat('Latest Submission', 'Dec 25, 2027');
    expect(screen.getAllByRole('row')).toHaveLength(201);
    expect(within(screen.getAllByRole('row')[200]).getByRole('cell', { name: '200', exact: true })).toBeVisible();
  });

  it('shows actionable read errors rather than false empty data and retries fresh storage', async () => {
    seed();
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to read submissions. Check browser storage permissions');
    expect(screen.queryByText('No submissions yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('Total Submissions')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry loading submissions' }));
    expect(screen.getByRole('alert')).toBeVisible();
    spy.mockRestore();
    seed([alice, bob]);
    await user.click(screen.getByRole('button', { name: 'Retry loading submissions' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectStat('Total Submissions', '2');
    expect(screen.getByText(bob.email)).toBeVisible();
  });

  it('shows failed corruption reset and recovers with retry', async () => {
    localStorage.setItem(SUBMISSIONS_KEY, '{bad');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(screen.queryByText('No submissions yet.')).not.toBeInTheDocument();
    spy.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Retry loading submissions' }));
    expect(screen.getByText('No submissions yet.')).toBeVisible();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('[]');
  });

  it('prefills the editor and saves permitted changes then requeries table and summaries', async () => {
    seed([alice, bob]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const dialog = await openEditor(user);
    expect(dialog.getByLabelText('Full Name')).toHaveValue(alice.fullName);
    expect(dialog.getByLabelText('Email Address')).toHaveAttribute('readonly');
    await user.clear(dialog.getByLabelText('Full Name'));
    await user.type(dialog.getByLabelText('Full Name'), ' Alice Updated ');
    await user.clear(dialog.getByLabelText('Mobile Number'));
    await user.type(dialog.getByLabelText('Mobile Number'), '9876543210');
    await user.selectOptions(dialog.getByLabelText('Department of Interest'), 'Design');
    // A concurrent valid record proves the dashboard requeries rather than replacing its cached row.
    seed([alice, bob, { ...bob, id: 'new', email: 'new@example.com' }]);
    await user.click(dialog.getByRole('button', { name: 'Save Changes' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Alice Updated')).toBeVisible();
    expect(screen.getByText('9876543210')).toBeVisible();
    expectStat('Total Submissions', '3');
    expectStat('Departments', '1');
    expectStat('Latest Submission', 'Mar 4, 2026');
    expect(readSubmissions()[0]).toEqual({ ...alice, fullName: 'Alice Updated', mobile: '9876543210', department: 'Design' });
  });

  it('cancels edited input without writing and restores the row trigger focus', async () => {
    seed();
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Edit submission for Alice/ });
    const dialog = await openEditor(user);
    await user.clear(dialog.getByLabelText('Full Name'));
    await user.type(dialog.getByLabelText('Full Name'), 'Unsaved Name');
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeVisible();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
    expect(trigger).toHaveFocus();
  });

  it('preserves edits and table after write failure and saves on retry', async () => {
    seed();
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const dialog = await openEditor(user);
    await user.clear(dialog.getByLabelText('Full Name'));
    await user.type(dialog.getByLabelText('Full Name'), 'Changed Name');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(dialog.getByRole('button', { name: 'Save Changes' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(dialog.getByLabelText('Full Name')).toHaveValue('Changed Name');
    expect(screen.getByRole('cell', { name: 'Alice Smith' })).toBeVisible();
    expect(readSubmissions()).toEqual([alice]);
    spy.mockRestore();
    await user.click(dialog.getByRole('button', { name: 'Save Changes' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(readSubmissions()[0].fullName).toBe('Changed Name');
  });

  it('keeps the editor actionable if the selected ID was removed externally', async () => {
    seed();
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const dialog = await openEditor(user);
    seed([]);
    await user.click(dialog.getByRole('button', { name: 'Save Changes' }));
    expect(dialog.getByRole('alert')).toHaveTextContent('Submission not found.');
    expect(dialog.getByLabelText('Full Name')).toHaveValue(alice.fullName);
    expect(readSubmissions()).toEqual([]);
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retains data when delete confirmation is cancelled', async () => {
    seed();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Delete submission for Alice/ }));
    expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete this submission?');
    expect(screen.getByText(alice.email)).toBeVisible();
    expectStat('Total Submissions', '1');
    expect(readSubmissions()).toEqual([alice]);
  });

  it('confirms deletion and immediately displays persisted empty state', async () => {
    seed();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /Delete submission for Alice/ }));
    expect(screen.getByText('No submissions yet.')).toBeVisible();
    expectStat('Total Submissions', '0');
    expectStat('Departments', '0');
    expectStat('Latest Submission', 'N/A');
    expect(readSubmissions()).toEqual([]);
  });

  it('does not falsely remove a row after failed delete write and allows recovery', async () => {
    seed();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(screen.getByRole('button', { name: /Delete submission for Alice/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(screen.getByText(alice.email)).toBeVisible();
    expectStat('Total Submissions', '1');
    expect(readSubmissions()).toEqual([alice]);
    spy.mockRestore();
    await user.click(screen.getByRole('button', { name: /Delete submission for Alice/ }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('No submissions yet.')).toBeVisible();
    expect(readSubmissions()).toEqual([]);
  });

  it('surfaces missing-ID delete errors and retry reconciles external changes', async () => {
    seed();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    seed([]);
    await user.click(screen.getByRole('button', { name: /Delete submission for Alice/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Submission not found.');
    expect(screen.getByText(alice.email)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry loading submissions' }));
    expect(screen.getByText('No submissions yet.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['Engineering', 'Design', 'Product', 'Marketing', 'Operations'])('combines live name/email search with %s and stage filters', async (department) => {
    const selected = { ...alice, department, status: 'review' };
    seed([selected, { ...bob, department, status: 'offer' }]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: department, exact: true }));
    expect(screen.getByRole('button', { name: department, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await user.selectOptions(screen.getByLabelText('Filter by stage'), 'review');
    expect(screen.getByText(alice.email)).toBeVisible();
    expect(screen.queryByText(bob.email)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Search candidate name or email'), 'ALICE@EXAMPLE');
    expect(screen.getByText(alice.email)).toBeVisible();
    await user.clear(screen.getByLabelText('Search candidate name or email'));
    await user.type(screen.getByLabelText('Search candidate name or email'), 'smith');
    expect(screen.getByText(alice.email)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'All', exact: true }));
    expect(screen.getByText(alice.email)).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Filter by stage'), 'offer');
    expect(screen.getByText('No submissions match your filters.')).toBeVisible();
    expect(screen.queryByText('No submissions yet.')).not.toBeInTheDocument();
    expectStat('Total Submissions', '2');
    expect(readSubmissions()).toEqual([selected, { ...bob, department, status: 'offer' }]);
  });

  it('restores URL-backed search/filter combinations through Back and remount', async () => {
    seed([alice, bob]);
    const user = userEvent.setup();
    /** Expose browser history controls and location without mocking router hooks. */
    function RouterHarness() {
      const location = useLocation();
      const navigate = useNavigate();
      const [mounted, setMounted] = useState(true);
      return (
        <>
          <output aria-label="Current URL">{location.search}</output>
          <button type="button" onClick={() => navigate(-1)}>Back</button>
          <button type="button" onClick={() => setMounted((current) => !current)}>Toggle dashboard</button>
          {mounted && <Dashboard onLogout={vi.fn()} />}
        </>
      );
    }
    rtlRender(
      <MemoryRouter initialEntries={['/admin?search=alice&department=Engineering&status=received&keep=yes']}>
        <RouterHarness />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Search candidate name or email')).toHaveValue('alice');
    expect(screen.getByLabelText('Filter by stage')).toHaveValue('received');
    expect(screen.queryByText(bob.email)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Design', exact: true }));
    expect(screen.getByText('No submissions match your filters.')).toBeVisible();
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('keep=yes');
    await user.click(screen.getByRole('button', { name: 'Back', exact: true }));
    expect(screen.getByRole('button', { name: 'Engineering', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(alice.email)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Toggle dashboard' }));
    await user.click(screen.getByRole('button', { name: 'Toggle dashboard' }));
    expect(screen.getByLabelText('Search candidate name or email')).toHaveValue('alice');
    expect(screen.getByText(alice.email)).toBeVisible();
  });

  it('saves quick stages using unique labels and latest metadata, updates badges, and obeys the active stage filter', async () => {
    seed([alice, bob]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const control = screen.getByLabelText('Change stage for Alice Smith, alice@example.com, alice');
    await user.selectOptions(screen.getByLabelText('Filter by stage'), 'received');
    seed([{ ...alice, notes: 'Concurrent note', mobile: '9876543210' }, bob]);
    await user.selectOptions(control, 'review');
    expect(screen.queryByText(alice.email)).not.toBeInTheDocument();
    expect(readSubmissions()[0]).toEqual({ ...alice, notes: 'Concurrent note', mobile: '9876543210', status: 'review' });
    await user.selectOptions(screen.getByLabelText('Filter by stage'), 'review');
    expect(screen.getByLabelText('Change stage for Alice Smith, alice@example.com, alice')).toHaveValue('review');
    expect(screen.getByText('Stage saved for Alice Smith.')).toBeVisible();
    const row = screen.getByRole('row', { name: /Alice Smith/ });
    expect(within(row).getByRole('status')).toHaveTextContent('Under Review');
  });

  it('retains the previous quick stage on failure, shows no false success, and saves on retry', async () => {
    seed();
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const control = screen.getByLabelText('Change stage for Alice Smith, alice@example.com, alice');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.selectOptions(control, 'review');
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions');
    expect(control).toHaveValue('received');
    expect(screen.queryByText(/Stage saved for/)).not.toBeInTheDocument();
    expect(readSubmissions()).toEqual([alice]);
    spy.mockRestore();
    await user.selectOptions(control, 'review');
    expect(control).toHaveValue('review');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readSubmissions()[0].status).toBe('review');
  });

  it('does not show quick-stage success if the verification read fails after the write and reconciles on retry', async () => {
    seed();
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const control = screen.getByLabelText('Change stage for Alice Smith, alice@example.com, alice');
    const original = Storage.prototype.getItem;
    let reads = 0;
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (key === SUBMISSIONS_KEY && ++reads === 2) throw new Error('denied');
      return original.call(this, key);
    });
    await user.selectOptions(control, 'review');
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to read submissions');
    expect(screen.queryByText(/Stage saved for/)).not.toBeInTheDocument();
    expect(control).toHaveValue('received');
    spy.mockRestore();
    expect(readSubmissions()[0].status).toBe('review');
    await user.click(screen.getByRole('button', { name: 'Retry loading submissions' }));
    expect(control).toHaveValue('review');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('enforces fresh admin authorization before quick status and confirmed legacy delete', async () => {
    seed();
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    localStorage.removeItem(AUTH_KEY);
    await user.selectOptions(screen.getByLabelText('Change stage for Alice Smith, alice@example.com, alice'), 'review');
    expect(screen.getByRole('alert')).toHaveTextContent('Administrator access');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /Delete submission for Alice/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Administrator access');
    expect(readSubmissions()).toEqual([alice]);
  });

  it('opens local review, saves internal notes and restores the row trigger on close', async () => {
    seed([{ ...alice, sampleResume: 'UI/UX Case Study' }]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Review submission for Alice/ });
    await user.click(trigger);
    const dialog = within(screen.getByRole('dialog', { name: 'Review Submission' }));
    await user.click(dialog.getByRole('button', { name: 'Preview Resume' }));
    expect(dialog.getByRole('article')).toHaveTextContent('Journey mapping');
    await user.type(dialog.getByLabelText('Internal Recruiter Notes'), 'Internal only');
    await user.click(dialog.getByRole('button', { name: 'Save Notes' }));
    expect(readSubmissions()[0].notes).toBe('Internal only');
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('delegates Logout to the shared handler without altering submission storage', async () => {
    seed();
    const onLogout = vi.fn();
    const user = userEvent.setup();
    render(<Dashboard onLogout={onLogout} />);
    await user.click(screen.getByRole('button', { name: 'Logout', exact: true }));
    expect(onLogout).toHaveBeenCalledOnce();
    expect(readSubmissions()).toEqual([alice]);
  });
});
