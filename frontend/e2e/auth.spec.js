/** Exercise persistent local role access through real desktop/mobile UI navigation. */
import { test, expect } from '@playwright/test';
import { DEFAULT_USERS } from '../src/features/demo/mockData';

/** Capture console errors and uncaught errors before any page navigation. */
function captureAuthErrors(page) {
  page.authErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') page.authErrors.push(message.text());
  });
  page.on('pageerror', (error) => page.authErrors.push(error.message));
}

test.beforeEach(async ({ page }) => {
  captureAuthErrors(page);
  await page.goto('/');
});
test.afterEach(async ({ page }) => {
  expect(page.authErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Read the real persisted identity without manufacturing a login. */
async function identity(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
}

/** Enter credentials using real labelled fields and the submit button. */
async function signIn(page, username, password) {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

/** Assert the actual identity matches seeded accounts and contains no password. */
async function expectIdentity(page, user) {
  const session = await identity(page);
  expect(session).toEqual({ userId: user.id, role: user.role, displayName: user.displayName, loginTimestamp: expect.any(String) });
  expect(new Date(session.loginTimestamp).toISOString()).toBe(session.loginTimestamp);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
  return session;
}

test('invalid recruiter login, persistent dashboard, navigation and logout gate', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const banner = page.getByRole('banner');
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByText('Demo credentials: admin/admin or recruiter@hirehub.demo/admin123')).toBeVisible();
  await expect(page.getByText('Browser-only demo. This is not real authentication or secure access control.')).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Logout' })).toHaveCount(0);
  expect(await identity(page)).toBeNull();
  await signIn(page, 'admin', 'wrong');
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Logout' })).toHaveCount(0);
  expect(await identity(page)).toBeNull();
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const session = await expectIdentity(page, DEFAULT_USERS[0]);
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(9);
  await expect(page.getByRole('cell', { name: 'alex@example.com', exact: true })).toBeVisible();
  await expect(page.getByText('No submissions yet.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toHaveCount(0);
  await expect(banner.getByRole('button', { name: 'Logout' })).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Login', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(9);
  expect(await identity(page)).toEqual(session);
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Logout' })).toBeVisible();
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(9);
  await banner.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  expect(await identity(page)).toBeNull();
  await expect(banner.getByRole('button', { name: 'Logout' })).toHaveCount(0);
  await expect(banner.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  expect(await identity(page)).toBeNull();
});

for (const user of DEFAULT_USERS) {
  test(`supplied ${user.username} credentials enter only the matching portal`, async ({ page }) => {
    const banner = page.getByRole('banner');
    await banner.getByRole('link', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    const candidateTab = page.getByRole('tab', { name: 'Candidate', exact: true });
    const adminTab = page.getByRole('tab', { name: 'Administrator / Recruiter' });
    if (user.role === 'admin') await adminTab.click();
    await signIn(page, user.username, user.password);
    await expect(page).toHaveURL(user.role === 'admin' ? /\/admin$/ : /\/candidate$/);
    const session = await expectIdentity(page, user);
    if (user.role === 'candidate') {
      await expect(page.getByText(`Welcome, ${user.displayName}.`)).toBeVisible();
      await expect(page.getByText(/Application progress and contact profile tools are not available/)).toBeVisible();
      await expect(banner.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
      await page.getByRole('link', { name: 'Recruiter access' }).click();
      await expect(page.getByRole('heading', { name: 'Recruiter access only' })).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
      await page.getByRole('link', { name: 'Return to Candidate portal' }).click();
      await expect(page.getByText(`Welcome, ${user.displayName}.`)).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
      await banner.getByRole('link', { name: 'Candidate portal' }).click();
      await expect(page.getByRole('heading', { name: 'Candidate access only' })).toBeVisible();
      await expect(page.getByText(/Welcome,/)).toHaveCount(0);
      await page.getByRole('link', { name: 'Go to Admin' }).click();
      await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    }
    await page.reload(); expect(await identity(page)).toEqual(session);
    await banner.getByRole('button', { name: 'Logout' }).click(); expect(await identity(page)).toBeNull();
    await banner.getByRole('link', { name: 'Login', exact: true }).click();
    // Try the exact same valid credentials in the wrong role, using keyboard tabs.
    await candidateTab.focus(); await candidateTab.press('End');
    await expect(adminTab).toBeFocused();
    if (user.role === 'admin') await adminTab.press('ArrowRight');
    await signIn(page, user.username, user.password);
    await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
    expect(await identity(page)).toBeNull();
  });
}

test('registration validates input and duplicates then creates and signs in a candidate', async ({ page }) => {
  const banner = page.getByRole('banner');
  await banner.getByRole('link', { name: 'Candidate portal' }).click();
  await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
  await page.getByRole('link', { name: 'Create candidate account' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel('Full Name').fill('New Candidate');
  await page.getByLabel('Email Address').fill('bad');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('valid email'); expect(await identity(page)).toBeNull();
  await page.getByLabel('Email Address').fill('ALEX@EXAMPLE.COM');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('already exists'); expect(await identity(page)).toBeNull();
  await page.getByLabel('Email Address').fill('new@example.com');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/candidate$/);
  await expect(page.getByText('Welcome, New Candidate.')).toBeVisible();
  await expect(page.getByText(/Your candidate account is ready/)).toBeVisible();
  const users = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_users')));
  expect(users).toHaveLength(6);
  const account = users.find((user) => user.username === 'new@example.com');
  expect(account).toEqual({ id: expect.any(String), role: 'candidate', username: 'new@example.com', password: 'password123', displayName: 'New Candidate' });
  const session = await expectIdentity(page, account);
  await page.reload(); expect(await identity(page)).toEqual(session);
  await expect(page.getByText('Welcome, New Candidate.')).toBeVisible();
  await banner.getByRole('button', { name: 'Logout' }).click(); expect(await identity(page)).toBeNull();
  await banner.getByRole('link', { name: 'Login', exact: true }).click();
  await signIn(page, 'new@example.com', 'password123');
  await expect(page.getByText('Welcome, New Candidate.')).toBeVisible();
});

test('tab closure preserves identity and submissions until explicit logout', async ({ page, context }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Apply', exact: true }).click();
  await page.getByLabel('Full Name').fill('Alice Smith');
  await page.getByLabel('Email Address').fill('alice@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText('Thank you! Your interest has been submitted successfully.');
  const raw = await page.evaluate(() => localStorage.getItem('hirehub_submissions'));
  const records = JSON.parse(raw); expect(records).toHaveLength(9);
  const alice = records.find((record) => record.email === 'alice@example.com');
  expect(alice).toEqual({ id: expect.any(String), fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789', department: 'Engineering', submittedAt: expect.any(String) });
  await nav.getByRole('link', { name: 'Admin', exact: true }).click(); await signIn(page, 'admin', 'admin');
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByRole('cell', { name: alice.email, exact: true })).toBeVisible();
  const session = await expectIdentity(page, DEFAULT_USERS[0]);
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(raw);
  await page.close(); expect(page.isClosed()).toBe(true);
  const freshPage = await context.newPage(); captureAuthErrors(freshPage);
  try {
    expect(await freshPage.opener()).toBeNull();
    await freshPage.goto('/'); // Initial entry for the new, independently opened tab.
    expect(await identity(freshPage)).toEqual(session);
    expect(await freshPage.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(raw);
    await expect(freshPage.getByRole('banner').getByRole('button', { name: 'Logout' })).toBeVisible();
    await freshPage.getByRole('navigation').getByRole('link', { name: 'Admin', exact: true }).click();
    await expect(freshPage.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    await expect(freshPage.getByRole('heading', { name: 'Admin Login' })).toHaveCount(0);
    const row = freshPage.getByRole('row').filter({ hasText: alice.email });
    await expect(row).toHaveCount(1);
    const date = new Date(alice.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const rowNumber = String(records.findIndex((record) => record.id === alice.id) + 1);
    for (const value of [rowNumber, 'Alice Smith', alice.email, alice.mobile, 'Engineering', date]) {
      await expect(row.getByRole('cell', { name: value, exact: true })).toBeVisible();
    }
    await freshPage.getByRole('banner').getByRole('button', { name: 'Logout' }).click();
    expect(await identity(freshPage)).toBeNull();
    expect(await freshPage.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(raw);
  } finally {
    expect.soft(freshPage.authErrors, 'Fresh tab console and uncaught errors').toEqual([]);
    await freshPage.close();
    expect.soft(page.authErrors, 'Original tab console and uncaught errors').toEqual([]);
  }
});
