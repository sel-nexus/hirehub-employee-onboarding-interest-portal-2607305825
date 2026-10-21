/** Exercise the real demo login lifecycle in the existing desktop/mobile projects. */
import { test, expect } from '@playwright/test';

/** Attach browser error listeners before the only initial navigation. */
test.beforeEach(async ({ page }) => {
  page.authErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      page.authErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    page.authErrors.push(error.message);
  });
  await page.goto('/');
});

/** Fail every journey that emits a console error or uncaught page error. */
test.afterEach(async ({ page }) => {
  expect(page.authErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Verify the gate, invalid credentials, persistence, shared header and logout. */
test('demo session survives reload and logout restores the Admin login gate', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Admin Login' })).toBeVisible();
  await expect(page.getByText('Demo credentials: admin/admin')).toBeVisible();
  await expect(page.getByText('Browser-only demo. This is not real authentication or secure access control.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();

  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();

  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');
  await expect(page.getByRole('status')).toHaveText('Demo admin session is active.');
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('status')).toHaveText('Demo admin session is active.');
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');

  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Demo admin session is active.');

  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();

  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
});
