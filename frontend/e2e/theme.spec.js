/** Verify real appearance journeys on inherited desktop/mobile projects; execution is deferred. */
import { test, expect } from '@playwright/test';

let errors;
let remoteRequests;
test.beforeEach(async ({ page, baseURL }) => {
  errors = [];
  remoteRequests = [];
  // Install observers before the first navigation so startup failures are not missed.
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== new URL(baseURL).origin) {
      remoteRequests.push(request.url());
    }
  });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
  expect(remoteRequests).toEqual([]);
});

/** Assert text contrast against the nearest painted ancestor, using real computed styles. */
async function readable(locator) {
  await expect(locator).toBeVisible();
  const ratio = await locator.evaluate((element) => {
    /** Convert an opaque computed RGB color to relative luminance. */
    function luminance(color) {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    let painted = element;
    while (painted.parentElement && getComputedStyle(painted).backgroundColor === 'rgba(0, 0, 0, 0)') {
      painted = painted.parentElement;
    }
    const foreground = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(painted).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}

/** Verify navigation fits the viewport rather than masking overflow globally. */
async function navigationFits(page) {
  const banner = page.getByRole('banner');
  for (const label of ['Home', 'Apply', 'Admin']) {
    await expect(banner.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of await banner.locator('a, button').all()) {
    const box = await control.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  }
}

/** Authenticate through public UI without injecting a session or deep-linking. */
async function login(page, role) {
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Account role').selectOption(role);
  await readable(page.getByLabel('Username', { exact: true }));
  await page.getByLabel('Username', { exact: true }).fill(role === 'admin' ? 'admin' : 'alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill(role === 'admin' ? 'admin' : 'password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

for (const theme of ['light', 'dark']) {
  test(`${theme} appearance persists and keeps public/candidate/recruiter controls readable`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await navigationFits(page);
    const toggle = page.getByRole('button', { name: /^Dark theme \(current:/ });
    await toggle.click();
    const opposite = theme === 'dark' ? 'light' : 'dark';
    await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
    await toggle.click();
    await page.emulateMedia({ colorScheme: opposite });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe(theme);
    await page.getByRole('banner').getByRole('link', { name: 'Apply', exact: true }).click();
    await readable(page.getByLabel('Full name'));
    await readable(page.getByRole('button', { name: /Submit/i }).first());
    await page.getByRole('banner').getByRole('link', { name: 'Home', exact: true }).click();
    await login(page, 'candidate');
    await navigationFits(page);
    await readable(page.getByLabel('Full name'));
    await readable(page.getByLabel('Department', { exact: true }));
    await page.getByRole('button', { name: 'Save contact details' }).click();
    await expect(page.getByText('Contact details saved.', { exact: true })).toBeVisible();
    const engineering = page.getByRole('article', { name: 'Engineering application' });
    await engineering.getByText('Application details and materials', { exact: true }).click();
    await readable(engineering.getByRole('link', { name: 'Open portfolio (new tab)' }));
    expect(await engineering.getByRole('list', { name: 'Application progress' }).evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.right <= window.innerWidth && getComputedStyle(element).overflowX === 'auto';
    })).toBe(true);
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await login(page, 'admin');
    await navigationFits(page);
    await readable(page.getByLabel('Search name or email'));
    await readable(page.getByRole('button', { name: 'Engineering', exact: true }));
    for (const status of ['applied', 'review', 'interview', 'offer', 'archived']) {
      const select = page.getByRole('combobox', { name: 'Status for Alex Morgan Engineering submission-1' });
      await select.selectOption(status);
      await readable(select);
    }
    await page.getByRole('button', { name: 'edit Alex Morgan Engineering submission-1' }).click();
    const dialog = page.getByRole('dialog');
    await readable(dialog.getByLabel('Full name'));
    await readable(dialog.getByRole('button', { name: 'Save changes' }));
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'notes Alex Morgan Engineering submission-1' }).click();
    await readable(dialog.getByLabel('Internal notes'));
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'materials Alex Morgan Engineering submission-1' }).click();
    await readable(dialog.locator('pre'));
    await readable(dialog.getByRole('link', { name: 'Open portfolio (new tab)' }));
    await dialog.getByRole('button', { name: 'Close materials' }).click();
  });

  test(`${theme} OS preference follows live changes and reload when no choice is saved`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const opposite = theme === 'light' ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: opposite });
    await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', opposite);
    expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBeNull();
    await navigationFits(page);
  });
}
