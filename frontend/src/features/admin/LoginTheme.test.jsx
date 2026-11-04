/** Verify login-local theme state without changing the real demo session behavior. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';
import { AUTH_KEY, INVALID_CREDENTIALS, LOGIN_STORAGE_ERROR, isAuthenticated } from './auth';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

describe('Login theme', () => {
  it('defaults to light, toggles both ways by keyboard and never creates a session', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: 'Dark mode' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('main')).toHaveAttribute('data-login-theme', 'light');
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('main')).toHaveAttribute('data-login-theme', 'dark');
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('main')).toHaveAttribute('data-login-theme', 'light');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('keeps entered values and invalid errors across repeated toggles without submitting', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={vi.fn()} />);
    await user.type(screen.getByLabelText('Username'), 'wrong');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    await user.click(screen.getByRole('button', { name: 'Dark mode' }));
    await user.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(screen.getByLabelText('Username')).toHaveValue('wrong');
    expect(screen.getByLabelText('Password')).toHaveValue('secret');
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'login-error');
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    expect(isAuthenticated()).toBe(false);
  });

  it.each([['', ''], ['admin', 'wrong'], ['wrong', 'admin']])(
    'rejects credentials %j / %j while dark mode remains enabled', async (username, password) => {
      const user = userEvent.setup();
      render(<Login onLogin={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: 'Dark mode' }));
      if (username) await user.type(screen.getByLabelText('Username'), username);
      if (password) await user.type(screen.getByLabelText('Password'), password);
      await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
      expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
      expect(screen.getByRole('main')).toHaveAttribute('data-login-theme', 'dark');
      expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    },
  );

  it('accepts corrected demo credentials in dark mode and persists the unchanged session', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Dark mode' }));
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent(INVALID_CREDENTIALS);
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
    expect(isAuthenticated()).toBe(true);
    expect(screen.getByRole('main')).toHaveAttribute('data-login-theme', 'dark');
  });

  it('retains the theme and credentials on storage failure and allows recovery', async () => {
    const user = userEvent.setup();
    render(<Login onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Dark mode' }));
    await user.type(screen.getByLabelText('Username'), 'admin');
    await user.type(screen.getByLabelText('Password'), 'admin');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(screen.getByRole('alert')).toHaveTextContent(LOGIN_STORAGE_ERROR);
    expect(screen.getByRole('main')).toHaveAttribute('data-login-theme', 'dark');
    expect(screen.getByLabelText('Password')).toHaveValue('admin');
    expect(isAuthenticated()).toBe(false);
    write.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Login', exact: true }));
    expect(isAuthenticated()).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('resets to light after unmount and leaves document-level theme state untouched', async () => {
    const user = userEvent.setup();
    const rootBefore = document.documentElement.outerHTML.split('<body')[0];
    const bodyClass = document.body.className;
    const view = render(<Login onLogin={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(document.documentElement.outerHTML.split('<body')[0]).toBe(rootBefore);
    expect(document.body.className).toBe(bodyClass);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    view.unmount();
    render(<Login onLogin={vi.fn()} />);
    expect(screen.getByRole('main')).toHaveAttribute('data-login-theme', 'light');
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'false');
  });
});
