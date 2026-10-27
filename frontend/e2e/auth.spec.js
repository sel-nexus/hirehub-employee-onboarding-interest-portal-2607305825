/** Exercise local role authentication, registration, persistence and guards on desktop/mobile. */
import { test, expect } from '@playwright/test';

/** Capture console and uncaught errors before a page enters the application. */
function captureAuthErrors(page) {
  page.authErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') page.authErrors.push(message.text());
  });
  page.on('pageerror', (error) => page.authErrors.push(error.message));
}

/** Enter once; subsequent route navigation uses visible links or form actions. */
test.beforeEach(async ({ page }) => {
  captureAuthErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us', exact: true })).toBeVisible();
});

/** Fail every journey with browser errors, including journeys that close the original tab. */
test.afterEach(async ({ page }) => {
  expect(page.authErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Follow the login/register card links in both directions, not only the public header. */
test('candidate login card opens signup and the signup card returns to candidate login', async ({ page }) => {
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Candidate Login', exact: true })).toBeVisible();
  await expect(main.getByLabel('Email Address')).toBeVisible();
  await expect(main.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  await main.getByRole('link', { name: 'Create a candidate account', exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(main.getByRole('heading', { name: 'Create Candidate Account', exact: true })).toBeVisible();
  for (const label of ['Full Name', 'Email Address', 'Password', 'Confirm Password']) {
    await expect(main.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(main.getByRole('button', { name: 'Create Account', exact: true })).toBeVisible();
  await main.getByRole('link', { name: 'Already have an account? Login', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(main.getByRole('heading', { name: 'Candidate Login', exact: true })).toBeVisible();
  await expect(main.getByRole('tab', { name: 'Candidate', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(main.getByRole('tab', { name: 'Administrator / Recruiter', exact: true })).toBeVisible();
  await expect(main.getByLabel('Email Address')).toHaveValue('');
  await expect(main.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(main.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
});

/** Verify legacy recruiter entry, invalid login, persistent source session and logout. */
test('recruiter session survives reload; logout preserves data and restores the legacy Admin entry', async ({ page }) => {
  const banner = page.getByRole('banner');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const initialData = await page.evaluate(() => localStorage.getItem('hirehub_submissions'));
  expect(JSON.parse(initialData)).toHaveLength(8);
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(nav.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByText('Demo credentials: admin/admin or recruiter@hirehub.demo/admin123')).toBeVisible();
  await expect(page.getByText('Browser-only demo. This is not real authentication or secure access control.')).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Login', exact: true })).toHaveAttribute('href', '/login');
  expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'alex@example.com', exact: true })).toBeVisible();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
  expect(session).toEqual({ userId: 'u-admin', role: 'admin', displayName: 'Talent Admin', loginTimestamp: expect.any(String) });
  expect(new Date(session.loginTimestamp).toISOString()).toBe(session.loginTimestamp);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(initialData);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')))).toEqual(session);
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await nav.getByRole('link', { name: 'Recruiter Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await banner.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(initialData);
  await expect(banner.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  expect(page.authErrors).toEqual([]);
});

/** Verify all named candidate demos and role isolation through the actual unified login. */
for (const [email, name, userId] of [
  ['alex@example.com', 'Alex Rivera', 'u-201'],
  ['jordan@example.com', 'Jordan Lee', 'u-202'],
  ['taylor@example.com', 'Taylor Morgan', 'u-203'],
]) {
  test(`${email} can use candidate access, never recruiter access`, async ({ page }) => {
    const banner = page.getByRole('banner');
    await banner.getByRole('link', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    await page.getByRole('tab', { name: 'Administrator / Recruiter' }).click();
    await page.getByLabel('Username', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
    expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
    await page.getByRole('tab', { name: 'Candidate', exact: true }).click();
    await expect(page.getByLabel('Email Address')).toHaveValue('');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByLabel('Email Address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/candidate$/);
    await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
    await expect(page.getByText(`Welcome, ${name}.`)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
    expect(session).toMatchObject({ userId, role: 'candidate', displayName: name });
    const localUser = await page.evaluate((id) => JSON.parse(localStorage.getItem('hirehub_users')).find((user) => user.id === id), userId);
    expect(localUser).toMatchObject({ username: email, displayName: name, role: session.role });
    await banner.getByRole('link', { name: 'Admin', exact: true }).click();
    await expect(page).toHaveURL(/\/candidate$/);
    await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(`Welcome, ${name}.`)).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')))).toEqual(session);
    await banner.getByRole('button', { name: 'Logout', exact: true }).click();
    await banner.getByRole('link', { name: 'Candidate', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
    expect(page.authErrors).toEqual([]);
  });
}

/** Replace obsolete tab-lifetime assumptions with actual persistent local-session assertions. */
test('closing the recruiter tab retains local session and data; wrong-role entry fails closed', async ({ page, context }) => {
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByRole('tab', { name: 'Administrator / Recruiter' }).click();
  await page.getByLabel('Username', { exact: true }).fill('recruiter@hirehub.demo');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  const originalData = await page.evaluate(() => localStorage.getItem('hirehub_submissions'));
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
  expect(session).toMatchObject({ userId: 'u-recruiter', role: 'admin' });
  await page.close();
  expect(page.isClosed()).toBe(true);
  const freshPage = await context.newPage();
  captureAuthErrors(freshPage);
  try {
    expect(await freshPage.opener()).toBeNull();
    await freshPage.goto('/candidate');
    await expect(freshPage).toHaveURL(/\/admin$/);
    await expect(freshPage.getByRole('heading', { name: 'Candidate Portal' })).toHaveCount(0);
    await expect(freshPage.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    expect(await freshPage.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')))).toEqual(session);
    expect(await freshPage.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(originalData);
    // Corrupt a real persisted role, not a mocked storage implementation.
    await freshPage.evaluate(() => {
      const current = JSON.parse(localStorage.getItem('hirehub_session'));
      localStorage.setItem('hirehub_session', JSON.stringify({ ...current, role: 'candidate' }));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(freshPage.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await expect(freshPage.getByRole('button', { name: 'Logout', exact: true })).toHaveCount(0);
    expect(await freshPage.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(originalData);
  } finally {
    expect.soft(page.authErrors, 'Original tab errors').toEqual([]);
    expect.soft(freshPage.authErrors, 'Fresh tab errors').toEqual([]);
    await freshPage.close();
  }
});

/** Cover invalid/duplicate signup, immediate session, logout, re-login and fresh-page persistence. */
test('signup persists a candidate account and allows later login without leaking recruiter data', async ({ page, context }) => {
  const banner = page.getByRole('banner');
  await banner.getByRole('link', { name: 'Register', exact: true }).click();
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
  await page.getByLabel('Full Name').fill('New Candidate');
  await page.getByLabel('Email Address').fill('ALEX@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm Password').fill('password123');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('alert')).toHaveText('An account with this email already exists.');
  await page.getByLabel('Email Address').fill('new@example.com');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL(/\/candidate$/);
  await expect(page.getByText('Welcome, New Candidate.')).toBeVisible();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
  const account = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_users')).find((user) => user.username === 'new@example.com'));
  expect(account).toEqual({ id: session.userId, role: 'candidate', username: 'new@example.com', password: 'password123', displayName: 'New Candidate' });
  await banner.getByRole('button', { name: 'Logout', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
  await banner.getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Email Address').fill('new@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Welcome, New Candidate.')).toBeVisible();
  const currentSession = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
  const freshPage = await context.newPage();
  captureAuthErrors(freshPage);
  try {
    await freshPage.goto('/');
    await expect(freshPage.getByRole('heading', { name: 'Build Your Future With Us', exact: true })).toBeVisible();
    await freshPage.getByRole('banner').getByRole('link', { name: 'Candidate Portal', exact: true }).click();
    await expect(freshPage.getByText('Welcome, New Candidate.')).toBeVisible();
    await expect(freshPage.getByRole('table')).toHaveCount(0);
    expect(await freshPage.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')))).toEqual(currentSession);
    expect(await freshPage.evaluate(() => JSON.parse(localStorage.getItem('hirehub_users')).find((user) => user.username === 'new@example.com'))).toEqual(account);
  } finally {
    expect.soft(freshPage.authErrors, 'Fresh page errors').toEqual([]);
    await freshPage.close();
  }
  expect(page.authErrors).toEqual([]);
});

/** Retain the public Apply-to-recruiter persistence journey on deliberate legacy-only data. */
test('deliberately empty legacy submissions remain empty until a public application is saved', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('hirehub_submissions', '[]'));
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Apply', exact: true }).click();
  await page.getByLabel('Full Name').fill('Alice Smith');
  await page.getByLabel('Email Address').fill('alice@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText('Thank you! Your interest has been submitted successfully.');
  const raw = await page.evaluate(() => localStorage.getItem('hirehub_submissions'));
  const records = JSON.parse(raw);
  expect(records).toEqual([{
    id: expect.any(String), userId: '', fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
    department: 'Engineering', status: 'received', submittedAt: expect.any(String), notes: '', portfolioUrl: '', sampleResume: '',
  }]);
  await nav.getByRole('link', { name: 'Admin', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'alice@example.com', exact: true })).toBeVisible();
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: records[0].email });
  const formattedDate = new Date(records[0].submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  for (const value of ['1', 'Alice Smith', 'alice@example.com', '0123456789', 'Engineering', formattedDate]) {
    await expect(row.getByRole('cell', { name: value, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(raw);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')))).toMatchObject({ userId: 'u-admin', role: 'admin' });
  expect(page.authErrors).toEqual([]);
});
