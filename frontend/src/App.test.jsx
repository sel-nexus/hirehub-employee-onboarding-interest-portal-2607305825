/** Exercise real local role routes, initialization, storage sync and recoverable logout. */
import { StrictMode } from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from './App';
import { AUTH_KEY, INVALID_CREDENTIALS, LOGOUT_STORAGE_ERROR, getSession, login } from './features/admin/auth';
import { seedMockData, USERS_KEY, SUBMISSIONS_KEY, DEFAULT_SUBMISSIONS, DATA_STORAGE_ERROR } from './features/data/mockData';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

/** Observe the router URL without mocking application routes or storage. */
function CurrentRoute() {
  const { pathname, search, hash } = useLocation();
  return (
    <output aria-label="Current route">
      {pathname}{search}{hash}
    </output>
  );
}

/** Mount the actual application within an isolated router. */
function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
      <CurrentRoute />
    </MemoryRouter>,
  );
}

/** Query the shared header separately from portal logout actions. */
function header() {
  return within(screen.getByRole('banner'));
}

/** Check both the visible recruiter gate and the public shared header. */
function expectLoginGate() {
  expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Submissions Dashboard' })).not.toBeInTheDocument();
  expect(header().getByRole('link', { name: 'Login', exact: true })).toHaveAttribute('href', '/login');
  expect(screen.queryByRole('button', { name: 'Logout', exact: true })).not.toBeInTheDocument();
}

