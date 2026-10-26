/** Exercise real routes, persistent role identity, demo initialization and reset. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from './App';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { DEFAULT_SUBMISSIONS, DEFAULT_USERS, DEFAULT_DEPARTMENTS, USERS_KEY, DEPARTMENTS_KEY, SESSION_KEY } from './features/demo/mockData';
import { AUTH_KEY, INVALID_CREDENTIALS, LOGOUT_STORAGE_ERROR, login, readSession } from './features/admin/auth';

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); localStorage.clear(); });

/** Persist a real stored-account session for lifecycle regression tests. */
function authenticate(username = 'admin', password = 'admin', role = 'admin') {
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  expect(login(username, password, role).success).toBe(true);
}

/** Observe full URLs without replacing application navigation. */
function CurrentRoute() {
  const { pathname, search, hash } = useLocation();
  return (
    <output aria-label="Current route">{pathname}{search}{hash}</output>
  );
}

/** Mount the real app inside an isolated router. */
function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
      <CurrentRoute />
    </MemoryRouter>,
  );
}

/** Query shared navigation independently of dashboard actions. */
function header() { return within(screen.getByRole('banner')); }

/** Assert both the guest gate and header state. */
function expectLoginGate() {
  expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Submissions Dashboard' })).not.toBeInTheDocument();
  expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Logout', exact: true })).not.toBeInTheDocument();
}

