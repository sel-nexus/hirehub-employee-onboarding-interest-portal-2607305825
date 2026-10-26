/** Exercise native confirmation, real resets, and accessible failure/retry feedback. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AUTH_KEY } from '../admin/auth';
import { SUBMISSIONS_KEY } from '../apply/submissions';
import { DEFAULT_SUBMISSIONS, DEFAULT_USERS, DEFAULT_DEPARTMENTS, USERS_KEY, DEPARTMENTS_KEY, SESSION_KEY } from './mockData';
import { DemoBar } from './DemoBar';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DemoBar', () => {
  it('renders a named footer, demo boundary copy and native button with no initial success', () => {
    render(
      <DemoBar onReset={vi.fn()} />,
    );
    const footer = within(screen.getByRole('contentinfo', { name: 'Demo utilities' }));
    expect(footer.getByText(/Local demo only/)).toBeVisible();
    expect(footer.getByRole('button', { name: 'Reset Mock Data' })).toBeEnabled();
    expect(footer.getByRole('status')).toBeEmptyDOMElement();
    expect(footer.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retains all storage and initial error when the native confirmation is cancelled', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    localStorage.setItem(SUBMISSIONS_KEY, 'stale');
    localStorage.setItem(SESSION_KEY, 'session');
    sessionStorage.setItem(AUTH_KEY, 'true');
    render(
      <DemoBar initializationError="Unable to read demo data." onReset={onReset} />,
    );
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('signs you out'));
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('stale');
    expect(localStorage.getItem(SESSION_KEY)).toBe('session');
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('true');
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to read demo data.');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(onReset).not.toHaveBeenCalled();
  });

  it('restores actual storage and clears stale sessions on keyboard confirmation, keeping theme', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    localStorage.setItem(SUBMISSIONS_KEY, 'stale');
    localStorage.setItem(USERS_KEY, 'stale');
    localStorage.setItem(DEPARTMENTS_KEY, 'stale');
    localStorage.setItem(SESSION_KEY, 'session');
    sessionStorage.setItem(AUTH_KEY, 'true');
    localStorage.setItem('hirehub_theme', 'dark');
    render(
      <DemoBar initializationError="Unable to save demo data." onReset={onReset} />,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Reset Mock Data' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toEqual(DEFAULT_SUBMISSIONS);
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual(DEFAULT_USERS);
    expect(JSON.parse(localStorage.getItem(DEPARTMENTS_KEY))).toEqual(DEFAULT_DEPARTMENTS);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
    expect(localStorage.getItem('hirehub_theme')).toBe('dark');
    expect(screen.getByRole('status')).toHaveTextContent('Mock data restored. You have been signed out.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('announces quota failure without success, retains storage and recovers on retry', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    localStorage.setItem(SUBMISSIONS_KEY, 'stale');
    render(
      <DemoBar onReset={onReset} />,
    );
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to reset mock data.');
    expect(screen.getByRole('alert')).toHaveTextContent('available space');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(localStorage.getItem(SUBMISSIONS_KEY)).toBe('stale');
    expect(onReset).not.toHaveBeenCalled();
    set.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(JSON.parse(localStorage.getItem(SUBMISSIONS_KEY))).toEqual(DEFAULT_SUBMISSIONS);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Mock data restored.');
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('announces session-removal errors rather than claiming a completed reset', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    localStorage.setItem(SESSION_KEY, 'stale-session');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    render(
      <DemoBar onReset={onReset} />,
    );
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Changes may be partial');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(localStorage.getItem(SESSION_KEY)).toBe('stale-session');
    expect(onReset).not.toHaveBeenCalled();
  });
});
