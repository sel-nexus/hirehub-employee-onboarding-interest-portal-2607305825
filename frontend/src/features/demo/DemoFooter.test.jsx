/** Exercise one-click reset feedback with real storage and root-route consumers. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { DemoFooter } from './DemoFooter';
import { initializeDemo, saveDemoSubmissions, saveSession, DEMO_SUBMISSIONS_KEY, USERS_KEY, SESSION_KEY } from './storage';
import { DEFAULT_USERS, DEFAULT_SUBMISSIONS } from './seed';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('demo footer', () => {
  it('announces restored data after a single click and keeps the reset control available', async () => {
    const user = userEvent.setup();
    initializeDemo();
    saveDemoSubmissions([]);
    expect(saveSession({ userId: DEFAULT_USERS[0].id, role: 'candidate', displayName: DEFAULT_USERS[0].displayName,
      loginTimestamp: '2026-10-26T14:30:00.000Z' }).success).toBe(true);
    render(<DemoFooter />);
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByRole('status')).toHaveTextContent('eight applications restored');
    expect(JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY))).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Reset Mock Data' })).toBeEnabled();
    expect(JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY))).toEqual(DEFAULT_SUBMISSIONS);
    expect(JSON.parse(localStorage.getItem(USERS_KEY))).toEqual(DEFAULT_USERS);
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('shows initialization recovery and errors in accessible alerts', () => {
    render(<DemoFooter feedback={{ error: 'Storage denied', warning: 'Corrupted data recovered' }} />);
    expect(screen.getAllByRole('alert').map((element) => element.textContent))
      .toEqual(['Storage denied', 'Corrupted data recovered']);
  });

  it('reports failed reset, never success, and allows a successful retry', async () => {
    const user = userEvent.setup();
    render(<DemoFooter />);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save demo data');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    spy.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('sessions cleared');
  });

  it('initializes App without breaking legacy login and refreshes its gate on reset', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('hirehub_admin_auth', 'true');
    render(
      <MemoryRouter initialEntries={['/admin']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY))).toHaveLength(8);
    await user.click(screen.getByRole('button', { name: 'Reset Mock Data' }));
    expect(screen.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Submissions Dashboard' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('hirehub_admin_auth')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('eight applications restored');
  });

  it('mounts visible corrupted-storage feedback before routes can erase demo data', () => {
    localStorage.setItem(DEMO_SUBMISSIONS_KEY, '{bad');
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Corrupted hirehub_submissions data was recovered');
    expect(JSON.parse(localStorage.getItem(DEMO_SUBMISSIONS_KEY))).toHaveLength(8);
  });
});
