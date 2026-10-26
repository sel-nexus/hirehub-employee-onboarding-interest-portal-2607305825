/** Verify dashboard review and CRUD outcomes against the actual browser-storage helpers. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as rtlRender, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import Dashboard from './Dashboard';
import { readSubmissions, SUBMISSIONS_KEY } from '../apply/submissions';

/** Mount Dashboard with its production router contract while preserving existing CRUD tests. */
function render(ui, initialEntry = '/admin') {
  return rtlRender(
    <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {ui}
      <HistoryProbe />
    </MemoryRouter>,
  );
}

/** Expose actual router history to verify URL state and Back navigation. */
function HistoryProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">
        {location.pathname}{location.search}
      </output>
      <button type="button" onClick={() => navigate(-1)}>
        History back
      </button>
    </>
  );
}

const alice = {
  id: 'alice', fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
  department: 'Engineering', submittedAt: '2026-03-04T12:00:00.000Z',
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

beforeEach(() => localStorage.clear());
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
      '#', 'Full Name', 'Email', 'Mobile', 'Department', 'Submitted On', 'Status', 'Actions',
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

/** Verify live URL-backed filtering, materials and status mutations against real storage. */
describe('recruiter pipeline review', () => {
  const product = { ...bob, id: 'product', fullName: 'Alice Product', email: 'product@example.com', department: 'Product', status: 'offer' };

  it.each([
    [' ALICE ', '', ['alice@example.com', 'product@example.com']],
    ['BOB@EXAMPLE.COM', '', ['bob@example.com']],
    ['alice', 'Engineering', ['alice@example.com']],
    ['alice', 'Product', ['product@example.com']],
    ['alice', 'Design', []],
    ['not found', '', []],
    ['', 'Design', ['bob@example.com']],
  ])('combines name/email search %s with exact department %s', async (term, department, expectedEmails) => {
    seed([alice, bob, product]);
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    if (term) await user.type(screen.getByLabelText('Search by name or email'), term);
    await user.click(within(screen.getByRole('group', { name: 'Department filters' })).getByRole('button', { name: department || 'All departments', exact: true }));
    expectStat('Total Submissions', '3');
    expectStat('Departments', '3');
    const table = screen.queryByRole('table');
    if (expectedEmails.length) {
      const rows = within(table).getAllByRole('row').slice(1);
      expect(rows.map((row) => within(row).getAllByRole('cell')[2].textContent)).toEqual(expectedEmails);
    } else {
      expect(table).not.toBeInTheDocument();
      expect(screen.getByText('No submissions match your search and department filter.')).toBeVisible();
    }
    expect(screen.getByText(`${expectedEmails.length} of 3 submissions shown.`)).toBeVisible();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });

  it.each(['Engineering', 'Design', 'Product', 'Marketing', 'Operations'])('filters exact %s department rather than matching fragments', async (department) => {
    const matching = { ...alice, id: 'matching', department, email: 'matching@example.com' };
    seed([matching, { ...bob, department: 'Human Resources' }]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const group = within(screen.getByRole('group', { name: 'Department filters' }));
    expect(group.getAllByRole('button').map((button) => button.textContent.trim())).toEqual(['All departments', 'Engineering', 'Design', 'Product', 'Marketing', 'Operations']);
    await user.click(group.getByRole('button', { name: department, exact: true }));
    expect(group.getByRole('button', { name: department, exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('cell', { name: 'matching@example.com' })).toBeVisible();
    expect(screen.queryByRole('cell', { name: bob.email })).not.toBeInTheDocument();
    await user.click(group.getByRole('button', { name: 'All departments' }));
    expect(screen.getByRole('cell', { name: bob.email })).toBeVisible();
  });

  it('restores search/filter from URL on remount and Back without dropping unrelated parameters', async () => {
    seed([alice, bob, product]);
    const user = userEvent.setup();
    const view = render(<Dashboard onLogout={vi.fn()} />, '/admin?q=alice&department=Product&keep=1');
    expect(screen.getByLabelText('Search by name or email')).toHaveValue('alice');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('cell', { name: product.email })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Engineering', exact: true }));
    expect(screen.getByRole('cell', { name: alice.email })).toBeVisible();
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/admin?q=alice&department=Engineering&keep=1');
    await user.click(screen.getByRole('button', { name: 'History back' }));
    expect(screen.getByRole('cell', { name: product.email })).toBeVisible();
    const url = screen.getByLabelText('Current URL').textContent;
    view.unmount();
    render(<Dashboard onLogout={vi.fn()} />, url);
    expect(screen.getByLabelText('Search by name or email')).toHaveValue('alice');
    expect(screen.getByRole('button', { name: 'Product', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('cell', { name: product.email })).toBeVisible();
  });

  it('ignores a noncanonical URL department and allows clearing a search to recover results', async () => {
    seed([alice, bob]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />, '/admin?q=missing&department=engineering');
    expect(screen.getByRole('button', { name: 'All departments' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search by name or email'));
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('shows real pipeline distribution and persists all quick status choices preserving external notes', async () => {
    seed([alice, bob, product]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: `Status for ${alice.fullName}, ${alice.email}` });
    expect(Array.from(select.options).map((option) => [option.value, option.textContent.trim()])).toEqual([
      ['applied', 'Application Received'], ['review', 'Under Review'], ['interview', 'Interview Scheduled'],
      ['offer', 'Offer Extended'], ['archived', 'Archived / Not Selected'],
    ]);
    expect(within(screen.getByRole('region', { name: 'Pipeline distribution' })).getByText('Application Received').nextElementSibling).toHaveTextContent('2');
    const current = { ...alice, notes: 'Latest external notes', userId: 'u-alice' };
    seed([current, bob, product]);
    for (const status of ['review', 'interview', 'offer', 'archived', 'applied']) {
      await user.selectOptions(select, status);
      expect(select).toHaveValue(status);
      expect(readSubmissions()).toEqual([{ ...current, status }, bob, product]);
    }
    fireEvent.change(select, { target: { value: 'unknown' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Select a valid hiring status.');
    expect(readSubmissions()[0]).toEqual({ ...current, status: 'applied' });
  });

  it('keeps quick status and records unchanged on quota failure and recovers on retry', async () => {
    seed([alice]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: /Status for Alice/ });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.selectOptions(select, 'offer');
    expect(select).toHaveValue('applied');
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save submissions.');
    expect(readSubmissions()).toEqual([alice]);
    spy.mockRestore();
    await user.selectOptions(select, 'offer');
    expect(select).toHaveValue('offer');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(readSubmissions()).toEqual([{ ...alice, status: 'offer' }]);
  });

  it('reports stale quick status records and reconciles the table with Retry', async () => {
    seed([alice]);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    seed([]);
    await user.selectOptions(screen.getByRole('combobox', { name: /Status for Alice/ }), 'offer');
    expect(screen.getByRole('alert')).toHaveTextContent('Submission not found.');
    expect(readSubmissions()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Retry loading submissions' }));
    expect(screen.getByText('No submissions yet.')).toBeVisible();
  });

  it('opens bundled preview and restores its trigger without changing any records', async () => {
    const record = { ...alice, sampleResume: 'UI/UX Case Study', portfolioUrl: 'https://example.com/alice' };
    seed([record]);
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    const user = userEvent.setup();
    render(<Dashboard onLogout={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Preview resume and portfolio for Alice/ });
    await user.click(trigger);
    const dialog = within(screen.getByRole('dialog', { name: /Resume and portfolio for Alice/ }));
    expect(dialog.getByText('Research-led redesign of a candidate application journey.')).toBeVisible();
    expect(dialog.getByRole('link')).toHaveAttribute('target', '_blank');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
  });
});