/** Check authenticated recruiter UI without assuming new storage should be empty. */
function expectDashboard() {
  expect(screen.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Admin Login' })).not.toBeInTheDocument();
  expect(header().getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  expect(header().getByRole('link', { name: 'Recruiter Dashboard' })).toHaveAttribute('href', '/admin');
  expect(header().queryByRole('link', { name: 'Login', exact: true })).not.toBeInTheDocument();
}

/** Enter recruiter credentials through the real form. */
async function signInAdmin(user, password = 'admin') {
  await user.type(screen.getByLabelText('Username'), 'admin');
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
}

describe('App local initialization and public routes', () => {
  it.each([
    ['/', 'Build Your Future With Us'], ['/apply', 'Join Our Team'], ['/unknown', 'Build Your Future With Us'],
    ['/login', 'Candidate Login'], ['/register', 'Create Candidate Account'],
  ])('renders public route %s and seeds once without establishing a session', (route, heading) => {
    renderApp(route);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toHaveAttribute('href', '/login');
    expect(header().getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    expect(header().getByRole('link', { name: 'Apply', exact: true })).toBeVisible();
    expect(header().getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(route);
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toHaveLength(8);
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it('seeds once under StrictMode effect replay and never writes on navigation or re-render', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <MemoryRouter>
        <StrictMode>
          <App />
        </StrictMode>
      </MemoryRouter>,
    );
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toHaveLength(8);
    expect(write).toHaveBeenCalledTimes(3);
    await user.click(header().getByRole('link', { name: 'Login', exact: true }));
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    act(() => window.dispatchEvent(new Event('focus')));
    expect(write).toHaveBeenCalledTimes(3);
  });
  it('preserves deliberate empty arrays and mounts the legacy empty dashboard safely', () => {
    seedMockData();
    localStorage.setItem(SUBMISSIONS_KEY, '[]');
    login('admin', 'admin');
    renderApp('/admin');
    expectDashboard();
    expect(screen.getByText('No submissions yet.', { exact: true })).toBeVisible();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('[]');
  });
  it('keeps a valid legacy submission unchanged in the actual existing dashboard', () => {
    seedMockData();
    const { id, fullName, email, mobile, department, submittedAt } = DEFAULT_SUBMISSIONS[0];
    const raw = JSON.stringify([{ id, fullName, email, mobile, department, submittedAt }]);
    localStorage.setItem(SUBMISSIONS_KEY, raw);
    login('admin', 'admin');
    renderApp('/admin');
    expectDashboard();
    expect(screen.getByRole('cell', { name: email })).toBeVisible();
    expect(screen.getByRole('button', { name: /Edit/ })).toBeVisible();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(raw);
  });
  it('recovers corrupt data with a visible message and clears sessions for recovered users', () => {
    seedMockData();
    login('admin', 'admin');
    localStorage.setItem(USERS_KEY, '{bad');
    renderApp('/admin');
    expectLoginGate();
    expect(screen.getByText('Recovered corrupt local demo data: hirehub_users. Defaults restored.')).toHaveAttribute('role', 'status');
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toHaveLength(8);
  });
  it('shows a failed seed write and blocks legacy readers until explicit successful retry', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderApp('/admin');
    expect(screen.getByRole('heading', { name: 'Demo data unavailable' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(DATA_STORAGE_ERROR);
    expect(screen.queryByRole('heading', { name: 'Admin Login' })).not.toBeInTheDocument();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBeNull();
    write.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Retry demo initialization' }));
    expectLoginGate();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toHaveLength(8);
  });
  it('shows an unavailable storage getter and recovers when storage becomes available', async () => {
    const user = userEvent.setup();
    const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    renderApp('/login');
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent.includes(DATA_STORAGE_ERROR))).toBe(true);
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent.includes('Theme preference could not be saved or read'))).toBe(true);
    expect(screen.getByRole('heading', { name: 'Demo data unavailable' })).toBeVisible();
    getter.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Retry demo initialization' }));
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('mounts the real public application form without changing extended seeded records', () => {
    seedMockData();
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    renderApp('/apply');
    expect(screen.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
    expect(screen.getByRole('form', { name: 'Application form' })).toBeVisible();
    expect(screen.getByLabelText('Portfolio URL (optional)')).toBeVisible();
    expect(screen.getByLabelText('Sample resume (optional)')).toBeVisible();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
    expect(screen.queryByText(/awaiting candidate data integration/)).not.toBeInTheDocument();
  });
  it('saves against extended records arriving after mount, preserving all seeded fields', async () => {
    const user = userEvent.setup();
    seedMockData();
    localStorage.setItem(SUBMISSIONS_KEY, '[]');
    renderApp('/apply');
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS));
    await user.type(screen.getByLabelText('Full Name'), 'New Candidate');
    await user.type(screen.getByLabelText('Email Address'), 'new@example.com');
    await user.type(screen.getByLabelText('Mobile Number'), '4155552671');
    await user.selectOptions(screen.getByLabelText('Department of Interest'), 'Product');
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    const records = JSON.parse(localStorage.getItem(SUBMISSIONS_KEY));
    expect(records.slice(0, 8)).toEqual(DEFAULT_SUBMISSIONS);
    expect(records[8]).toEqual({
      id: expect.any(String), userId: '', fullName: 'New Candidate', email: 'new@example.com', mobile: '4155552671',
      department: 'Product', status: 'received', notes: '', portfolioUrl: '', sampleResume: '', submittedAt: expect.any(String),
    });
    expect(screen.getByRole('form')).toBeVisible();
    expect(within(screen.getByRole('form')).getByRole('status')).toHaveTextContent('Thank you! Your interest has been submitted successfully.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('allows legacy public saves on intentional empty storage without seeding over them', async () => {
    const user = userEvent.setup();
    seedMockData();
    localStorage.setItem(SUBMISSIONS_KEY, '[]');
    renderApp('/apply');
    await user.type(screen.getByLabelText('Full Name'), 'New Candidate');
    await user.type(screen.getByLabelText('Email Address'), 'new@example.com');
    await user.type(screen.getByLabelText('Mobile Number'), '4155552671');
    await user.selectOptions(screen.getByLabelText('Department of Interest'), 'Engineering');
    await user.click(screen.getByRole('button', { name: 'Submit Application' }));
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('Thank you! Your interest has been submitted successfully.');
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toEqual([expect.objectContaining({ fullName: 'New Candidate', email: 'new@example.com' })]);
  });
});

describe('App role session routing', () => {
  it.each([null, '', 'false', 'TRUE', 'True', '1', ' true', 'true ', 'true', '{}'])('keeps /admin gated for invalid stored session %j', (value) => {
    if (value !== null) localStorage.setItem(AUTH_KEY, value);
    renderApp('/admin');
    expectLoginGate();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    expect(localStorage.getItem(AUTH_KEY)).toBe(value);
  });
  it('requires local users and their matching role rather than trusting a source-shaped session', () => {
    seedMockData();
    login('admin', 'admin');
    const session = getSession();
    localStorage.setItem(AUTH_KEY, JSON.stringify({ ...session, userId: 'missing' }));
    renderApp('/admin');
    expectLoginGate();
    expect(getSession()).toBeNull();
  });
  it('restores the actual recruiter dashboard without losing extended seed fields', () => {
    seedMockData();
    login('admin', 'admin');
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    const persistedSession = localStorage.getItem(AUTH_KEY);
    renderApp('/admin');
    expectDashboard();
    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(8);
    expect(screen.queryByText(/Seeded application preview/)).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'alex@example.com' })).toBeVisible();
    expect(screen.getAllByRole('cell', { name: 'Product' })).toHaveLength(2);
    for (const cell of screen.getAllByRole('cell', { name: 'Product' })) expect(cell).toBeVisible();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
    expect(localStorage.getItem(AUTH_KEY)).toBe(persistedSession);
  });
  it('rejects invalid login then updates the dashboard and shared header after correction', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await signInAdmin(user, 'wrong');
    expectLoginGate();
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expectDashboard();
    expect(getSession()).toMatchObject({ userId: 'u-admin', role: 'admin' });
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin$/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('defaults /login to candidate and reaches the owned self-service portal', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.type(screen.getByLabelText('Email Address'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
    expect(screen.getByText('Welcome, Alex Rivera.')).toBeVisible();
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent('Interview Scheduled');
    expect(screen.getByRole('list', { name: 'Hiring progress' })).toBeVisible();
    expect(screen.getByText('alex@example.com')).toBeVisible();
    expect(screen.queryByText('jordan@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('Strong background in React and frontend architecture.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/candidate');
    expect(header().getByRole('link', { name: 'Candidate Portal' })).toHaveAttribute('href', '/candidate');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/candidate');
    expect(screen.queryByRole('heading', { name: 'Submissions Dashboard' })).not.toBeInTheDocument();
  });
  it.each(['/candidate', '/login', '/register'])('redirects an admin from %s to its own portal', (route) => {
    seedMockData();
    login('admin', 'admin');
    renderApp(route);
    expectDashboard();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin$/);
    expect(screen.queryByRole('heading', { name: 'Candidate Portal' })).not.toBeInTheDocument();
  });
  it.each(['/admin', '/login', '/register'])('redirects a candidate from %s to its own portal', (route) => {
    seedMockData();
    login('alex@example.com', 'password123', 'candidate');
    renderApp(route);
    expect(screen.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/candidate$/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('redirects unauthenticated candidate entry to unified login', () => {
    renderApp('/candidate');
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/login$/);
  });
  it('navigates through signup and creates a persistent candidate session immediately', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(header().getByRole('link', { name: 'Register' }));
    await user.type(screen.getByLabelText('Full Name'), 'New Candidate');
    await user.type(screen.getByLabelText('Email Address'), 'new@example.com');
    await user.type(screen.getByLabelText('Password', { exact: true }), 'password123');
    await user.type(screen.getByLabelText('Confirm Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(screen.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
    expect(screen.getByText('Welcome, New Candidate.')).toBeVisible();
    expect(getSession()?.role).toBe('candidate');
    expect(JSON.parse(localStorage.getItem(USERS_KEY)).at(-1)).toMatchObject({ id: getSession().userId, role: 'candidate', username: 'new@example.com' });
  });
  it.each(['banner', 'main'])('logs out via %s, clears only auth, redirects home and retains datasets', async (region) => {
    const user = userEvent.setup();
    seedMockData();
    login('admin', 'admin');
    localStorage.setItem('hirehub_theme', 'dark');
    localStorage.setItem('unrelated', 'keep');
    renderApp('/admin');
    const before = localStorage.getItem(SUBMISSIONS_KEY);
    await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true }));
    expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(localStorage.getItem('hirehub_theme')).toBe('dark');
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe(before);
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectLoginGate();
  });
  it.each(['banner', 'main'])('retains validated auth and full URL on %s logout failure and supports retry', async (region) => {
    const user = userEvent.setup();
    seedMockData();
    login('admin', 'admin');
    const session = getSession();
    renderApp('/admin?review=latest#records');
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true }));
    expectDashboard();
    expect(getSession()).toEqual(session);
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin\?review=latest#records$/);
    expect(screen.getByRole('alert')).toHaveTextContent(LOGOUT_STORAGE_ERROR);
    remove.mockRestore();
    await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true }));
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectLoginGate();
  });
  it.each(['focus', 'storage'])('revalidates session and user-role changes on %s events', (eventType) => {
    renderApp('/admin');
    expectLoginGate();
    login('admin', 'admin');
    expectLoginGate();
    act(() => window.dispatchEvent(eventType === 'storage'
      ? new StorageEvent('storage', { key: AUTH_KEY, newValue: localStorage.getItem(AUTH_KEY), storageArea: localStorage })
      : new Event('focus')));
    expectDashboard();
    const users = JSON.parse(localStorage.getItem(USERS_KEY)).filter((user) => user.id !== 'u-admin');
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    act(() => window.dispatchEvent(eventType === 'storage'
      ? new StorageEvent('storage', { key: USERS_KEY, storageArea: localStorage })
      : new Event('focus')));
    expectLoginGate();
    expect(getSession()).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin$/);
  });
  it('refreshes session on navigation without browser events and rejects corrupt sessions', async () => {
    const user = userEvent.setup();
    renderApp('/');
    login('admin', 'admin');
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectDashboard();
    localStorage.setItem(AUTH_KEY, 'true');
    await user.click(header().getByRole('link', { name: 'Apply', exact: true }));
    expect(screen.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectLoginGate();
  });
  it('fails closed and displays storage read errors after initialization', () => {
    seedMockData();
    login('admin', 'admin');
    renderApp('/admin');
    expectDashboard();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    act(() => window.dispatchEvent(new Event('focus')));
    expectLoginGate();
    expect(screen.getByRole('alert')).toHaveTextContent(DATA_STORAGE_ERROR);
  });
  it('removes listeners on route changes and unmount while replacement listeners still refresh', async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderApp('/');
    const initial = add.mock.calls.filter(([type]) => type === 'storage' || type === 'focus');
    expect(initial.map(([type]) => type).sort()).toEqual(['focus', 'storage', 'storage']);
    const themeListener = initial[0];
    const sessionListeners = initial.slice(1);
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    for (const [type, listener] of sessionListeners) expect(remove).toHaveBeenCalledWith(type, listener);
    expect(remove).not.toHaveBeenCalledWith(...themeListener);
    const replacement = add.mock.calls.filter(([type]) => type === 'storage' || type === 'focus').slice(initial.length);
    expect(replacement.map(([type]) => type).sort()).toEqual(['focus', 'storage']);
    login('admin', 'admin');
    act(() => window.dispatchEvent(new Event('focus')));
    expectDashboard();
    unmount();
    for (const [type, listener] of replacement) expect(remove).toHaveBeenCalledWith(type, listener);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith(...themeListener);
  });
});

