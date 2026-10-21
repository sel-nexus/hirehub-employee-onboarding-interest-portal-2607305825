/** Verify visible login outcomes with real session helpers and user interactions. */
import { useState } from 'react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import { AUTH_KEY, INVALID_CREDENTIALS, LOGIN_STORAGE_ERROR, isAuthenticated } from './auth';

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

/** Render visible session feedback after the component's owner callback. */
function LoginFeedback() {
  const [authenticated, setAuthenticated] = useState(false);
  return authenticated ? (
    <p role="status">Demo admin session is active.</p>
  ) : (
    <Login onLogin={() => setAuthenticated(isAuthenticated())} />
  );
}

/**
 * Enter supplied credentials using the accessible fields and submit the form.
 * Args:
 *   user: The test's user-event instance.
 *   username: The username to enter, if not empty.
 *   password: The password to enter, if not empty.
 */
async function submitCredentials(user, username, password) {
  if (username) {
    await user.type(screen.getByLabelText('Username'), username);
  }
  if (password) {
    await user.type(screen.getByLabelText('Password'), password);
  }
  await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
}

describe('Login', () => {
  it('renders the exact title, accessible fields, demo hint and nonsecurity disclaimer', () => {
    render(<Login onLogin={vi.fn()} />);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('heading', { level: 1, name: 'Admin Login' })).toBeVisible();
    expect(screen.getByLabelText('Username')).toHaveAttribute('placeholder', 'Enter username');
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', 'Enter password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Login', exact: true })).toHaveClass('submission-button');
    expect(screen.getByText('Demo credentials: admin/admin')).toBeVisible();
    expect(screen.getByText('Browser-only demo. This is not real authentication or secure access control.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(isAuthenticated()).toBe(false);
  });

  it.each([
    ['', ''], ['wrong', 'admin'], ['admin', 'wrong'],
    ['Admin', 'admin'], [' admin', 'admin'], ['admin', 'admin '],
  ])('shows the exact invalid error and no session for %j / %j', async (username, password) => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
    await submitCredentials(user, username, password);
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'login-error');
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  });

  it('renders the valid result after persisting the session', async () => {
    const user = userEvent.setup();
    render(<LoginFeedback />);
    await submitCredentials(user, 'admin', 'admin');
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
    expect(isAuthenticated()).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Demo admin session is active.');
    expect(screen.queryByRole('heading', { name: 'Admin Login' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears an invalid error when a corrected login succeeds', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    render(<Login onLogin={onLogin} />);
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

  it('shows actionable write failure without success and allows retry after recovery', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    render(<Login onLogin={onLogin} />);
    await submitCredentials(user, 'admin', 'admin');
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_STORAGE_ERROR);
    expect(screen.getByLabelText('Username')).toHaveValue('admin');
    expect(screen.getByLabelText('Password')).toHaveValue('admin');
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
    expect(onLogin).not.toHaveBeenCalled();
    write.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(isAuthenticated()).toBe(true);
  });

  it('shows actionable storage-access failure without notifying success', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    render(<Login onLogin={onLogin} />);
    await submitCredentials(user, 'admin', 'admin');
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_STORAGE_ERROR);
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    expect(isAuthenticated()).toBe(false);
    expect(onLogin).not.toHaveBeenCalled();
  });
});
