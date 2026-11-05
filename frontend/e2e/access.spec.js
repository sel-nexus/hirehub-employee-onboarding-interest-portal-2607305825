/** Verify real access journeys on the inherited desktop and mobile projects. */
import { test, expect } from '@playwright/test';

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => { expect(errors).toEqual([]); });

/** Read actual persisted identity rather than a UI-only authentication flag. */
async function session(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
}

/** Log in through labeled controls; navigation begins from a reachable link. */
async function login(page, role, username, password) {
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Account role').selectOption(role);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

test('registers a candidate, persists through reload, logs out and signs in again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Register', exact: true }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByLabel('Full name')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Full name').fill('Casey Quinn');
  await page.getByLabel('Email', { exact: true }).fill('casey@example.com');
  await page.getByLabel('Mobile').fill('2025550199');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
  const saved = await session(page);
  expect(Object.keys(saved).sort()).toEqual(['displayName', 'loginTimestamp', 'role', 'userId']);
  expect(saved.role).toBe('candidate');
  const account = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_users')).find((item) => item.email === 'casey@example.com'));
  expect(saved.userId).toBe(account.id);
  await page.reload();
  await expect(page.getByText(`Welcome, ${saved.displayName}.`)).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Portal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  expect(await session(page)).toBeNull();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Portal', exact: true })).toHaveCount(0);
  await login(page, 'candidate', 'CASEY@EXAMPLE.COM', 'password123');
  await expect(page.getByText('Welcome, Casey Quinn.')).toBeVisible();
});

for (const [username, password, displayName] of [
  ['admin', 'admin', 'Demo Administrator'],
  ['recruiter@hirehub.demo', 'admin123', 'Demo Recruiter'],
]) {
  test(`recruiter ${username} rejects bad credentials then persists and logs out`, async ({ page }) => {
    await page.goto('/');
    await login(page, 'admin', username, 'wrong');
    await expect(page.getByRole('alert')).toContainText('Invalid credentials');
    expect(await session(page)).toBeNull();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recruiter Access' })).toBeVisible();
    expect((await session(page)).role).toBe('admin');
    await page.reload();
    await expect(page.getByText(`Welcome, ${displayName}.`)).toBeVisible();
    await page.getByRole('banner').getByRole('link', { name: 'Home', exact: true }).click();
    await page.getByRole('banner').getByRole('link', { name: 'Recruiter', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recruiter Access' })).toBeVisible();
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    expect(await session(page)).toBeNull();
    await page.reload();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Recruiter', exact: true })).toHaveCount(0);
  });
}

test('anonymous portal entry, wrong role, duplicate registration and malformed session fail closed', async ({ page }) => {
  await page.goto('/portal');
  await expect(page.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('selected role');
  await page.getByLabel('Account role').selectOption('candidate');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Welcome, Alex Morgan.')).toBeVisible();
  // Change the real persistent role while staying at the candidate route.
  await page.evaluate(() => {
    const user = JSON.parse(localStorage.getItem('hirehub_users')).find((item) => item.username === 'admin');
    localStorage.setItem('hirehub_session', JSON.stringify({ userId: user.id, role: user.role,
      displayName: user.displayName, loginTimestamp: new Date().toISOString() }));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toHaveCount(0);
  await page.getByRole('banner').getByRole('link', { name: 'Recruiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recruiter Access' })).toBeVisible();
  await page.evaluate(() => localStorage.setItem('hirehub_session', '{invalid'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'HireHub Login' })).toBeVisible();
  expect(await session(page)).toBeNull();
  await page.getByRole('link', { name: 'Register as a candidate', exact: true }).click();
  await page.getByLabel('Full name').fill('Other Candidate');
  await page.getByLabel('Email', { exact: true }).fill('ALEX@EXAMPLE.COM');
  await page.getByLabel('Mobile').fill('2025550199');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('This email is already registered.')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('ALEX@EXAMPLE.COM');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_users')).length)).toBe(5);
});
