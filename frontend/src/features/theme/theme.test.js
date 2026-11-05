/** Verify appearance preferences at real DOM and injectable browser boundaries. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createThemeController, parseTheme, THEME_KEY } from './theme';

const controllers = [];
afterEach(() => {
  controllers.forEach((controller) => controller.dispose());
  controllers.length = 0;
  localStorage.clear();
  vi.restoreAllMocks();
});

/** Provide observable media/listener boundaries without mocking theme logic. */
function environment({ saved = null, dark = false, legacy = false } = {}) {
  const events = new EventTarget();
  const mediaEvents = new EventTarget();
  const media = { matches: dark };
  if (legacy) {
    media.addListener = (listener) => mediaEvents.addEventListener('change', listener);
    media.removeListener = (listener) => mediaEvents.removeEventListener('change', listener);
  } else {
    media.addEventListener = mediaEvents.addEventListener.bind(mediaEvents);
    media.removeEventListener = mediaEvents.removeEventListener.bind(mediaEvents);
  }
  if (saved !== null) localStorage.setItem(THEME_KEY, saved);
  const browser = {
    document, localStorage,
    matchMedia: () => media,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  return {
    browser,
    changeOS(value) {
      media.matches = value;
      mediaEvents.dispatchEvent(new Event('change'));
    },
    storage(key, newValue, storageArea = localStorage) {
      events.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea }));
    },
    start() {
      const controller = createThemeController(browser);
      controllers.push(controller);
      return controller;
    },
  };
}

describe('theme controller', () => {
  it.each(['light', 'dark'])('persists and applies %s including native controls', (theme) => {
    const controller = environment().start();
    expect(controller.setTheme(theme)).toMatchObject({ success: true, theme, error: '' });
    expect(localStorage.getItem(THEME_KEY)).toBe(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(document.documentElement.style.colorScheme).toBe(theme);
  });

  it.each(['light', 'dark'])('saved %s overrides the opposite OS preference', (saved) => {
    const env = environment({ saved, dark: saved === 'light' });
    const controller = env.start();
    env.changeOS(saved !== 'light');
    expect(controller.getSnapshot().theme).toBe(saved);
  });

  it.each([null, '', 'DARK', '"dark"', '{}', 'null'])('uses live OS for corrupt/missing %s', (saved) => {
    const env = environment({ saved, dark: true });
    const controller = env.start();
    expect(controller.getSnapshot().theme).toBe('dark');
    env.changeOS(false);
    expect(controller.getSnapshot().theme).toBe('light');
    expect(parseTheme(saved)).toBeNull();
  });

  it('rejects invalid choices without changing DOM or storage', () => {
    const controller = environment().start();
    expect(controller.setTheme({ theme: 'dark' }).success).toBe(false);
    expect(controller.getSnapshot().theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('retains a failed manual save in this tab, reports failure and allows retry', () => {
    const env = environment();
    const controller = env.start();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    expect(controller.setTheme('dark')).toMatchObject({ success: false, theme: 'dark' });
    expect(controller.getSnapshot().error).toContain('not saved');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    env.changeOS(false);
    expect(controller.getSnapshot().theme).toBe('dark');
    write.mockRestore();
    expect(controller.setTheme('light').success).toBe(true);
    expect(controller.getSnapshot().error).toBe('');
  });

  it('uses OS and reports denied reads, including a throwing storage getter', () => {
    const env = environment({ dark: true });
    Object.defineProperty(env.browser, 'localStorage', { get() { throw new Error('Denied'); } });
    const controller = env.start();
    expect(controller.getSnapshot()).toMatchObject({ theme: 'dark' });
    expect(controller.getSnapshot().error).toContain('could not be read');
    expect(controller.setTheme('light').success).toBe(false);
  });

  it('synchronizes cross-tab saves, corruption and clearing but ignores unrelated storage', () => {
    const env = environment({ dark: true });
    const controller = env.start();
    env.storage(THEME_KEY, 'light');
    expect(controller.getSnapshot().theme).toBe('light');
    env.storage('another_key', 'dark');
    env.storage(THEME_KEY, 'dark', sessionStorage);
    expect(controller.getSnapshot().theme).toBe('light');
    env.storage(THEME_KEY, '{}');
    expect(controller.getSnapshot().theme).toBe('dark');
    env.storage(THEME_KEY, 'light');
    env.storage(null, null);
    expect(controller.getSnapshot().theme).toBe('dark');
    env.storage(THEME_KEY, null);
    env.changeOS(false);
    expect(controller.getSnapshot().theme).toBe('light');
  });

  it.each([false, true])('cleans listeners and subscriptions safely (legacy %s)', (legacy) => {
    const env = environment({ legacy });
    const controller = env.start();
    const updates = [];
    const stop = controller.subscribe((snapshot) => updates.push(snapshot.theme));
    env.changeOS(true);
    expect(updates).toEqual(['dark']);
    stop();
    stop();
    env.changeOS(false);
    expect(updates).toEqual(['dark']);
    controller.dispose();
    controller.dispose();
    env.changeOS(true);
    env.storage(THEME_KEY, 'dark');
    expect(controller.getSnapshot().theme).toBe('light');
    expect(controller.setTheme('dark').success).toBe(false);
  });

  it('falls back to light when media is absent or throws', () => {
    for (const matchMedia of [undefined, () => { throw new Error('Unavailable'); }]) {
      const env = environment();
      env.browser.matchMedia = matchMedia;
      const controller = env.start();
      expect(controller.getSnapshot().theme).toBe('light');
      expect(controller.setTheme('dark').success).toBe(true);
      controller.dispose();
      localStorage.clear();
    }
  });
});

describe('before-paint initialization', () => {
  const html = readFileSync('index.html', 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  it.each([
    ['dark', false, false, 'dark'], ['light', true, false, 'light'],
    ['{}', true, false, 'dark'], [null, false, false, 'light'],
    [null, true, true, 'dark'], ['"dark"', false, false, 'light'],
  ])('initializes saved %s and OS %s with denied storage %s', (saved, dark, denied, expected) => {
    const storage = { getItem() { if (denied) throw new Error('Denied'); return saved; } };
    const browser = { matchMedia: () => ({ matches: dark }) };
    new Function('localStorage', 'window', 'document', script)(storage, browser, document);
    expect(document.documentElement.dataset.theme).toBe(expected);
    expect(document.documentElement.style.colorScheme).toBe(expected);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('src="/src/main.jsx"'));
  });
});
