/** Exercise the real demo login lifecycle in the existing desktop/mobile projects. */
import { test, expect } from '@playwright/test';

/** Attach browser error listeners to each page before its first navigation. */
function captureAuthErrors(page) {
  page.authErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      page.authErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    page.authErrors.push(error.message);
  });
}

/** Capture failures before the original page's initial navigation. */
test.beforeEach(async ({ page }) => {
  captureAuthErrors(page);
  await page.goto('/');
});

/** Fail every journey that emits a console error or uncaught page error. */
test.afterEach(async ({ page }) => {
  expect(page.authErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Verify the gate, invalid credentials, persistence, shared header and logout. */
test('demo session survives reload and logout restores the Admin login gate', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const banner = page.getByRole('banner');
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Admin Login' })).toBeVisible();
  await expect(page.getByText('Demo credentials: admin/admin')).toBeVisible();
  await expect(page.getByText('Browser-only demo. This is not real authentication or secure access control.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();

  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();

  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');
  await expect(page.getByRole('heading', { level: 1, name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');

  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();

  await banner.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
  await expect(banner.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();

  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(banner.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
});

/** Prove real tab closure ends auth while origin-local candidate records survive. */
test('closing the authenticated tab preserves submissions but requires a fresh login', async ({ page, context }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Apply', exact: true }).click();
  await page.getByLabel('Full Name').fill('Alice Smith');
  await page.getByLabel('Email Address').fill('alice@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText('Thank you! Your interest has been submitted successfully.');
  const originalStorage = await page.evaluate(() => localStorage.getItem('hirehub_submissions'));
  const originalRecords = JSON.parse(originalStorage);
  expect(originalRecords).toEqual([{
    id: expect.any(String),
    fullName: 'Alice Smith',
    email: 'alice@example.com',
    mobile: '0123456789',
    department: 'Engineering',
    submittedAt: expect.any(String),
  }]);

  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'alice@example.com', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(originalStorage);

  // Close the actual logged-in page, without logout or manually clearing auth.
  await page.close();
  expect(page.isClosed()).toBe(true);
  const freshPage = await context.newPage();
  captureAuthErrors(freshPage);
  try {
    expect(await freshPage.opener()).toBeNull();
    await freshPage.goto('/');
    expect(await freshPage.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(originalStorage);
    expect(await freshPage.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
    await expect(freshPage.getByRole('banner').getByRole('link', { name: 'Login', exact: true })).toBeVisible();
    const freshNav = freshPage.getByRole('navigation', { name: 'Main navigation' });
    await freshNav.getByRole('link', { name: 'Admin', exact: true }).click();
    await expect(freshPage).toHaveURL(/\/admin$/);
    await expect(freshPage.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await expect(freshPage.getByRole('heading', { name: 'Submissions Dashboard' })).toHaveCount(0);
    await expect(freshPage.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
    expect(await freshPage.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();

    await freshPage.getByLabel('Username', { exact: true }).fill('admin');
    await freshPage.getByLabel('Password', { exact: true }).fill('admin');
    await freshPage.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(freshPage).toHaveURL(/\/admin$/);
    await expect(freshPage.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    await expect(freshPage.getByRole('banner').getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    await expect(freshPage.getByText('No submissions yet.', { exact: true })).toHaveCount(0);
    const row = freshPage.getByRole('row').filter({ hasText: originalRecords[0].email });
    await expect(row).toHaveCount(1);
    const formattedDate = new Date(originalRecords[0].submittedAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    for (const value of ['1', 'Alice Smith', 'alice@example.com', '0123456789', 'Engineering', formattedDate]) {
      await expect(row.getByRole('cell', { name: value, exact: true })).toBeVisible();
    }
    expect(await freshPage.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(originalStorage);
    expect(await freshPage.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');
  } finally {
    await freshPage.close();
    expect.soft(page.authErrors, 'Original tab console and uncaught page errors').toEqual([]);
    expect.soft(freshPage.authErrors, 'Fresh tab console and uncaught page errors').toEqual([]);
  }
});
