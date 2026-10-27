/** Verify actual preference persistence, OS fallback, synchronization and failure feedback. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { THEME_KEY, THEME_STORAGE_ERROR, readTheme, saveTheme, applyTheme, subscribeTheme, useTheme } from './theme';

beforeEach(() => { localStorage.clear(); vi.stubGlobal('matchMedia', undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

/** Provide a controllable browser OS preference with real change subscriptions. */
function os(dark = false, legacy = false) {
  const listeners = new Set();
  const media = { matches: dark };
  const add = (listener) => listeners.add(listener);
  const remove = (listener) => listeners.delete(listener);
  Object.assign(media, legacy ? { addListener: add, removeListener: remove } : {
    addEventListener: (_type, listener) => add(listener), removeEventListener: (_type, listener) => remove(listener),
  });
  vi.stubGlobal('matchMedia', () => media);
  return { media, listeners, change(value) { media.matches = value; act(() => listeners.forEach((listener) => listener())); } };
}

describe('theme preferences', () => {
  it.each(['light', 'dark'])('restores saved %s over the opposite OS without writing', (theme) => {
    os(theme === 'light'); localStorage.setItem(THEME_KEY, theme);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(readTheme()).toEqual({ theme, error: '' }); expect(write).not.toHaveBeenCalled();
  });
  it.each([null, '', 'invalid', 'Dark', '{}'])('uses OS for invalid or missing preference %j without deleting it', (saved) => {
    os(true); if (saved !== null) localStorage.setItem(THEME_KEY, saved);
    expect(readTheme()).toEqual({ theme: 'dark', error: '' }); expect(localStorage.getItem(THEME_KEY)).toBe(saved);
  });
  it('defaults to light with no matchMedia', () => { expect(readTheme().theme).toBe('light'); });
  it('defaults safely when matchMedia throws', () => {
    vi.stubGlobal('matchMedia', () => { throw new Error('unsupported'); });
    expect(readTheme()).toEqual({ theme: 'light', error: '' });
    const stop = subscribeTheme(() => {}); stop();
  });
  it('reports SecurityError and still uses OS when the storage getter is unavailable', () => {
    os(true); vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    expect(readTheme()).toEqual({ theme: 'dark', error: THEME_STORAGE_ERROR });
    expect(saveTheme('light')).toEqual({ success: false, error: THEME_STORAGE_ERROR });
  });
  it('reports read failures', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readTheme()).toEqual({ theme: 'light', error: THEME_STORAGE_ERROR });
  });
  it.each(['dark', 'light'])('persists %s without touching other keys', (theme) => {
    localStorage.setItem('unrelated', 'keep');
    expect(saveTheme(theme)).toEqual({ success: true, error: '' });
    expect(localStorage.getItem(THEME_KEY)).toBe(theme); expect(localStorage.getItem('unrelated')).toBe('keep');
  });
  it.each([null, 'invalid', {}, 1])('rejects invalid save %j without overwriting preference', (value) => {
    localStorage.setItem(THEME_KEY, 'dark'); expect(saveTheme(value).success).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });
  it('reports quota and does not falsely persist a change', () => {
    localStorage.setItem(THEME_KEY, 'light');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    expect(saveTheme('dark')).toEqual({ success: false, error: THEME_STORAGE_ERROR });
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
  it('applies valid root tokens and falls back for invalid theme', () => {
    applyTheme('dark'); expect(document.documentElement.dataset.theme).toBe('dark'); expect(document.documentElement.style.colorScheme).toBe('dark');
    applyTheme('invalid'); expect(document.documentElement.dataset.theme).toBe('light');
  });
  it.each([false, true])('tracks OS until explicit preference and cleans up listeners (legacy %s)', (legacy) => {
    const browser = os(false, legacy); const { result, unmount } = renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe('light'); browser.change(true);
    expect(result.current.theme).toBe('dark');
    act(() => result.current.toggleTheme()); expect(localStorage.getItem(THEME_KEY)).toBe('light');
    browser.change(true); expect(result.current.theme).toBe('light');
    unmount(); expect(browser.listeners.size).toBe(0);
  });
  it('syncs actual cross-tab preference/removal/clear and ignores unrelated and session storage', () => {
    os(true); const { result, unmount } = renderHook(() => useTheme());
    localStorage.setItem(THEME_KEY, 'light');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' })));
    expect(result.current.theme).toBe('dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, storageArea: sessionStorage })));
    expect(result.current.theme).toBe('dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, storageArea: localStorage })));
    expect(result.current.theme).toBe('light');
    localStorage.removeItem(THEME_KEY);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY })));
    expect(result.current.theme).toBe('dark');
    localStorage.setItem(THEME_KEY, 'light');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(result.current.theme).toBe('light'); unmount();
    localStorage.setItem(THEME_KEY, 'dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY })));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
  it('keeps failed toggles temporary, shows error and supports a successful retry', () => {
    const { result } = renderHook(() => useTheme());
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    act(() => result.current.toggleTheme());
    expect(result.current).toMatchObject({ theme: 'dark', error: THEME_STORAGE_ERROR });
    expect(document.documentElement.dataset.theme).toBe('dark'); expect(localStorage.getItem(THEME_KEY)).toBeNull();
    write.mockRestore(); act(() => result.current.toggleTheme());
    expect(result.current).toMatchObject({ theme: 'light', error: '' }); expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });
  it('exposes unavailable storage during a cross-tab sync', () => {
    const { result } = renderHook(() => useTheme());
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('blocked'); });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, storageArea: sessionStorage })));
    expect(result.current.error).toBe(THEME_STORAGE_ERROR);
  });
});
