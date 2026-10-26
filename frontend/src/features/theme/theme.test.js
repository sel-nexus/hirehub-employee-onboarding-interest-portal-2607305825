/** Verify real browser preference state, storage failures, synchronization and token contrast. */
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  THEME_KEY, THEME_READ_WARNING, THEME_SAVE_WARNING,
  initializeTheme, getTheme, getThemeWarning, setTheme, subscribeTheme,
} from './theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  initializeTheme();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('initial theme', () => {
  it.each([['dark', true], ['light', false]])('uses OS %s without storing a default', (theme, matches) => {
    window.matchMedia.mockReturnValue({ matches });
    expect(initializeTheme()).toEqual({ theme, error: '' });
    expect(getTheme()).toBe(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });
  it.each([['light', true], ['dark', false]])('saved %s wins over the opposite OS preference', (theme, matches) => {
    localStorage.setItem(THEME_KEY, theme);
    window.matchMedia.mockReturnValue({ matches });
    expect(initializeTheme()).toEqual({ theme, error: '' });
    expect(getTheme()).toBe(theme);
    expect(localStorage.getItem(THEME_KEY)).toBe(theme);
  });
  it.each(['', 'system', 'Dark', 'null', '"dark"', '{}', ' light ', 'toString'])('ignores invalid saved %j without overwriting it', (value) => {
    localStorage.setItem(THEME_KEY, value);
    window.matchMedia.mockReturnValue({ matches: true });
    expect(initializeTheme()).toEqual({ theme: 'dark', error: '' });
    expect(localStorage.getItem(THEME_KEY)).toBe(value);
  });
  it('falls back to light when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(initializeTheme().theme).toBe('light');
  });
  it('falls back to light when matchMedia throws', () => {
    window.matchMedia.mockImplementation(() => { throw new Error('unsupported'); });
    expect(initializeTheme().theme).toBe('light');
  });
  it('uses the OS and reports unavailable getItem reads', () => {
    window.matchMedia.mockReturnValue({ matches: true });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(initializeTheme()).toEqual({ theme: 'dark', error: THEME_READ_WARNING });
    expect(getThemeWarning()).toBe(THEME_READ_WARNING);
    expect(getTheme()).toBe('dark');
  });
  it('survives a blocked localStorage getter on initialization and save', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(initializeTheme()).toEqual({ theme: 'light', error: THEME_READ_WARNING });
    expect(setTheme('dark')).toEqual({ theme: 'dark', saved: false, error: THEME_SAVE_WARNING });
    expect(getTheme()).toBe('dark');
  });
  it('initializes an absent or invalid DOM attribute and is repeatable', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    document.documentElement.dataset.theme = 'invalid';
    expect(getTheme()).toBe('dark');
    expect(initializeTheme()).toEqual(initializeTheme());
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });
});

