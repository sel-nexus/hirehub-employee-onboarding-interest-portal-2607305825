/** Specify real light/dark UI journeys and evidence; do not execute during the theme slice. */
import { test, expect } from '@playwright/test';

const browserErrors = new WeakMap();

/** Observe every page, including real cross-tab synchronization journeys, before navigation. */
test.beforeEach(async ({ page, context }) => {
  const errors = [];
  const observed = new WeakSet();
  browserErrors.set(context, errors);
  /** Capture console failures and uncaught exceptions once per page. */
  function observe(target) {
    if (observed.has(target)) return;
    observed.add(target);
    target.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    target.on('pageerror', (error) => errors.push(error.message));
  }
  observe(page);
  context.on('page', observe);
  // Record the theme when React first inserts content, without changing application behavior.
  await context.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const root = document.getElementById('root');
      if (root?.childElementCount) {
        window.themeAtFirstRender = document.documentElement.dataset.theme;
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
});

/** Attach final evidence even on failed assertions, and fail on any browser error. */
test.afterEach(async ({ page, context }, testInfo) => {
  try {
    if (!page.isClosed() && page.url() !== 'about:blank') await captureState(page, testInfo, 'final');
  } finally {
    expect(browserErrors.get(context), 'Console and uncaught page errors').toEqual([]);
  }
});

/** Save screenshot, actual HTML, ARIA tree and computed layout/theme evidence for the report. */
async function captureState(page, testInfo, state) {
  const prefix = `${testInfo.project.name}-${state}`;
  await testInfo.attach(`${prefix}-screenshot`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await testInfo.attach(`${prefix}-html`, { body: await page.content(), contentType: 'text/html' });
  await testInfo.attach(`${prefix}-aria`, { body: await page.locator('body').ariaSnapshot(), contentType: 'text/yaml' });
  const styles = await page.evaluate(() => {
    const selectors = ['html', '.site-header', '.main-nav', '.theme-toggle', '.hero', '.auth-card', 'input', 'select', 'textarea', '.candidate-layout', '.candidate-application', '.stage-stepper', '.stage-step.is-current', '.candidate-status', '.dashboard-stats', '.table-scroll', '.edit-overlay', '.edit-dialog', '.resume-drawer', "footer[aria-label='Demo utilities']"];
    return Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const css = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return [selector, {
        theme: document.documentElement.dataset.theme, colorScheme: css.colorScheme,
        color: css.color, backgroundColor: css.backgroundColor, borderColor: css.borderColor,
        outlineColor: css.outlineColor, outlineStyle: css.outlineStyle, outlineWidth: css.outlineWidth,
        fontFamily: css.fontFamily, fontSize: css.fontSize, padding: css.padding,
        display: css.display, gap: css.gap, gridTemplateColumns: css.gridTemplateColumns,
        overflowX: css.overflowX, overflowY: css.overflowY, maxHeight: css.maxHeight,
        width: rect.width, height: rect.height, top: rect.top, left: rect.left,
        scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      }];
    }));
  });
  await testInfo.attach(`${prefix}-computed-styles`, { body: JSON.stringify(styles, null, 2), contentType: 'application/json' });
}