/** Assert seeded recruiter content and authenticated navigation. */
function expectDashboard() {
  expect(screen.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  expect(screen.getByText('Alex Rivera', { exact: true })).toBeVisible();
  expect(screen.getAllByRole('row')).toHaveLength(9);
  expect(screen.queryByText('No submissions yet.', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Admin Login' })).not.toBeInTheDocument();
  expect(header().getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  expect(header().queryByRole('link', { name: 'Login', exact: true })).not.toBeInTheDocument();
}

/** Assert the complete candidate entry without exposing recruiter records. */
function expectCandidate(name = 'Alex Rivera') {
  expect(screen.getByRole('heading', { name: 'Candidate portal', exact: true })).toBeVisible();
  expect(screen.getByText(`Welcome, ${name}.`)).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Contact profile' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Your applications' })).toBeVisible();
  if (name === 'Alex Rivera') {
    expect(within(screen.getByRole('article')).getByRole('status')).toHaveTextContent('Current status: Interview Scheduled');
    expect(screen.getByRole('heading', { name: 'Engineering application' })).toBeVisible();
    expect(screen.queryByText('jordan@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText(/Strong background in React/)).not.toBeInTheDocument();
  } else {
    expect(screen.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  }
  expect(screen.getByRole('link', { name: 'Submit an application' })).toHaveAttribute('href', '/apply');
  expect(screen.queryByRole('heading', { name: 'Submissions Dashboard' })).not.toBeInTheDocument();
  expect(header().queryByRole('link', { name: 'Admin', exact: true })).not.toBeInTheDocument();
  expect(header().getByRole('button', { name: 'Logout' })).toBeVisible();
}

describe('App session routing', () => {
  it.each([['/', 'Build Your Future With Us'], ['/apply', 'Join Our Team'], ['/unknown', 'Build Your Future With Us']])(
    'renders public %s without a session', (route, heading) => {
      renderApp(route);
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
      expect(screen.getByLabelText('Current route')).toHaveTextContent(route);
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    },
  );
  it.each([null, '', 'false', 'TRUE', 'True', '1', ' true', 'true ', 'true', '{}', '{bad'])('keeps /admin gated for invalid session %j', (value) => {
    if (value !== null) localStorage.setItem(SESSION_KEY, value);
    renderApp('/admin'); expectLoginGate();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    expect(localStorage.getItem(SESSION_KEY)).toBe(value);
  });
  it('restores dashboard/header only for a validated stored admin identity, ignoring legacy auth', () => {
    sessionStorage.setItem(AUTH_KEY, 'true'); renderApp('/admin'); expectLoginGate(); cleanup();
    authenticate(); const session = readSession(); renderApp('/admin'); expectDashboard();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin'); expect(readSession()).toEqual(session);
  });
  it('rejects invalid login then synchronizes dashboard and header after correction', async () => {
    const user = userEvent.setup(); renderApp('/admin');
    await user.type(screen.getByLabelText('Username'), 'admin'); await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true })); expectLoginGate();
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    await user.clear(screen.getByLabelText('Password')); await user.type(screen.getByLabelText('Password'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true })); expectDashboard();
    expect(readSession().userId).toBe('u-admin'); expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it.each(['banner', 'main'])('logs out through %s, preserves data and returns home', async (region) => {
    const user = userEvent.setup(); authenticate(); localStorage.setItem('unrelated-session', 'preserve'); renderApp('/admin');
    const records = localStorage.getItem('hirehub_submissions'); const accounts = localStorage.getItem(USERS_KEY);
    await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true }));
    expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/); expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem('unrelated-session')).toBe('preserve'); expect(localStorage.getItem('hirehub_submissions')).toBe(records);
    expect(localStorage.getItem(USERS_KEY)).toBe(accounts); expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true })); expectLoginGate();
  });
  it.each(['banner', 'main'])('retains auth and full URL when %s logout fails then retries', async (region) => {
    const user = userEvent.setup(); authenticate(); const session = readSession(); renderApp('/admin?review=latest#records');
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true })); expectDashboard();
    expect(readSession()).toEqual(session); expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin\?review=latest#records$/);
    expect(screen.getByRole('alert')).toHaveTextContent(LOGOUT_STORAGE_ERROR); expect(screen.getByRole('alert')).toHaveTextContent('try Logout again');
    remove.mockRestore(); await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true }));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true })); expectLoginGate();
  });
  it.each(['focus', 'storage'])('refreshes changed auth on %s without navigation', (eventType) => {
    renderApp('/admin'); expectLoginGate(); authenticate(); expectLoginGate();
    act(() => window.dispatchEvent(eventType === 'storage'
      ? new StorageEvent('storage', { key: SESSION_KEY, newValue: localStorage.getItem(SESSION_KEY), storageArea: localStorage }) : new Event('focus')));
    expectDashboard(); localStorage.removeItem(SESSION_KEY); expectDashboard();
    act(() => window.dispatchEvent(eventType === 'storage'
      ? new StorageEvent('storage', { key: SESSION_KEY, oldValue: 'identity', newValue: null, storageArea: localStorage }) : new Event('focus')));
    expectLoginGate(); expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin$/);
  });
  it('refreshes external session changes on navigation without browser events', async () => {
    const user = userEvent.setup(); renderApp('/'); authenticate();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true })); expectDashboard();
    localStorage.removeItem(SESSION_KEY); await user.click(header().getByRole('link', { name: 'Apply', exact: true }));
    expect(screen.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true })); expectLoginGate();
  });
  it('removes session listeners on route changes and unmount while replacements still refresh', async () => {
    const user = userEvent.setup(); const add = vi.spyOn(window, 'addEventListener'); const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderApp('/'); const initial = add.mock.calls.filter(([type]) => type === 'storage' || type === 'focus');
    const sessionListener = initial.find(([type]) => type === 'focus')[1];
    const sessionInitial = initial.filter(([, listener]) => listener === sessionListener);
    expect(sessionInitial.map(([type]) => type).sort()).toEqual(['focus', 'storage']);
    await user.click(header().getByRole('link', { name: 'Admin', exact: true })); expectLoginGate();
    for (const [type, listener] of sessionInitial) expect(remove).toHaveBeenCalledWith(type, listener);
    const replacements = add.mock.calls.filter(([type]) => type === 'storage' || type === 'focus').slice(initial.length);
    expect(replacements.map(([type]) => type).sort()).toEqual(['focus', 'storage']);
    authenticate(); act(() => window.dispatchEvent(new Event('focus'))); expectDashboard(); unmount();
    for (const [type, listener] of [...initial, ...replacements]) expect(remove).toHaveBeenCalledWith(type, listener);
    expect(screen.queryByRole('banner')).not.toBeInTheDocument(); expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
  it('shows default candidate login from header and routes candidate login to its entry', async () => {
    const user = userEvent.setup(); renderApp('/');
    expect(header().getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/register');
    await user.click(header().getByRole('link', { name: 'Login', exact: true }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/login$/);
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    await user.type(screen.getByLabelText('Username'), 'alex@example.com'); await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true })); expectCandidate();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/candidate$/);
  });
  it('routes a guest candidate tab login from /admin to only their own candidate records', async () => {
    const user = userEvent.setup(); renderApp('/admin'); expectLoginGate();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin$/);
    await user.click(screen.getByRole('tab', { name: 'Candidate', exact: true }));
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    await user.type(screen.getByLabelText('Username'), 'alex@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expectCandidate();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/candidate$/);
    expect(readSession()).toMatchObject({ userId: 'u-201', role: 'candidate', displayName: 'Alex Rivera' });
    const ownRecords = DEFAULT_SUBMISSIONS.filter((record) => record.userId === 'u-201');
    const applications = screen.getAllByRole('article');
    expect(ownRecords.length).toBeGreaterThan(0);
    expect(applications).toHaveLength(ownRecords.length);
    ownRecords.forEach((record, index) => expect(applications[index]).toHaveTextContent(record.id));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('routes recruiter tab login from /login to /admin', async () => {
    const user = userEvent.setup(); renderApp('/login');
    await user.click(screen.getByRole('tab', { name: 'Administrator / Recruiter' }));
    await user.type(screen.getByLabelText('Username'), 'recruiter@hirehub.demo'); await user.type(screen.getByLabelText('Password'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true })); expectDashboard();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin$/); expect(readSession().userId).toBe('u-recruiter');
  });
  it('creates a candidate from /register and persists entry across remount then logout', async () => {
    const user = userEvent.setup(); renderApp('/'); await user.click(header().getByRole('link', { name: 'Register' }));
    await user.type(screen.getByLabelText('Full Name'), 'New Candidate'); await user.type(screen.getByLabelText('Email Address'), 'new@example.com');
    await user.type(screen.getByLabelText('Mobile Number'), '0123456789'); await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' })); expectCandidate('New Candidate');
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/candidate$/); const session = readSession();
    cleanup(); sessionStorage.clear(); renderApp('/candidate'); expectCandidate('New Candidate'); expect(readSession()).toEqual(session);
    await user.click(header().getByRole('button', { name: 'Logout' })); expect(readSession()).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toHaveLength(6);
  });
  it('gates guest candidate entry with candidate login', () => {
    renderApp('/candidate'); expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    expect(screen.queryByText(/Welcome,/)).not.toBeInTheDocument();
  });
  it('denies candidate recruiter access via a real link and lets them return to their portal', async () => {
    const user = userEvent.setup(); authenticate('alex@example.com', 'password123', 'candidate'); renderApp('/candidate'); expectCandidate();
    await user.click(screen.getByRole('link', { name: 'Recruiter access' }));
    expect(screen.getByRole('heading', { name: 'Recruiter access only' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Submissions Dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Return to Candidate portal' })); expectCandidate();
  });
  it('denies recruiter candidate entry and links back to their dashboard', async () => {
    const user = userEvent.setup(); authenticate(); renderApp('/admin');
    await user.click(header().getByRole('link', { name: 'Candidate portal' }));
    expect(screen.getByRole('heading', { name: 'Candidate access only' })).toBeVisible();
    expect(screen.queryByText(/Welcome,/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to Admin' })); expectDashboard();
  });
  it.each(['/login', '/register'])('sends an existing valid identity from %s to its own portal', (route) => {
    authenticate('alex@example.com', 'password123', 'candidate'); renderApp(route); expectCandidate();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/candidate$/);
  });
  it('retains candidate route and authenticated header after saving contact identity and using the new login email', async () => {
    const user = userEvent.setup();
    authenticate('alex@example.com', 'password123', 'candidate');
    renderApp('/candidate');
    const previousSession = readSession();
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), 'Alex Updated');
    await user.clear(screen.getByLabelText('Email Address'));
    await user.type(screen.getByLabelText('Email Address'), 'updated@example.com');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByText('Welcome, Alex Updated.')).toBeVisible();
    expect(screen.getByText('Profile saved in this browser.')).toBeVisible();
    expect(header().getByRole('button', { name: 'Logout' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/candidate$/);
    expect(readSession()).toEqual({ ...previousSession, displayName: 'Alex Updated' });
    expect(JSON.parse(localStorage.getItem(USERS_KEY))[2]).toMatchObject({ id: 'u-201', username: 'updated@example.com', password: 'password123' });
    expect(JSON.parse(localStorage.getItem('hirehub_submissions'))[0]).toMatchObject({ id: 'c-101', userId: 'u-201', email: 'updated@example.com' });
    await user.click(header().getByRole('button', { name: 'Logout' }));
    await user.click(header().getByRole('link', { name: 'Login', exact: true }));
    await user.type(screen.getByLabelText('Username'), 'updated@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.getByText('Welcome, Alex Updated.')).toBeVisible();
    expect(screen.getByRole('article')).toHaveTextContent('c-101');
  });
  it('retains partial rollback warning outside the closed candidate gate without stale details', async () => {
    const user = userEvent.setup();
    authenticate('alex@example.com', 'password123', 'candidate');
    renderApp('/candidate');
    const oldRecords = localStorage.getItem('hirehub_submissions');
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    await user.clear(screen.getByLabelText('Full Name'));
    await user.type(screen.getByLabelText('Full Name'), 'Alex Updated');
    const set = Storage.prototype.setItem;
    let usersChanged = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, raw) {
      if (key === SESSION_KEY || (key === USERS_KEY && usersChanged)) throw new Error('quota');
      if (key === USERS_KEY) usersChanged = true;
      return set.call(this, key, raw);
    });
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Rollback also failed');
    expect(screen.getByRole('alert')).toHaveTextContent('changes may be partial');
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText(/Welcome,|Profile saved in this browser/)).not.toBeInTheDocument();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    expect(readSession()).toBeNull();
    expect(localStorage.getItem('hirehub_submissions')).toBe(oldRecords);
    expect(JSON.parse(localStorage.getItem(USERS_KEY))[2].displayName).toBe('Alex Updated');
  });
  it('fails closed on stored account role tampering during storage synchronization', () => {
    authenticate(); renderApp('/admin'); expectDashboard();
    localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS.map((user) => user.id === 'u-admin' ? { ...user, role: 'candidate' } : user)));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: USERS_KEY, storageArea: localStorage })));
    expectLoginGate(); expect(readSession()).toBeNull();
  });
});