describe('explicit theme changes', () => {
  it.each(['light', 'dark'])('applies and persists %s and survives reinitialization', (theme) => {
    expect(setTheme(theme)).toEqual({ theme, saved: true, error: '' });
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(localStorage.getItem(THEME_KEY)).toBe(theme);
    delete document.documentElement.dataset.theme;
    expect(initializeTheme()).toEqual({ theme, error: '' });
  });
  it('persists the same OS theme as an explicit preference', () => {
    expect(getTheme()).toBe('light');
    expect(setTheme('light').saved).toBe(true);
    window.matchMedia.mockReturnValue({ matches: true });
    expect(initializeTheme().theme).toBe('light');
  });
  it.each([undefined, null, '', 'system', 'DARK', {}, 1])('rejects invalid selection %j without changing state', (theme) => {
    setTheme('dark');
    expect(setTheme(theme)).toEqual({ theme: 'dark', saved: false, error: 'Choose a light or dark theme.' });
    expect(getTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });
  it('applies on quota failure without pretending to save, then clears the warning on retry', () => {
    setTheme('light');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(setTheme('dark')).toEqual({ theme: 'dark', saved: false, error: THEME_SAVE_WARNING });
    expect(getTheme()).toBe('dark');
    expect(getThemeWarning()).toBe(THEME_SAVE_WARNING);
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    write.mockRestore();
    expect(setTheme('dark')).toEqual({ theme: 'dark', saved: true, error: '' });
    expect(getThemeWarning()).toBe('');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });
});

describe('theme subscriptions', () => {
  it('notifies same-tab changes and failed saves, and stops after cleanup', () => {
    const states = [];
    const unsubscribe = subscribeTheme((state) => states.push(state));
    try {
      setTheme('dark');
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
      setTheme('light');
      expect(states).toEqual([{ theme: 'dark', error: '' }, { theme: 'light', error: THEME_SAVE_WARNING }]);
      unsubscribe();
      unsubscribe();
      setTheme('dark');
      expect(states).toHaveLength(2);
    } finally { unsubscribe(); }
  });
  it.each(['light', 'dark'])('synchronizes cross-tab %s without writing it back', (theme) => {
    const states = [];
    const unsubscribe = subscribeTheme((state) => states.push(state));
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: theme, storageArea: localStorage }));
      expect(getTheme()).toBe(theme);
      expect(states).toEqual([{ theme, error: '' }]);
      expect(localStorage.getItem(THEME_KEY)).toBeNull();
    } finally { unsubscribe(); }
  });
  it.each([null, 'invalid'])('recovers removed/invalid cross-tab preference %j to OS', (newValue) => {
    setTheme('light');
    window.matchMedia.mockReturnValue({ matches: true });
    const unsubscribe = subscribeTheme(() => {});
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue }));
      expect(getTheme()).toBe('dark');
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      expect(getTheme()).toBe('dark');
    } finally { unsubscribe(); }
  });
  it('ignores unrelated keys and session storage, and removes storage listeners', () => {
    const unsubscribe = subscribeTheme(() => {});
    window.dispatchEvent(new StorageEvent('storage', { key: 'hirehub_session', newValue: 'dark' }));
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark', storageArea: sessionStorage }));
    expect(getTheme()).toBe('light');
    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark' }));
    expect(getTheme()).toBe('light');
  });
  it('synchronizes even if accessing storageArea comparison is blocked', () => {
    const event = new StorageEvent('storage', { key: THEME_KEY, newValue: 'dark', storageArea: localStorage });
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Blocked'); });
    const unsubscribe = subscribeTheme(() => {});
    try {
      window.dispatchEvent(event);
      expect(getTheme()).toBe('dark');
    } finally { unsubscribe(); }
  });
});

/** Compute WCAG relative luminance from a six-digit CSS token. */
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
/** Extract simple hex role tokens from the actual shared stylesheet. */
function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]));
}
// The slice verification command runs from frontend, matching the existing npm scripts.
const css = readFileSync('src/App.css', 'utf8');
const light = tokens(css.match(/:root\s*\{([^}]+)\}/)[1]);
const dark = { ...light, ...tokens(css.match(/:root\[data-theme='dark'\]\s*\{([^}]+)\}/)[1]) };

describe('PRD palettes and accessible role pairs', () => {
  it('uses the specified light/dark surfaces and brand rather than overriding the shipped font stack', () => {
    expect([light.bg, light.card, light.border, light.primary, light.accent]).toEqual(['#f8fafc', '#ffffff', '#e2e8f0', '#4f46e5', '#6366f1']);
    expect([dark.bg, dark.card, dark.border]).toEqual(['#0f172a', '#1e293b', '#334155']);
    expect(css).toContain("font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
    expect(css).not.toMatch(/transition:\s*all/);
    expect(css).toContain('prefers-reduced-motion: reduce');
  });
  for (const [mode, roles] of [['light', light], ['dark', dark]]) {
    it.each([
      ['text', 'bg'], ['text', 'card'], ['text-muted', 'bg'], ['text-muted', 'card'],
      ['link', 'card'], ['link', 'primary-light'], ['on-primary', 'primary'], ['on-primary', 'primary-hover'],
      ['on-primary', 'danger-solid'], ['success', 'success-bg'], ['danger', 'danger-bg'],
      ['warning', 'warning-bg'], ['info', 'info-bg'], ['applied', 'applied-bg'],
    ])(`${mode} %s on %s meets AA for normal text`, (foreground, background) => {
      const values = [luminance(roles[foreground]), luminance(roles[background])].sort((a, b) => b - a);
      expect((values[0] + 0.05) / (values[1] + 0.05)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
