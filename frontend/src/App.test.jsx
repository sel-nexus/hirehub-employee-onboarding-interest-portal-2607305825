/** Exercise the real App routes, shared session state, and recoverable logout. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from './App';
import { AUTH_KEY, INVALID_CREDENTIALS, LOGOUT_STORAGE_ERROR } from './features/admin/auth';
import { authenticate, logout as accessLogout, SESSION_EVENT } from './features/access/accounts';
import { SESSION_KEY, DEMO_RESET_EVENT, resetMockData } from './features/demo/storage';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  // These legacy routing cases deliberately exercise an empty submissions dashboard.
  localStorage.setItem('hirehub_submissions', '[]');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

/** Observe the router's full URL without replacing any application behavior. */
function CurrentRoute() {
  const { pathname, search, hash } = useLocation();
  return <output aria-label="Current route">{pathname}{search}{hash}</output>;
}

/** Mount the actual application and its pages within an isolated router. */
function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
      <CurrentRoute />
    </MemoryRouter>,
  );
}

/** Query the header independently of the dashboard's second Logout button. */
function header() {
  return within(screen.getByRole('banner'));
}

/** Check the visible unauthenticated gate and shared header together. */
function expectLoginGate() {
  expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Submissions Dashboard' })).not.toBeInTheDocument();
  expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Logout', exact: true })).not.toBeInTheDocument();
}

/** Check the actual dashboard and shared authenticated header together. */
function expectDashboard() {
  expect(screen.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  expect(screen.getByText('No submissions yet.', { exact: true })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Admin Login' })).not.toBeInTheDocument();
  expect(header().getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  expect(header().queryByRole('link', { name: 'Login', exact: true })).not.toBeInTheDocument();
}

describe('App session routing', () => {
  it.each([
    ['/', 'Build Your Future With Us'],
    ['/apply', 'Join Our Team'],
    ['/unknown', 'Build Your Future With Us'],
  ])('renders the public route %s without a session', (route, heading) => {
    renderApp(route);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(route);
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it.each([null, '', 'false', 'TRUE', 'True', '1', ' true', 'true '])(
    'keeps /admin gated for the nonexact session value %j', (value) => {
      if (value !== null) sessionStorage.setItem(AUTH_KEY, value);
      renderApp('/admin');
      expectLoginGate();
      expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
      expect(sessionStorage.getItem(AUTH_KEY)).toBe(value);
    },
  );

  it('restores the dashboard and header only for the exact true session', () => {
    sessionStorage.setItem(AUTH_KEY, 'true');
    renderApp('/admin');
    expectDashboard();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
  });

  it('rejects invalid login, then synchronizes the real dashboard and header after corrected login', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expectLoginGate();
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expectDashboard();
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['banner', 'main'])('logs out through the %s, clears only auth, and redirects home', async (region) => {
    const user = userEvent.setup();
    sessionStorage.setItem(AUTH_KEY, 'true');
    sessionStorage.setItem('unrelated-session', 'preserve');
    renderApp('/admin');
    const recordsBefore = localStorage.getItem('hirehub_submissions');
    await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true }));
    expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(sessionStorage.getItem('unrelated-session')).toBe('preserve');
    expect(localStorage.getItem('hirehub_submissions')).toBe(recordsBefore);
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectLoginGate();
  });

  it.each(['banner', 'main'])('retains auth and full URL when %s Logout removal throws, then retries successfully', async (region) => {
    const user = userEvent.setup();
    sessionStorage.setItem(AUTH_KEY, 'true');
    renderApp('/admin?review=latest#records');
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('Session storage blocked');
    });
    await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true }));
    expectDashboard();
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin\?review=latest#records$/);
    expect(screen.getByRole('alert')).toHaveTextContent(LOGOUT_STORAGE_ERROR);
    expect(screen.getByRole('alert')).toHaveTextContent('try Logout again');

    remove.mockRestore();
    await user.click(within(screen.getByRole(region)).getByRole('button', { name: 'Logout', exact: true }));
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectLoginGate();
  });

  it.each(['focus', 'storage'])('refreshes externally changed auth on %s without navigation', (eventType) => {
    renderApp('/admin');
    expectLoginGate();
    sessionStorage.setItem(AUTH_KEY, 'true');
    expectLoginGate();
    act(() => {
      window.dispatchEvent(eventType === 'storage'
        ? new StorageEvent('storage', { key: AUTH_KEY, newValue: 'true', storageArea: sessionStorage })
        : new Event('focus'));
    });
    expectDashboard();

    sessionStorage.removeItem(AUTH_KEY);
    expectDashboard();
    act(() => {
      window.dispatchEvent(eventType === 'storage'
        ? new StorageEvent('storage', { key: AUTH_KEY, oldValue: 'true', newValue: null, storageArea: sessionStorage })
        : new Event('focus'));
    });
    expectLoginGate();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/admin$/);
  });

  it('refreshes external session changes on route navigation without browser events', async () => {
    const user = userEvent.setup();
    renderApp('/');
    sessionStorage.setItem(AUTH_KEY, 'true');
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectDashboard();
    sessionStorage.removeItem(AUTH_KEY);
    await user.click(header().getByRole('link', { name: 'Apply', exact: true }));
    expect(screen.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectLoginGate();
  });

  it('removes each session listener on route changes and unmount, while replacement listeners still refresh', async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderApp('/');
    const initialListeners = add.mock.calls.filter(([type]) => type === 'storage' || type === 'focus');
    expect(initialListeners.map(([type]) => type).sort()).toEqual(['focus', 'storage']);
    await user.click(header().getByRole('link', { name: 'Admin', exact: true }));
    expectLoginGate();
    for (const [type, listener] of initialListeners) {
      expect(remove).toHaveBeenCalledWith(type, listener);
    }
    const replacementListeners = add.mock.calls
      .filter(([type]) => type === 'storage' || type === 'focus')
      .slice(initialListeners.length);
    expect(replacementListeners.map(([type]) => type).sort()).toEqual(['focus', 'storage']);
    sessionStorage.setItem(AUTH_KEY, 'true');
    act(() => window.dispatchEvent(new Event('focus')));
    expectDashboard();
    unmount();
    for (const [type, listener] of replacementListeners) {
      expect(remove).toHaveBeenCalledWith(type, listener);
    }
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });
});


