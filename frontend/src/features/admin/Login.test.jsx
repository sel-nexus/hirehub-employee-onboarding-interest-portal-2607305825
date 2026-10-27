/** Verify role switching, accessible login errors, persistence and retries with real auth. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';
import { AUTH_KEY, INVALID_CREDENTIALS, LOGIN_STORAGE_ERROR, getSession, isAuthenticated } from './auth';
import { seedMockData } from '../data/mockData';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  seedMockData();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Mount the real login with its URL-backed access selector. */
function renderLogin(onLogin = vi.fn(), initialRole = 'candidate', route = '/login') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Login onLogin={onLogin} initialRole={initialRole} />
    </MemoryRouter>,
  );
}

/** Enter visible credentials and submit without bypassing form validation. */
async function submitCredentials(user, username, password) {
  if (username) await user.type(screen.getByLabelText(/Username|Email Address/), username);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
}

describe('Login', () => {
  it('defaults to candidate with accessible fields, exact demos, role tabs, disclaimer and signup link', () => {
    renderLogin();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { level: 1, name: 'Candidate Login' })).toBeVisible();
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Email Address')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', 'Enter password');
    expect(screen.getByRole('tab', { name: 'Candidate', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'login-tab-candidate');
    expect(screen.getByText('Demo candidates: alex@example.com, jordan@example.com, taylor@example.com — password123')).toBeVisible();
    expect(screen.getByText('Browser-only demo. This is not real authentication or secure access control.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Create a candidate account' })).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getSession()).toBeNull();
  });
  it('supports legacy recruiter entry and exposes both exact admin hints', () => {
    renderLogin(vi.fn(), 'admin', '/admin');
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    expect(screen.getByLabelText('Username')).toHaveAttribute('placeholder', 'Enter username');
    expect(screen.getByText('Demo credentials: admin/admin or recruiter@hirehub.demo/admin123')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Administrator / Recruiter' })).toHaveAttribute('aria-selected', 'true');
  });
  it.each(['/login?role=admin', '/admin?role=admin'])('restores administrator tab from URL %s', (route) => {
    renderLogin(vi.fn(), 'candidate', route);
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  });
  it('ignores unsupported URL roles and stays candidate', () => {
    renderLogin(vi.fn(), 'candidate', '/login?role=owner');
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
  });
  it.each([
    ['', ''], ['wrong', 'admin'], ['admin', 'wrong'], ['Admin', 'admin'], [' admin', 'admin'], ['admin', 'admin '],
  ])('shows the exact invalid error and no session for %j / %j', async (username, password) => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    renderLogin(onLogin, 'admin');
    await submitCredentials(user, username, password);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'login-error');
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  });
  it.each([
    ['alex@example.com', 'password123', 'candidate', 'u-201'],
    ['jordan@example.com', 'password123', 'candidate', 'u-202'],
    ['taylor@example.com', 'password123', 'candidate', 'u-203'],
    ['admin', 'admin', 'admin', 'u-admin'],
    ['recruiter@hirehub.demo', 'admin123', 'admin', 'u-recruiter'],
  ])('notifies success only after persisting the correct session for %s', async (username, password, role, userId) => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    renderLogin(onLogin, role);
    await submitCredentials(user, username, password);
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(getSession()).toMatchObject({ userId, role });
    expect(JSON.parse(localStorage.getItem(AUTH_KEY))).toEqual(getSession());
    expect(isAuthenticated(role)).toBe(true);
    expect(sessionStorage.length).toBe(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('rejects candidate credentials on the admin tab and clears credentials/errors when switching', async () => {
    const user = userEvent.setup();
    renderLogin(vi.fn(), 'admin');
    await submitCredentials(user, 'alex@example.com', 'password123');
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(getSession()).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Candidate', exact: true }));
    expect(screen.getByLabelText('Email Address')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Candidate', exact: true })).toHaveAttribute('aria-selected', 'true');
  });
  it('supports tab arrow/Home/End keys, focus, and ignores unrelated keys', async () => {
    const user = userEvent.setup();
    renderLogin();
    screen.getByRole('tab', { name: 'Candidate', exact: true }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Administrator / Recruiter' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await user.keyboard('x');
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Candidate', exact: true })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await user.keyboard('{Home}');
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
  });
  it('clears invalid error and aria associations after a corrected login', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    renderLogin(onLogin, 'admin');
    await submitCredentials(user, 'admin', 'wrong');
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-describedby');
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(isAuthenticated()).toBe(true);
  });
  it('shows actionable write failure with retained fields and retries after recovery', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderLogin(onLogin, 'admin');
    await submitCredentials(user, 'admin', 'admin');
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_STORAGE_ERROR);
    expect(screen.getByLabelText('Username')).toHaveValue('admin');
    expect(screen.getByLabelText('Password')).toHaveValue('admin');
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
    expect(onLogin).not.toHaveBeenCalled();
    expect(isAuthenticated()).toBe(false);
    write.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(isAuthenticated()).toBe(true);
  });
  it('shows storage getter failure without notifying success', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    renderLogin(onLogin, 'admin');
    await submitCredentials(user, 'admin', 'admin');
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_STORAGE_ERROR);
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    expect(isAuthenticated()).toBe(false);
    expect(onLogin).not.toHaveBeenCalled();
  });
});
