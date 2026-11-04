/** Exercise login-local dark colors and unchanged demo login in real browsers. */
import { test, expect } from '@playwright/test';

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
});
test.afterEach(() => {
  expect(errors, 'Console and uncaught browser errors').toEqual([]);
});

test('toggle preserves input and errors, dark login succeeds and dashboard stays light', async ({ page }, testInfo) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const banner = page.getByRole('banner');
  const bannerColor = await banner.evaluate((node) => getComputedStyle(node).backgroundColor);
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  const main = page.getByRole('main');
  const toggle = page.getByRole('button', { name: 'Dark mode' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.auth-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(main).toHaveCSS('background-color', 'rgb(18, 21, 25)');
  await expect(main).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('.auth-card')).toHaveCSS('background-color', 'rgb(28, 32, 38)');
  await expect(page.getByLabel('Username', { exact: true })).toHaveCSS('color', 'rgb(241, 245, 249)');
  await expect(banner).toHaveCSS('background-color', bannerColor);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
  await expect(page.getByRole('alert')).toHaveCSS('color', 'rgb(255, 180, 180)');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(main).toHaveCSS('color-scheme', 'light');
  await expect(main).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.auth-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.getByLabel('Username', { exact: true })).toHaveCSS('color', 'rgb(30, 41, 59)');
  await expect(page.getByLabel('Password', { exact: true })).toHaveCSS('color', 'rgb(30, 41, 59)');
  await expect(page.getByRole('alert')).toHaveCSS('color', 'rgb(220, 38, 38)');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(main).toHaveCSS('color-scheme', 'dark');
  await expect(main).toHaveCSS('background-color', 'rgb(18, 21, 25)');
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('admin');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('wrong');
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
  await page.screenshot({ path: testInfo.outputPath('dark-login-error.png'), fullPage: true });
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-login-theme]')).toHaveCount(0);
  await expect(page.locator('.dashboard-table-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(banner).toHaveCSS('background-color', bannerColor);
  await banner.getByRole('button', { name: 'Logout', exact: true }).click();
  await banner.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('theme never leaks to public pages and resets on revisit and reload despite OS dark preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const bodyColor = await page.locator('html').evaluate((node) => getComputedStyle(node).backgroundColor);
  await nav.getByRole('link', { name: 'Apply', exact: true }).click();
  const formColor = await page.locator('.submission-form').evaluate((node) => getComputedStyle(node).backgroundColor);
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Dark mode' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('html')).toHaveCSS('background-color', bodyColor);
  await nav.getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.submission-form')).toHaveCSS('background-color', formColor);
  await expect(page.locator('[data-login-theme]')).toHaveCount(0);
  await expect(toggle).toHaveCount(0);
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.locator('[data-login-theme]')).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.auth-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })))
    .toEqual({ local: 0, session: 0 });
});
