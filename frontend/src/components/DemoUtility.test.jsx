/** Exercise real reset persistence and visible retry behavior without mocking the data layer. */
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoUtility } from './DemoUtility';
import { seedMockData, DEFAULT_USERS, DEFAULT_SUBMISSIONS, DEFAULT_DEPARTMENTS, DATA_STORAGE_ERROR } from '../features/data/mockData';

beforeEach(() => { localStorage.clear(); seedMockData(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it('restores eight/default accounts/departments, removes session and preserves theme/unrelated data before callback', async () => {
  localStorage.setItem('hirehub_users', '[]'); localStorage.setItem('hirehub_submissions', '[]');
  localStorage.setItem('hirehub_departments', '[]'); localStorage.setItem('hirehub_session', 'stale');
  localStorage.setItem('hirehub_theme', 'dark'); localStorage.setItem('unrelated', 'keep');
  const onReset = vi.fn(() => {
    expect(localStorage.getItem('hirehub_session')).toBeNull();
    expect(JSON.parse(localStorage.getItem('hirehub_submissions'))).toEqual(DEFAULT_SUBMISSIONS);
  });
  render(<DemoUtility onReset={onReset} />);
  expect(screen.getByRole('contentinfo')).toHaveTextContent('Local-only demo');
  await userEvent.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
  expect(JSON.parse(localStorage.getItem('hirehub_users'))).toEqual(DEFAULT_USERS);
  expect(JSON.parse(localStorage.getItem('hirehub_departments'))).toEqual(DEFAULT_DEPARTMENTS);
  expect(localStorage.getItem('hirehub_theme')).toBe('dark'); expect(localStorage.getItem('unrelated')).toBe('keep');
  expect(onReset).toHaveBeenCalledOnce(); expect(screen.getByRole('status')).toHaveTextContent('Eight sample applications');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('does not notify or report success on quota failure; retains session and supports retry', async () => {
  localStorage.setItem('hirehub_session', 'stale'); const before = localStorage.getItem('hirehub_submissions');
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  const onReset = vi.fn(); render(<DemoUtility onReset={onReset} />);
  await userEvent.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
  expect(screen.getByRole('alert')).toHaveTextContent(DATA_STORAGE_ERROR);
  expect(screen.getByRole('status')).toBeEmptyDOMElement(); expect(onReset).not.toHaveBeenCalled();
  expect(localStorage.getItem('hirehub_submissions')).toBe(before);
  write.mockRestore(); await userEvent.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
  expect(localStorage.getItem('hirehub_session')).toBeNull(); expect(onReset).toHaveBeenCalledOnce();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('keeps session intact when removal is blocked and does not notify', async () => {
  localStorage.setItem('hirehub_session', 'stale');
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
  const onReset = vi.fn(); render(<DemoUtility onReset={onReset} />);
  await userEvent.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
  expect(localStorage.getItem('hirehub_session')).toBe('stale');
  expect(screen.getByRole('alert')).toHaveTextContent(DATA_STORAGE_ERROR); expect(onReset).not.toHaveBeenCalled();
});
it('reports unavailable storage and clears a previous success message', async () => {
  const onReset = vi.fn(); render(<DemoUtility onReset={onReset} />);
  await userEvent.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
  expect(screen.getByRole('status')).toHaveTextContent('Mock data reset');
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
  await userEvent.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
  expect(screen.getByRole('alert')).toHaveTextContent(DATA_STORAGE_ERROR);
  expect(screen.getByRole('status')).toBeEmptyDOMElement(); expect(onReset).toHaveBeenCalledOnce();
});
