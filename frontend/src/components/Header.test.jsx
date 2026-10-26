/** Exercise semantic session navigation and the real theme controller through the header. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Header } from './Header';
import { THEME_KEY, THEME_READ_WARNING, THEME_SAVE_WARNING, initializeTheme } from '../features/theme/theme';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  initializeTheme();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

/** Render a real router-backed header; account data remains caller controlled. */
function renderHeader(props = {}, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header onLogout={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe('Header navigation', () => {
  it('preserves public links and active route semantics within named navigation', () => {
    renderHeader({}, '/apply');
    const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
    for (const [label, href] of [['Home', '/'], ['Apply', '/apply'], ['Candidate portal', '/candidate'], ['Admin', '/admin'], ['Register', '/register']]) {
      expect(nav.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href);
    }
    expect(nav.getByRole('link', { name: 'Apply', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Home', exact: true })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'HireHub' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Login', exact: true })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Logout' })).not.toBeInTheDocument();
  });
  it('hides recruiter and registration links for a candidate and calls the owner logout action', async () => {
    const onLogout = vi.fn();
    renderHeader({ authenticated: true, session: { role: 'candidate' }, onLogout }, '/candidate');
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: 'Candidate portal' })).toHaveAttribute('aria-current', 'page');
    expect(nav.queryByRole('link', { name: 'Admin', exact: true })).not.toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Login', exact: true })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Logout' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
  it('retains admin navigation for a recruiter and for legacy authenticated callers without session', () => {
    const view = renderHeader({ authenticated: true, session: { role: 'admin' } }, '/admin');
    expect(screen.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Register' })).not.toBeInTheDocument();
    view.unmount();
    renderHeader({ authenticated: true });
    expect(screen.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeVisible();
  });
  it('navigates through real links without disturbing theme state', async () => {
    renderHeader();
    await userEvent.setup().click(screen.getByRole('link', { name: 'Apply', exact: true }));
    expect(screen.getByRole('link', { name: 'Apply', exact: true })).toHaveAttribute('aria-current', 'page');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('Header theme control', () => {
  it.each(['light', 'dark'])('renders the applied %s theme with an accessible SVG action', (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    initializeTheme();
    renderHeader();
    const button = within(screen.getByRole('navigation')).getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme` });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('aria-pressed', String(theme === 'dark'));
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelector('svg')).toHaveAttribute('viewBox', '0 0 24 24');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('switches both ways by keyboard, persists the choice and restores it on remount/reinitialization', async () => {
    const user = userEvent.setup();
    const view = renderHeader();
    const button = screen.getByRole('button', { name: 'Switch to dark theme' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-pressed', 'true');
    view.unmount();
    delete document.documentElement.dataset.theme;
    window.matchMedia.mockReturnValue({ matches: false });
    initializeTheme();
    renderHeader();
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
  it('renders the initial OS dark preference with no saved value', () => {
    window.matchMedia.mockReturnValue({ matches: true });
    initializeTheme();
    renderHeader();
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
  it('shows a read warning but remains usable when storage reads are unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    initializeTheme();
    renderHeader();
    expect(screen.getByRole('status')).toHaveTextContent(THEME_READ_WARNING);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('shows an associated quota warning while switching, and clears it after a successful save', async () => {
    const user = userEvent.setup();
    renderHeader();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(THEME_SAVE_WARNING);
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toHaveAttribute('aria-describedby', 'theme-warning');
    write.mockRestore();
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).not.toHaveAttribute('aria-describedby');
  });
  it('synchronizes storage changes, ignores unrelated changes and removes listeners on unmount', () => {
    const view = renderHeader();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark' })));
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'hirehub_session', newValue: 'light' })));
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: null })));
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
    view.unmount();
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
