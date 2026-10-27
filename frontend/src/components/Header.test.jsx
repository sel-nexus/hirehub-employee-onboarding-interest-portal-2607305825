/** Preserve shared navigation names while exposing accessible theme actions. */
import { afterEach, it, expect, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Header } from './Header';
afterEach(cleanup);

it('preserves all public entries and renders an SVG toggle with unpressed light state', async () => {
  const onToggleTheme = vi.fn();
  render(
    <MemoryRouter>
      <Header onLogout={() => {}} theme="light" onToggleTheme={onToggleTheme} />
    </MemoryRouter>,
  );
  for (const name of ['Home', 'Apply', 'Admin', 'Candidate', 'Register', 'Login']) expect(screen.getByRole('link', { name, exact: true })).toBeVisible();
  const toggle = screen.getByRole('button', { name: 'Switch to dark theme' });
  expect(toggle).toHaveAttribute('aria-pressed', 'false'); expect(toggle.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  await userEvent.click(toggle); expect(onToggleTheme).toHaveBeenCalledOnce();
});
it('exposes pressed dark state and retains legacy recruiter logout', async () => {
  const onLogout = vi.fn();
  render(
    <MemoryRouter>
      <Header authenticated onLogout={onLogout} theme="dark" onToggleTheme={() => {}} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', { name: 'Recruiter Dashboard' })).toHaveAttribute('href', '/admin');
  expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Candidate' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Logout' })); expect(onLogout).toHaveBeenCalledOnce();
});
it('keeps candidate portal and public admin entry, without registration or login', () => {
  render(
    <MemoryRouter>
      <Header
        session={{ userId: 'u-201', role: 'candidate', displayName: 'Alex', loginTimestamp: '2026-10-26T14:30:00.000Z' }}
        onLogout={() => {}}
      />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Candidate Portal' })).toHaveAttribute('href', '/candidate');
  expect(screen.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('href', '/admin');
  expect(screen.queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
});