describe('App themes and local reset', () => {
  it('applies saved theme before content and persists toggles across remount and navigation', async () => {
    localStorage.setItem('hirehub_theme', 'dark');
    const user = userEvent.setup(); const view = renderApp('/');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(header().getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(header().getByRole('button', { name: 'Switch to light theme' }));
    expect(localStorage.getItem('hirehub_theme')).toBe('light'); expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(header().getByRole('link', { name: 'Login', exact: true }));
    expect(header().getByRole('button', { name: 'Switch to dark theme' })).toHaveAttribute('aria-pressed', 'false');
    view.unmount(); renderApp('/login'); expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('shows temporary theme failure without claiming persistence and clears it on successful toggle', async () => {
    const user = userEvent.setup(); renderApp('/');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(header().getByRole('button', { name: 'Switch to dark theme' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Changes are temporary until saved');
    expect(localStorage.getItem('hirehub_theme')).toBeNull(); expect(document.documentElement.dataset.theme).toBe('dark');
    write.mockRestore(); await user.click(header().getByRole('button', { name: 'Switch to light theme' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(localStorage.getItem('hirehub_theme')).toBe('light');
  });
  it.each(['admin', 'candidate'])('resets from %s portal, clears stale records/session, retains theme and returns home', async (role) => {
    seedMockData(); login(role === 'admin' ? 'admin' : 'alex@example.com', role === 'admin' ? 'admin' : 'password123', role);
    localStorage.setItem(SUBMISSIONS_KEY, JSON.stringify(DEFAULT_SUBMISSIONS.slice(0, 1)));
    localStorage.setItem('hirehub_theme', 'dark'); localStorage.setItem('unrelated', 'keep');
    const user = userEvent.setup(); renderApp(role === 'admin' ? '/admin?search=Alex' : '/candidate');
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    expect(localStorage.getItem(AUTH_KEY)).toBeNull(); expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toEqual(DEFAULT_SUBMISSIONS);
    expect(localStorage.getItem('hirehub_theme')).toBe('dark'); expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(within(screen.getByRole('contentinfo')).getByRole('status')).toHaveTextContent('Mock data reset');
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('does not navigate or sign out on failed reset, and allows retry', async () => {
    seedMockData(); login('admin', 'admin'); const session = getSession();
    const user = userEvent.setup(); renderApp('/admin');
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin$/); expect(getSession()).toEqual(session);
    expect(within(screen.getByRole('contentinfo')).getByRole('alert')).toHaveTextContent(DATA_STORAGE_ERROR);
    expect(within(screen.getByRole('contentinfo')).getByRole('status')).toBeEmptyDOMElement();
    remove.mockRestore(); await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/); expect(getSession()).toBeNull();
  });
});
