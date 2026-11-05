/** Verify live pipeline interactions, URL state and localStorage requery. */
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import RecruiterDashboard from './RecruiterDashboard';
import { authenticate, logout } from '../access/accounts';
import { readDemoSubmissions, DEMO_SUBMISSIONS_KEY } from '../demo/storage';

beforeEach(() => {
  localStorage.clear();
  authenticate('admin', 'admin', 'admin');
  readDemoSubmissions();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
/** Expose navigable URL state alongside the actual dashboard. */
function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">{location.search}</output>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}
/** Mount without replacing the application's single routing source. */
function mount(route = '/recruiter') {
  render(
    <MemoryRouter initialEntries={[route]}>
      <RecruiterDashboard />
      <Location />
    </MemoryRouter>,
  );
}
/** Read serialized records independently of displayed rows. */
const stored = () => JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY));

it('renders eight records with exact status labels and all five department chips', () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Recruiter Dashboard' })).toBeVisible();
  expect(screen.getByText('Welcome, Demo Administrator.')).toBeVisible();
  expect(screen.getAllByRole('combobox')).toHaveLength(8);
  for (const name of ['All', 'Engineering', 'Design', 'Product', 'Marketing', 'Operations']) {
    expect(screen.getByRole('button', { name, exact: true })).toBeVisible();
  }
  expect(screen.getByRole('combobox', { name: 'Status for Alex Morgan Engineering submission-1' })).toHaveValue('interview');
  expect(screen.getAllByRole('option', { name: 'Offer Extended' })).toHaveLength(8);
});

it('hydrates search/filter from URL, searches name/email realtime and preserves unrelated parameters', async () => {
  const user = userEvent.setup();
  mount('/recruiter?search=alex&department=Engineering&source=demo');
  expect(screen.getByLabelText('Search name or email')).toHaveValue('alex');
  expect(screen.getAllByRole('combobox')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'All', exact: true }));
  expect(screen.getAllByRole('combobox')).toHaveLength(3);
  await user.clear(screen.getByLabelText('Search name or email'));
  await user.type(screen.getByLabelText('Search name or email'), 'JORDAN@EXAMPLE.COM');
  expect(screen.getAllByRole('combobox')).toHaveLength(3);
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('source=demo');
  await user.click(screen.getByRole('button', { name: 'Engineering', exact: true }));
  expect(screen.getByText('No applications match this view.')).toBeVisible();
  await user.click(screen.getByText('Back'));
  expect(screen.getAllByRole('combobox')).toHaveLength(3);
  expect(stored()).toHaveLength(8);
});

it('filters each department and handles empty data and invalid URL filters without crashing', async () => {
  const user = userEvent.setup();
  mount();
  for (const department of ['Engineering', 'Design', 'Product', 'Marketing', 'Operations']) {
    await user.click(screen.getByRole('button', { name: department, exact: true }));
    expect(screen.getAllByRole('combobox')).toHaveLength(stored().filter((record) => record.department === department).length);
  }
  cleanup();
  mount('/recruiter?department=Legal');
  expect(screen.getByRole('alert')).toHaveTextContent(/valid search and department/);
  await user.click(screen.getByText('Show all departments'));
  expect(screen.getAllByRole('combobox')).toHaveLength(8);
  localStorage.setItem(DEMO_SUBMISSIONS_KEY, '[]');
  act(() => window.dispatchEvent(new Event('storage')));
  expect(screen.getByText('No applications match this view.')).toBeVisible();
});

it('updates Alex to offer and persists the seeded schedule; quota failure retains saved status', async () => {
  const user = userEvent.setup();
  mount();
  const status = screen.getByRole('combobox', { name: 'Status for Alex Morgan Engineering submission-1' });
  await user.selectOptions(status, 'offer');
  expect(stored()[0]).toMatchObject({ status: 'offer', interview: { date: '2026-04-15' } });
  const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await user.selectOptions(status, 'review');
  expect(screen.getByText(/Unable to save demo/)).toBeVisible();
  expect(status).toHaveValue('offer');
  expect(stored()[0].status).toBe('offer');
  quota.mockRestore();
});

it('labels deterministic mock schedule when promoting an unscheduled record', async () => {
  const user = userEvent.setup();
  mount();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Status for Alex Morgan Product submission-2' }), 'interview');
  expect(screen.getByText(/deterministic mock schedule was added/)).toBeVisible();
  expect(stored()[1].interview.location).toMatch(/Mock schedule/);
});

it('edits, saves notes, previews materials and cancels then confirms deletion via real dialogs', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole('button', { name: 'edit Alex Morgan Engineering submission-1' }));
  await user.clear(screen.getByLabelText('Full name'));
  await user.type(screen.getByLabelText('Full name'), 'Alex Smith');
  await user.click(screen.getByText('Save changes'));
  expect(stored()[0].fullName).toBe('Alex Smith');
  await user.click(screen.getByRole('button', { name: 'notes Alex Smith Engineering submission-1' }));
  await user.clear(screen.getByLabelText('Internal notes'));
  await user.type(screen.getByLabelText('Internal notes'), 'Excellent demo');
  await user.click(screen.getByText('Save changes'));
  expect(stored()[0].notes).toBe('Excellent demo');
  const materials = screen.getByRole('button', { name: 'materials Alex Smith Engineering submission-1' });
  await user.click(materials);
  expect(screen.getByRole('dialog')).toHaveAccessibleName(/Application materials/);
  expect(screen.getByRole('link')).toHaveAttribute('href', stored()[0].portfolioUrl);
  await user.keyboard('{Escape}');
  expect(materials).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'delete Alex Smith Engineering submission-1' }));
  await user.click(screen.getByText('Cancel'));
  expect(stored()).toHaveLength(8);
  await user.click(screen.getByRole('button', { name: 'delete Alex Smith Engineering submission-1' }));
  await user.click(screen.getByText('Confirm delete'));
  expect(stored()).toHaveLength(7);
  expect(screen.queryByRole('combobox', { name: /submission-1$/ })).not.toBeInTheDocument();
});

it('shows legacy records as Applied and promotes lifecycle updates with explanatory materials', async () => {
  const user = userEvent.setup();
  localStorage.setItem(DEMO_SUBMISSIONS_KEY, JSON.stringify([{ id: 'legacy', fullName: 'Casey Quinn',
    email: 'casey@example.com', mobile: '2025550199', department: 'Design', submittedAt: '2026-03-01T12:00:00.000Z' }]));
  mount();
  expect(screen.getByRole('combobox')).toHaveValue('applied');
  await user.selectOptions(screen.getByRole('combobox'), 'review');
  expect(stored()[0]).toMatchObject({ status: 'review', userId: 'anonymous-legacy' });
});

it('fails closed for unauthorized roles and supports recovery from storage read failure', async () => {
  const user = userEvent.setup();
  logout();
  mount();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(/log in/);
  cleanup();
  authenticate('admin', 'admin', 'admin');
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  mount();
  expect(screen.getByRole('alert')).toHaveTextContent(/Unable to read/);
  read.mockRestore();
  await user.click(screen.getByText('Retry'));
  expect(screen.getAllByRole('combobox')).toHaveLength(8);
});
