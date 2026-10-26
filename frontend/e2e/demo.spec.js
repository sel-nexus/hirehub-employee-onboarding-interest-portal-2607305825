/** Verify demo seed/reset against a real browser store; this slice does not run the spec. */
import { test, expect } from '@playwright/test';
import { AUTH_KEY } from '../src/features/admin/auth';

/** Capture browser failures before entering any application route. */
function captureErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Enter the existing recruiter gate through real shared navigation and form controls. */
async function loginAdmin(page) {
  await page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
}

/** Read actual persistence without replacing or intercepting any application dependency. */
async function readStore(page) {
  return page.evaluate(() => ({
    submissions: JSON.parse(localStorage.getItem('hirehub_submissions')),
    users: JSON.parse(localStorage.getItem('hirehub_users')),
    departments: JSON.parse(localStorage.getItem('hirehub_departments')),
    session: localStorage.getItem('hirehub_session'),
    theme: localStorage.getItem('hirehub_theme'),
  }));
}

test('first launch, local persistence and confirmed reset restore the curated baseline', async ({ page }) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await expect(page.getByRole('contentinfo', { name: 'Demo utilities' })).toBeVisible();
  const baseline = await readStore(page);
  expect(baseline.submissions).toHaveLength(8);
  expect(new Set(baseline.submissions.map((record) => record.department))).toEqual(new Set(['Engineering', 'Design', 'Product', 'Marketing', 'Operations']));
  expect(new Set(baseline.submissions.map((record) => record.status))).toEqual(new Set(['applied', 'review', 'interview', 'offer', 'archived']));
  expect(baseline.users).toEqual(expect.arrayContaining([
    expect.objectContaining({ username: 'admin', password: 'admin', role: 'admin' }),
    expect.objectContaining({ username: 'recruiter@hirehub.demo', password: 'admin123', role: 'admin' }),
    expect.objectContaining({ username: 'alex@example.com', password: 'password123', id: 'u-201' }),
    expect.objectContaining({ username: 'jordan@example.com', password: 'password123' }),
    expect.objectContaining({ username: 'taylor@example.com', password: 'password123' }),
  ]));
  await loginAdmin(page);
  await expect(page.getByRole('row')).toHaveCount(9);
  await expect(page.getByRole('cell', { name: 'Alex Rivera', exact: true })).toBeVisible();

  // Model local edits/stale test data using the real storage API, not a fixture mock.
  await page.evaluate(() => {
    const records = JSON.parse(localStorage.getItem('hirehub_submissions'));
    records[0].fullName = 'Alex Updated';
    localStorage.setItem('hirehub_submissions', JSON.stringify(records));
    localStorage.setItem('hirehub_users', JSON.stringify([{ id: 'test-user', role: 'candidate', username: 'test@example.com', password: 'test', displayName: 'Test User' }]));
    localStorage.setItem('hirehub_departments', JSON.stringify(['Custom Team']));
    localStorage.setItem('hirehub_session', JSON.stringify({ userId: 'stale-user', role: 'admin' }));
    localStorage.setItem('hirehub_theme', 'dark');
    localStorage.setItem('unrelated-demo-test', 'retain');
  });
  await page.getByRole('banner').getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Alex Updated', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('cell', { name: 'Alex Updated', exact: true })).toBeVisible();
  const edited = await readStore(page);
  expect(edited.users[0].username).toBe('test@example.com');
  expect(edited.departments).toEqual(['Custom Team']);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Reset Mock Data' }).click();
  expect(await readStore(page)).toEqual(edited);

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('theme preference will be kept');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Reset Mock Data' }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(/Mock data restored/);
  const restored = await readStore(page);
  expect(restored.submissions).toEqual(baseline.submissions);
  expect(restored.users).toEqual(baseline.users);
  expect(restored.departments).toEqual(baseline.departments);
  expect(restored.session).toBeNull();
  expect(restored.theme).toBe('dark');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), AUTH_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-demo-test'))).toBe('retain');
  await page.reload();
  expect((await readStore(page)).submissions).toEqual(baseline.submissions);
  await loginAdmin(page);
  await expect(page.getByRole('cell', { name: 'Alex Rivera', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Alex Updated', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('demo-baseline.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('corrupt JSON recovers to seeded records without browser errors on mobile', async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    for (const key of ['hirehub_submissions', 'hirehub_users', 'hirehub_departments']) localStorage.setItem(key, '{corrupt');
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reset Mock Data' })).toBeVisible();
  const data = await readStore(page);
  expect(data.submissions).toHaveLength(8);
  expect(data.users).toHaveLength(5);
  expect(data.departments).toEqual(['Engineering', 'Design', 'Product', 'Marketing', 'Operations']);
  await loginAdmin(page);
  await expect(page.getByRole('cell', { name: 'Alex Rivera', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('demo-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('valid nonempty six-field legacy records survive initial seeding and reload', async ({ page }) => {
  const errors = captureErrors(page);
  const legacy = {
    id: 'legacy-record', fullName: 'Legacy Candidate', email: 'legacy@example.com',
    mobile: '0123456789', department: 'Engineering', submittedAt: '2026-03-04T12:00:00.000Z',
  };
  await page.addInitScript((record) => {
    if (localStorage.getItem('hirehub_submissions') === null) localStorage.setItem('hirehub_submissions', JSON.stringify([record]));
  }, legacy);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reset Mock Data' })).toBeVisible();
  expect((await readStore(page)).submissions).toEqual([legacy]);
  await loginAdmin(page);
  await expect(page.getByRole('cell', { name: 'Legacy Candidate', exact: true })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('cell', { name: 'Legacy Candidate', exact: true })).toBeVisible();
  expect((await readStore(page)).submissions).toEqual([legacy]);
  expect(errors).toEqual([]);
});
