/** Verify tab accessibility and visible outcomes with the real local auth service. */
import { useState } from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import { DEFAULT_USERS, USERS_KEY, SESSION_KEY } from '../demo/mockData';
import { INVALID_CREDENTIALS, LOGIN_STORAGE_ERROR, isAuthenticated, readSession } from './auth';

beforeEach(() => { localStorage.clear(); localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS)); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

/** Render visible owner feedback after the session has actually persisted. */
function LoginFeedback() {
  const [authenticated, setAuthenticated] = useState(false);
  return authenticated ? (
    <p role="status">Demo admin session is active.</p>
  ) : (
    <Login initialRole="admin" onLogin={() => setAuthenticated(isAuthenticated())} />
  );
}

/** Enter supplied credentials via labelled inputs and submit. */
async function submitCredentials(user, username, password) {
  if (username) await user.type(screen.getByLabelText('Username'), username);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
}

describe('Login', () => {
  it('renders the title, accessible fields, seeded hints and demo disclaimer', () => {
    render(<Login initialRole="admin" onLogin={vi.fn()} />);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { level: 1, name: 'Admin Login' })).toBeVisible();
    expect(screen.getByLabelText('Username')).toHaveAttribute('placeholder', 'Enter username');
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', 'Enter password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Login', exact: true })).toHaveClass('submission-button');
    expect(screen.getByText('Demo credentials: admin/admin or recruiter@hirehub.demo/admin123')).toBeVisible();
    expect(screen.getByText('Browser-only demo. This is not real authentication or secure access control.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(isAuthenticated()).toBe(false);
  });
  it.each([
    ['', ''], ['wrong', 'admin'], ['admin', 'wrong'], ['Admin', 'admin'], [' admin', 'admin'], ['admin', 'admin '],
  ])('shows invalid error and no session for %j / %j', async (username, password) => {
    const user = userEvent.setup(); const onLogin = vi.fn();
    render(<Login initialRole="admin" onLogin={onLogin} />);
    await submitCredentials(user, username, password);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'login-error');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(isAuthenticated()).toBe(false);
    expect(onLogin).not.toHaveBeenCalled(); expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  });
  it('renders the valid owner result after persisting the session', async () => {
    const user = userEvent.setup(); render(<LoginFeedback />);
    await submitCredentials(user, 'admin', 'admin');
    expect(readSession().userId).toBe('u-admin'); expect(isAuthenticated()).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Demo admin session is active.');
    expect(screen.queryByRole('heading', { name: 'Admin Login' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('clears an invalid error after corrected login', async () => {
    const user = userEvent.setup(); const onLogin = vi.fn(); render(<Login initialRole="admin" onLogin={onLogin} />);
    await submitCredentials(user, 'admin', 'wrong'); expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    await user.clear(screen.getByLabelText('Password')); await user.type(screen.getByLabelText('Password'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-describedby');
    expect(onLogin).toHaveBeenCalledTimes(1); expect(isAuthenticated()).toBe(true);
  });
  it('shows write failure, retains input and allows retry after recovery', async () => {
    const user = userEvent.setup(); const onLogin = vi.fn();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    render(<Login initialRole="admin" onLogin={onLogin} />); await submitCredentials(user, 'admin', 'admin');
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_STORAGE_ERROR);
    expect(screen.getByLabelText('Username')).toHaveValue('admin'); expect(screen.getByLabelText('Password')).toHaveValue('admin');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull(); expect(isAuthenticated()).toBe(false); expect(onLogin).not.toHaveBeenCalled();
    write.mockRestore(); await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(onLogin).toHaveBeenCalledTimes(1); expect(isAuthenticated()).toBe(true);
  });
  it('shows storage-access failure without notifying success', async () => {
    const user = userEvent.setup(); const onLogin = vi.fn();
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    render(<Login initialRole="admin" onLogin={onLogin} />); await submitCredentials(user, 'admin', 'admin');
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_STORAGE_ERROR);
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    expect(isAuthenticated()).toBe(false); expect(onLogin).not.toHaveBeenCalled();
  });
  it('defaults to candidate with all candidate hints and signup navigation', () => {
    render(<Login onLogin={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Candidate' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'login-tab-candidate');
    expect(screen.getByText(/alex@example.com, jordan@example.com or taylor@example.com/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Create candidate account' })).toHaveAttribute('href', '/register');
  });
  it('supports arrows, Home and End with roving focus and clears stale credentials/errors', async () => {
    const user = userEvent.setup(); render(<Login onLogin={vi.fn()} />);
    await submitCredentials(user, 'wrong', 'wrong'); expect(screen.getByRole('alert')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Candidate' }));
    await user.keyboard('{ArrowRight}');
    const admin = screen.getByRole('tab', { name: 'Administrator / Recruiter' });
    expect(admin).toHaveFocus(); expect(admin).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Candidate' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByLabelText('Username')).toHaveValue(''); expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.keyboard('{ArrowRight}'); expect(screen.getByRole('tab', { name: 'Candidate' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}'); expect(admin).toHaveFocus();
    await user.keyboard('{Home}'); expect(screen.getByRole('tab', { name: 'Candidate' })).toHaveFocus();
    await user.keyboard('{End}'); expect(admin).toHaveFocus();
    await user.keyboard('x'); expect(admin).toHaveFocus();
  });
  it.each(DEFAULT_USERS.map((account) => [account.username, account.password, account.role, account.id]))(
    'signs supplied %s into its selected role', async (username, password, role, id) => {
      const user = userEvent.setup(); const onLogin = vi.fn(); render(<Login onLogin={onLogin} />);
      if (role === 'admin') await user.click(screen.getByRole('tab', { name: 'Administrator / Recruiter' }));
      await submitCredentials(user, username, password);
      expect(readSession()).toMatchObject({ userId: id, role }); expect(onLogin).toHaveBeenCalledTimes(1);
    },
  );
  it.each([['admin', 'admin', 'candidate'], ['alex@example.com', 'password123', 'admin']])(
    'rejects valid %s credentials in the wrong %s tab', async (username, password, role) => {
      const user = userEvent.setup(); const onLogin = vi.fn(); render(<Login initialRole={role} onLogin={onLogin} />);
      await submitCredentials(user, username, password);
      expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
      expect(readSession()).toBeNull(); expect(onLogin).not.toHaveBeenCalled();
    },
  );
});
