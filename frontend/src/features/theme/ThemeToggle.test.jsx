/** Exercise accessible appearance interactions and negative storage cases. */
import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './ThemeToggle';
import { THEME_KEY } from './theme';

let media;
let mediaEvents;
beforeEach(() => {
  localStorage.clear();
  mediaEvents = new EventTarget();
  media = {
    matches: false,
    addEventListener: mediaEvents.addEventListener.bind(mediaEvents),
    removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents),
  };
  vi.stubGlobal('matchMedia', () => media);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('ThemeToggle', () => {
  it('toggles both themes by keyboard, names state and persists across remount', async () => {
    const user = userEvent.setup();
    const mounted = render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Dark theme (current: light)' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    button.focus();
    await user.keyboard(' ');
    expect(button).toHaveAccessibleName('Dark theme (current: dark)');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    mounted.unmount();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('button', { name: 'Dark theme (current: dark)' }));
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['light', 'dark'])('honors saved %s despite opposing OS', (saved) => {
    localStorage.setItem(THEME_KEY, saved);
    media.matches = saved === 'light';
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toHaveAccessibleName(`Dark theme (current: ${saved})`);
  });

  it('follows OS when corrupt, handles storage events and cleans up on unmount', () => {
    localStorage.setItem(THEME_KEY, '{}');
    const mounted = render(
      <StrictMode>
        <ThemeToggle />
      </StrictMode>,
    );
    act(() => {
      media.matches = true;
      mediaEvents.dispatchEvent(new Event('change'));
    });
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'light' })));
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    mounted.unmount();
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark' })));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('announces quota failure without pretending saved and clears feedback on retry', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('not saved');
    expect(screen.getByRole('button')).toHaveAccessibleDescription(/not saved/);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    write.mockRestore();
    await user.click(screen.getByRole('button'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('reports denied reads while providing a usable OS-first toggle', () => {
    media.matches = true;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
    render(<ThemeToggle />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be read');
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });
});