/** Assert applied tokens, native color scheme, and the minimum theme-control target. */
async function expectTheme(page, theme) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('html')).toHaveCSS('color-scheme', theme);
  await expect(page.locator('html')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(15, 23, 42)' : 'rgb(248, 250, 252)');
  const toggle = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme` });
  await expect(toggle).toHaveAttribute('aria-pressed', String(theme === 'dark'));
  const rect = await toggle.boundingBox();
  expect(rect.width).toBeGreaterThanOrEqual(44);
  expect(rect.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('.site-header')).toHaveCSS('color', 'rgb(255, 255, 255)');
}

/** Check intrinsic page containment; wide recruiter tables must scroll only in their own region. */
async function expectNoOverflow(page) {
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    header: [...document.querySelectorAll('.site-header a, .theme-toggle')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }),
  }));
  expect(layout.root).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.body).toBeLessThanOrEqual(layout.viewport + 1);
  for (const rect of layout.header) {
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(layout.viewport + 1);
  }
  if (await page.locator('.table-scroll').count()) {
    await expect(page.locator('.table-scroll')).toHaveCSS('overflow-x', 'auto');
    const table = await page.locator('.table-scroll').evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }));
    expect(table.scroll).toBeGreaterThanOrEqual(table.width);
  }
}

/** Assert the real dialog stays inside the visual viewport and owns its vertical scrolling. */
async function expectDialog(page, theme) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('background-color', theme === 'dark' ? 'rgb(30, 41, 59)' : 'rgb(255, 255, 255)');
  await expect(dialog).toHaveCSS('overflow-y', 'auto');
  const bounds = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: innerWidth, height: innerHeight };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
}

for (const osTheme of ['light', 'dark']) {
  test.describe(`OS ${osTheme}`, () => {
    test.use({ colorScheme: osTheme });

    test('defaults to OS before React, toggles and persists across navigation and reload', async ({ page }, testInfo) => {
      await page.goto('/');
      await expectTheme(page, osTheme);
      expect(await page.evaluate(() => window.themeAtFirstRender)).toBe(osTheme);
      expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBeNull();
      const chosen = osTheme === 'dark' ? 'light' : 'dark';
      await page.getByRole('button', { name: `Switch to ${chosen} theme` }).click();
      await expectTheme(page, chosen);
      expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe(chosen);
      await page.getByRole('navigation').getByRole('link', { name: 'Apply', exact: true }).click();
      await expect(page).toHaveURL(/\/apply$/);
      await expect(page.getByLabel('Full Name', { exact: true })).toBeVisible();
      await expectTheme(page, chosen);
      await expectNoOverflow(page);
      await captureState(page, testInfo, 'apply');
      await page.reload();
      await expectTheme(page, chosen);
      expect(await page.evaluate(() => window.themeAtFirstRender)).toBe(chosen);
      await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).click();
      await expect(page.locator('.hero')).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expectNoOverflow(page);
    });

    test('a valid saved choice wins over the opposite OS default', async ({ page }) => {
      const saved = osTheme === 'dark' ? 'light' : 'dark';
      await page.addInitScript((value) => localStorage.setItem('hirehub_theme', value), saved);
      await page.goto('/');
      await expectTheme(page, saved);
      expect(await page.evaluate(() => window.themeAtFirstRender)).toBe(saved);
      await expectNoOverflow(page);
    });

    test('an invalid saved preference safely falls back to the OS', async ({ page }) => {
      await page.addInitScript(() => {
        if (localStorage.getItem('hirehub_theme') === null) localStorage.setItem('hirehub_theme', '"dark"');
      });
      await page.goto('/');
      await expectTheme(page, osTheme);
      expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe('"dark"');
      await page.getByRole('button', { name: `Switch to ${osTheme === 'dark' ? 'light' : 'dark'} theme` }).click();
      await page.reload();
      await expectTheme(page, osTheme === 'dark' ? 'light' : 'dark');
    });
  });
}

for (const theme of ['light', 'dark']) {
  test.describe(`${theme} representative pages`, () => {
    test.use({ colorScheme: 'light' });
    test('registration, candidate, recruiter, preview and editor remain usable at the project viewport', async ({ page }, testInfo) => {
      await page.goto('/');
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      await expectTheme(page, theme);
      const nav = page.getByRole('navigation', { name: 'Main navigation' });
      await nav.getByRole('link', { name: 'Register', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Create candidate account' })).toBeVisible();
      await expect(page.getByLabel('Full Name')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(30, 41, 59)' : 'rgb(255, 255, 255)');
      await expectNoOverflow(page);
      await captureState(page, testInfo, `${theme}-register`);
      await page.locator('.site-header').getByRole('link', { name: 'Login', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Candidate', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.getByLabel('Username').fill('alex@example.com');
      await page.getByLabel('Password', { exact: true }).fill('password123');
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page).toHaveURL(/\/candidate$/);
      await expect(page.getByRole('heading', { name: 'Contact profile' })).toBeVisible();
      await expect(page.locator('.candidate-status')).toContainText('Interview Scheduled');
      const steps = page.getByRole('list', { name: 'Application progress' });
      for (const label of ['Application Received', 'Profile Screening', 'Interview Scheduled', 'Final Decision']) {
        await expect(steps.getByText(label, { exact: true })).toBeVisible();
      }
      await expect(steps.locator('[aria-current="step"]')).toContainText('Interview Scheduled');
      await expect(page.locator('.candidate-next-steps')).toContainText('Prepare for your interview');
      await page.getByRole('button', { name: 'Edit profile' }).click();
      const profileName = page.getByRole('form', { name: 'Edit contact profile' }).getByLabel('Full Name');
      await expect(profileName).toBeFocused();
      await expect(profileName).toHaveCSS('outline-style', 'solid');
      await expect(profileName).toHaveCSS('outline-width', '2px');
      await expect(profileName).toHaveCSS('outline-color', theme === 'dark' ? 'rgb(165, 180, 252)' : 'rgb(79, 70, 229)');
      await expectNoOverflow(page);
      await captureState(page, testInfo, `${theme}-candidate-profile`);
      await page.getByRole('form', { name: 'Edit contact profile' }).getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.locator('.site-header').getByRole('button', { name: 'Logout' }).click();
      await nav.getByRole('link', { name: 'Admin', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Administrator / Recruiter' })).toHaveAttribute('aria-selected', 'true');
      await page.getByLabel('Username').fill('admin');
      await page.getByLabel('Password', { exact: true }).fill('admin');
      await page.getByRole('button', { name: 'Login', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
      await expect(page.getByRole('table', { name: 'Submissions' }).locator('tbody tr')).toHaveCount(8);
      await expect(page.locator('.stat-total dd')).toHaveText('8');
      await expectNoOverflow(page);
      const statusColors = await page.locator('section[aria-label="Pipeline distribution"] dl > div').evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
      expect(new Set(statusColors).size).toBe(5);
      await page.getByLabel('Search by name or email').fill('alex@example.com');
      await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
      await captureState(page, testInfo, `${theme}-recruiter`);
      const preview = page.getByRole('button', { name: 'Preview resume and portfolio for Alex Rivera, alex@example.com', exact: true });
      await preview.click();
      await expectDialog(page, theme);
      await expect(page.getByRole('region', { name: 'Mock resume text' })).toContainText('Frontend Software Engineer');
      await expect(page.getByRole('button', { name: 'Close preview' })).toBeFocused();
      await captureState(page, testInfo, `${theme}-drawer`);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(preview).toBeFocused();
      await page.getByRole('button', { name: 'Edit submission for Alex Rivera, alex@example.com', exact: true }).click();
      await expectDialog(page, theme);
      await page.getByLabel('Recruiter Notes (private)').focus();
      await expect(page.getByLabel('Recruiter Notes (private)')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(30, 41, 59)' : 'rgb(255, 255, 255)');
      await captureState(page, testInfo, `${theme}-notes-editor`);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.reload();
      await expectTheme(page, theme);
      await expectNoOverflow(page);
    });
  });
}

test.describe('storage recovery and cross-tab state', () => {
  test.use({ colorScheme: 'light' });
  test('real quota exhaustion switches immediately, warns, and saves again after space is freed', async ({ page }, testInfo) => {
    await page.goto('/');
    // The home route renders only after demo data seeding has completed.
    await expect(page.locator('.hero')).toBeVisible();
    await expectTheme(page, 'light');
    expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBeNull();
    const fillerKey = 'hirehub_e2e_theme_quota_filler';
    try {
      const quota = await page.evaluate((key) => {
        // Search to single-character precision; failed real writes retain the last successful fill.
        const limit = 10 * 1024 * 1024;
        let low = 0;
        let high = limit;
        let largestFill = 0;
        let quotaFailures = 0;
        while (low <= high) {
          const size = Math.floor((low + high) / 2);
          try {
            localStorage.setItem(key, 'x'.repeat(size));
            largestFill = size;
            low = size + 1;
          } catch (error) {
            if (error.name !== 'QuotaExceededError') throw error;
            quotaFailures += 1;
            high = size - 1;
          }
        }
        return { largestFill, quotaFailures, retainedFill: localStorage.getItem(key)?.length };
      }, fillerKey);
      expect(quota.quotaFailures, 'The bounded fill must exhaust the actual browser quota').toBeGreaterThan(0);
      expect(quota.largestFill).toBeGreaterThan(0);
      expect(quota.retainedFill).toBe(quota.largestFill);
      await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      await expectTheme(page, 'dark');
      await expect(page.locator('#theme-warning')).toBeVisible();
      await expect(page.locator('#theme-warning')).toContainText('could not be saved');
      expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBeNull();
      await expectNoOverflow(page);
      await captureState(page, testInfo, 'quota-warning');
    } finally {
      await page.evaluate((key) => localStorage.removeItem(key), fillerKey);
    }
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expectTheme(page, 'light');
    await expect(page.locator('#theme-warning')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe('light');
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expectTheme(page, 'dark');
    expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe('dark');
    await page.reload();
    await expectTheme(page, 'dark');
    expect(await page.evaluate(() => window.themeAtFirstRender)).toBe('dark');
  });

  // Unavailable-read exceptions and their warning remain covered by Header/theme unit tests.
  test('a real malformed saved theme falls back to the OS and leaves navigation and saving usable', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.hero')).toBeVisible();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expectTheme(page, 'dark');
    await page.evaluate(() => localStorage.setItem('hirehub_theme', 'not-a-valid-theme'));
    await page.reload();
    await expectTheme(page, 'light');
    expect(await page.evaluate(() => window.themeAtFirstRender)).toBe('light');
    expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe('not-a-valid-theme');
    await expect(page.locator('#theme-warning')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Apply', exact: true }).click();
    await expect(page).toHaveURL(/\/apply$/);
    await expect(page.getByLabel('Full Name', { exact: true })).toBeVisible();
    await page.getByLabel('Full Name', { exact: true }).fill('Theme Recovery');
    await expect(page.getByLabel('Full Name', { exact: true })).toHaveValue('Theme Recovery');
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expectTheme(page, 'dark');
    await expect(page.locator('#theme-warning')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe('dark');
    await expectNoOverflow(page);
    await page.reload();
    await expectTheme(page, 'dark');
    expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe('dark');
    await expect(page.getByLabel('Full Name', { exact: true })).toBeVisible();
  });

  test('a real toggle in another tab synchronizes this tab without synthetic storage events', async ({ page, context }) => {
    await page.goto('/');
    const other = await context.newPage();
    await other.goto('/');
    await other.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expectTheme(page, 'dark');
    await expectTheme(other, 'dark');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expectTheme(other, 'light');
    await other.close();
  });
});