/** Preserve effect-only demo initialization and footer reset regression coverage. */
describe('App demo initialization and reset', () => {
  const legacy = { id: 'legacy', fullName: 'Legacy Candidate', email: 'legacy@example.com', mobile: '0123456789', department: 'Engineering', submittedAt: '2026-03-04T12:00:00.000Z' };
  it('does not seed during server render and shows preparing before effects', () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
    const html = renderToString(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(html).toContain('Preparing local demo data'); expect(localStorage.getItem('hirehub_submissions')).toBeNull();
    expect(localStorage.getItem(USERS_KEY)).toBeNull(); expect(localStorage.getItem(DEPARTMENTS_KEY)).toBeNull();
    for (const [message] of warning.mock.calls) expect(message).toContain('useLayoutEffect does nothing on the server');
  });
  it('seeds idempotently in StrictMode before authenticated dashboard reads records', () => {
    authenticate();
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/admin']}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    );
    expectDashboard(); expect(JSON.parse(localStorage.getItem('hirehub_submissions'))).toEqual(DEFAULT_SUBMISSIONS);
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual(DEFAULT_USERS);
    expect(JSON.parse(localStorage.getItem(DEPARTMENTS_KEY))).toEqual(DEFAULT_DEPARTMENTS);
    expect(screen.getByRole('contentinfo', { name: 'Demo utilities' })).toBeVisible();
  });
  it.each(['{bad', '[]', 'null'])('repairs corrupt or empty submissions %s before dashboard mount', (raw) => {
    authenticate(); localStorage.setItem('hirehub_submissions', raw); renderApp('/admin'); expectDashboard();
    expect(JSON.parse(localStorage.getItem('hirehub_submissions'))).toEqual(DEFAULT_SUBMISSIONS);
  });
  it('preserves nonempty six-field legacy records on launch and navigation', async () => {
    const user = userEvent.setup(); authenticate(); const raw = JSON.stringify([legacy], null, 2);
    localStorage.setItem('hirehub_submissions', raw); renderApp('/admin');
    expect(screen.getByText('Legacy Candidate', { exact: true })).toBeVisible(); expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(localStorage.getItem('hirehub_submissions')).toBe(raw);
    await user.click(header().getByRole('link', { name: 'Apply', exact: true })); await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expect(screen.getByText('Legacy Candidate', { exact: true })).toBeVisible(); expect(localStorage.getItem('hirehub_submissions')).toBe(raw);
  });
  it.each(['read', 'quota'])('surfaces initial %s errors in accessible footer and recovers on reset', async (failure) => {
    const user = userEvent.setup(); vi.spyOn(window, 'confirm').mockReturnValue(true);
    const storage = vi.spyOn(Storage.prototype, failure === 'read' ? 'getItem' : 'setItem').mockImplementation(() => { throw new Error('unavailable'); });
    renderApp('/'); expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    const footer = within(screen.getByRole('contentinfo', { name: 'Demo utilities' }));
    expect(footer.getByRole('alert')).toHaveTextContent(failure === 'read' ? 'Unable to read' : 'Unable to save');
    expect(footer.getByRole('alert')).toHaveTextContent('try Reset Mock Data again'); storage.mockRestore();
    await user.click(footer.getByRole('button', { name: 'Reset Mock Data' })); expect(footer.queryByRole('alert')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('hirehub_submissions'))).toEqual(DEFAULT_SUBMISSIONS);
    expect(footer.getByRole('status')).toHaveTextContent('Mock data restored.');
  });
  it('resets authenticated dashboard, clears both sessions, preserves theme and returns home', async () => {
    const user = userEvent.setup(); vi.spyOn(window, 'confirm').mockReturnValue(true); authenticate(); sessionStorage.setItem(AUTH_KEY, 'true');
    localStorage.setItem('hirehub_theme', 'dark'); localStorage.setItem('hirehub_submissions', JSON.stringify([legacy]));
    renderApp('/admin'); expect(screen.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible(); expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(localStorage.getItem('hirehub_theme')).toBe('dark');
    expect(JSON.parse(localStorage.getItem('hirehub_submissions'))).toEqual(DEFAULT_SUBMISSIONS);
    await user.click(header().getByRole('link', { name: 'Admin', exact: true })); expectLoginGate();
  });
  it('retains current route and identity after failed reset then retries successfully', async () => {
    const user = userEvent.setup(); vi.spyOn(window, 'confirm').mockReturnValue(true); authenticate(); const identity = readSession();
    renderApp('/admin?review=latest#records'); const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' })); expectDashboard();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin\?review=latest#records$/); expect(readSession()).toEqual(identity);
    expect(within(screen.getByRole('contentinfo', { name: 'Demo utilities' })).getByRole('alert')).toHaveTextContent('Unable to reset mock data.');
    set.mockRestore(); await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
  });
});
