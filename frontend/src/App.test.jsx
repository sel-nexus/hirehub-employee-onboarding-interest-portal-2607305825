/** Exercise the real App routes, shared session state, and recoverable logout. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from './App';
import { AUTH_KEY, INVALID_CREDENTIALS, LOGOUT_STORAGE_ERROR } from './features/admin/auth';

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