describe('App persistent access routing', () => {
  afterEach(() => { accessLogout(); });

  it.each(['/portal', '/recruiter'])('denies anonymous and legacy-only access to %s', (route) => {
    sessionStorage.setItem(AUTH_KEY, 'true');
    renderApp(route);
    expect(screen.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/login');
  });

  it.each([
    ['candidate', 'alex@example.com', 'password123', '/portal', 'Candidate Portal', 'Portal'],
    ['admin', 'admin', 'admin', '/recruiter', 'Recruiter Access', 'Recruiter'],
  ])('restores %s from persisted identity, navigates and logs out', async (role, username, password, route, heading, link) => {
    const user = userEvent.setup();
    authenticate(username, password, role);
    renderApp(route);
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    expect(screen.getByText(`Welcome, ${session.displayName}.`)).toBeVisible();
    await user.click(header().getByRole('link', { name: 'Home', exact: true }));
    await user.click(header().getByRole('link', { name: link, exact: true }));
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    await user.click(header().getByRole('button', { name: 'Logout' }));
    // Demo reads recreate an absent session key as JSON null; neither form grants access.
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toBeNull();
    expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/$/);
    expect(header().queryByRole('link', { name: link, exact: true })).not.toBeInTheDocument();
    expect(header().getByRole('link', { name: 'Login', exact: true })).toHaveAttribute('href', '/login');
  });

  it.each([
    ['candidate', 'alex@example.com', 'password123', '/recruiter'],
    ['admin', 'admin', 'admin', '/portal'],
  ])('rejects wrong-role %s at %s', (role, username, password, route) => {
    authenticate(username, password, role);
    renderApp(route);
    expect(screen.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/login');
  });

  it('reaches new login and registration from public links, preserving legacy login', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await user.click(header().getByRole('link', { name: 'Register', exact: true }));
    expect(screen.getByRole('heading', { name: 'Register as a candidate' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Already registered? Login' }));
    expect(screen.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
    await user.click(screen.getByRole('link', { name: 'Legacy admin login' }));
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/admin/login');
  });

  it.each(['storage', SESSION_EVENT, 'focus', DEMO_RESET_EVENT])('revokes persistent access on %s', (event) => {
    authenticate('alex@example.com', 'password123', 'candidate');
    renderApp('/portal');
    localStorage.removeItem(SESSION_KEY);
    act(() => window.dispatchEvent(new Event(event)));
    expect(screen.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
    expect(header().queryByRole('link', { name: 'Portal', exact: true })).not.toBeInTheDocument();
  });

  it('reset clears a candidate session and denies the current protected route', () => {
    authenticate('alex@example.com', 'password123', 'candidate');
    renderApp('/portal');
    act(() => resetMockData());
    expect(screen.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toBeNull();
  });

  it('recovers malformed stored identity without rendering protected content', () => {
    localStorage.setItem(SESSION_KEY, '{');
    renderApp('/recruiter');
    expect(screen.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toBeNull();
  });

  it('fails closed after an active-session read failure', () => {
    authenticate('alex@example.com', 'password123', 'candidate');
    renderApp('/portal');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    act(() => window.dispatchEvent(new Event('storage')));
    expect(screen.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
    expect(screen.getAllByRole('alert').some((item) => item.textContent.includes('Unable to read'))).toBe(true);
    expect(header().queryByRole('link', { name: 'Portal', exact: true })).not.toBeInTheDocument();
  });

  it('failed persistent logout navigates home but cannot revive stale access', async () => {
    const user = userEvent.setup();
    authenticate('alex@example.com', 'password123', 'candidate');
    renderApp('/portal');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Blocked'); });
    await user.click(header().getByRole('button', { name: 'Logout' }));
    expect(screen.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    act(() => window.dispatchEvent(new Event('focus')));
    expect(header().queryByRole('link', { name: 'Portal', exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });
});
