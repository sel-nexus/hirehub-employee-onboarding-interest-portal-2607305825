/** Real candidate journeys; browser execution belongs to the parent release run. */
import { test, expect } from '@playwright/test';

/** Capture browser errors before entering the application. */
test.beforeEach(async ({ page }) => {
  page.candidateErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') page.candidateErrors.push(message.text()); });
  page.on('pageerror', (error) => page.candidateErrors.push(error.message));
  await page.goto('/');
});
test.afterEach(async ({ page }) => {
  expect(page.candidateErrors, 'Candidate browser console and page errors').toEqual([]);
});

/** Sign in through the actual public header and candidate login form. */
async function signIn(page, email = 'alex@example.com') {
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/candidate$/);
}

test('seeded candidate owns only Alex; edits contacts and can sign in again with the updated email', async ({ page }) => {
  await signIn(page);
  const main = page.getByRole('main');
  await expect(main.getByText('alex@example.com', { exact: true })).toBeVisible();
  await expect(main.getByText('jordan@example.com', { exact: true })).toHaveCount(0);
  await expect(main.getByText('Strong background in React and frontend architecture.', { exact: true })).toHaveCount(0);
  await expect(main.getByText('password123', { exact: true })).toHaveCount(0);
  const steps = main.getByRole('list', { name: 'Hiring progress' }).getByRole('listitem');
  await expect(steps).toHaveCount(4);
  await expect(steps.nth(2)).toHaveAttribute('aria-current', 'step');
  await expect(main.getByRole('img', { name: 'Current stage' })).toBeVisible();
  await expect(main.getByText(/Video interview.*HireHub demo meeting room/)).toBeVisible();
  await expect(main.locator('time')).toHaveAttribute('datetime', '2026-11-02T15:00:00.000Z');
  await expect(main.getByRole('link', { name: /View portfolio/ })).toHaveAttribute('href', 'https://alexrivera.dev');
  await expect(main.getByRole('link', { name: /View portfolio/ })).toHaveAttribute('rel', 'noopener noreferrer');
  const before = await page.evaluate(() => ({
    records: JSON.parse(localStorage.getItem('hirehub_submissions')), users: JSON.parse(localStorage.getItem('hirehub_users')),
  }));
  const edit = main.getByRole('button', { name: 'Edit contact details' });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: 'Edit Contact Details' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByLabel('Full Name')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Full Name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.click();
  await dialog.getByLabel('Email Address').fill('recruiter@hirehub.demo');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog.getByLabel('Email Address')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('This email belongs to another account or application.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Full Name').fill('Alex Updated');
  await dialog.getByLabel('Email Address').fill('alex.updated@example.com');
  await dialog.getByLabel('Mobile Number').fill('0123456789');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(main.getByText('Welcome, Alex Updated.', { exact: true })).toBeVisible();
  await expect(main.getByText('alex.updated@example.com', { exact: true })).toBeVisible();
  await expect(main.getByText('0123456789', { exact: true })).toBeVisible();
  await expect(edit).toBeFocused();
  const after = await page.evaluate(() => ({
    records: JSON.parse(localStorage.getItem('hirehub_submissions')), users: JSON.parse(localStorage.getItem('hirehub_users')),
    session: JSON.parse(localStorage.getItem('hirehub_session')),
  }));
  expect(after.records).toEqual([
    { ...before.records[0], fullName: 'Alex Updated', email: 'alex.updated@example.com', mobile: '0123456789' }, ...before.records.slice(1),
  ]);
  expect(after.users).toEqual(before.users.map((user) => user.id === 'u-201'
    ? { ...user, username: 'alex.updated@example.com', displayName: 'Alex Updated' } : user));
  expect(after.session).toMatchObject({ userId: 'u-201', role: 'candidate', displayName: 'Alex Updated' });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Candidate Portal', exact: true }).click();
  await expect(main.getByText('alex.updated@example.com', { exact: true })).toBeVisible();
  await page.reload();
  await expect(main.getByText('0123456789', { exact: true })).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: 'Logout', exact: true }).click();
  await signIn(page, 'alex.updated@example.com');
  await expect(main.getByText('Welcome, Alex Updated.', { exact: true })).toBeVisible();
});

test('new signup starts empty, then submits selected resume/portfolio and returns to its owned dashboard', async ({ page }) => {
  await page.getByRole('banner').getByRole('link', { name: 'Register', exact: true }).click();
  await page.getByLabel('Full Name').fill('New Candidate');
  await page.getByLabel('Email Address').fill('new.candidate@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm Password').fill('password123');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  await expect(page.getByText('alex@example.com', { exact: true })).toHaveCount(0);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
  expect(before).toHaveLength(8);
  await page.getByRole('link', { name: 'Start an application' }).click();
  await page.getByLabel('Full Name').fill('New Candidate');
  await page.getByLabel('Email Address').fill('new.candidate@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Product');
  await page.getByLabel('Portfolio URL (optional)').fill('javascript:alert(1)');
  await page.getByLabel('Sample resume (optional)').selectOption('UI/UX Case Study');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('alert')).toContainText('HTTP or HTTPS');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')))).toEqual(before);
  await page.getByLabel('Portfolio URL (optional)').fill('https://example.com/case-study');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText('Thank you! Your interest has been submitted successfully.');
  const state = await page.evaluate(() => ({ records: JSON.parse(localStorage.getItem('hirehub_submissions')),
    session: JSON.parse(localStorage.getItem('hirehub_session')) }));
  expect(state.records.slice(0, 8)).toEqual(before);
  expect(state.records[8]).toEqual({ id: expect.any(String), userId: state.session.userId, fullName: 'New Candidate',
    email: 'new.candidate@example.com', mobile: '0123456789', department: 'Product', status: 'received',
    submittedAt: expect.any(String), notes: '', portfolioUrl: 'https://example.com/case-study', sampleResume: 'UI/UX Case Study' });
  await page.getByRole('link', { name: 'View my applications' }).click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Product application' })).toBeVisible();
  await expect(main.getByRole('status')).toHaveText('Application Received');
  await expect(main.getByText('UI/UX Case Study', { exact: true })).toBeVisible();
  await expect(main.getByRole('link', { name: /View portfolio/ })).toHaveAttribute('href', 'https://example.com/case-study');
  await expect(main.getByText('No interview schedule has been shared yet.')).toBeVisible();
  await expect(main.getByText('alex@example.com', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(main.getByText('new.candidate@example.com', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')))).toEqual(state.records);
  await page.screenshot({ path: test.info().outputPath('candidate-owned-application.png'), fullPage: true });
});

test('candidate cannot reach recruiter records; revoked and unauthenticated candidate access fail closed', async ({ page }) => {
  const banner = page.getByRole('banner');
  await banner.getByRole('link', { name: 'Candidate', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
  await page.getByRole('tab', { name: 'Administrator / Recruiter' }).click();
  await page.getByLabel('Username').fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
  await page.getByRole('tab', { name: 'Candidate', exact: true }).click();
  await page.getByLabel('Email Address').fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await banner.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/candidate$/);
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toHaveCount(0);
  await expect(page.getByText('jordan@example.com', { exact: true })).toHaveCount(0);
  await banner.getByRole('button', { name: 'Logout', exact: true }).click();
  await banner.getByRole('link', { name: 'Candidate', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('alex@example.com', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
});
