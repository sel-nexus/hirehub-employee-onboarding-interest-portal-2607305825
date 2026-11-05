/** Write real candidate journeys for inherited desktop/mobile projects; execution is deferred. */
import { test, expect } from '@playwright/test';

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));

/** Enter candidate access through the public navigation, not a protected deep link. */
async function login(page, username) {
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Account role').selectOption('candidate');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

test('demo candidate sees own schedule, materials and duplicate feedback after entry/login', async ({ page }) => {
  await page.goto('/');
  await login(page, 'alex@example.com');
  await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByText('2026-04-15 at 14:00 (America/New_York)')).toBeVisible();
  await expect(page.getByText(/Strong profile/)).toHaveCount(0);
  const engineering = page.getByRole('article', { name: 'Engineering application' });
  await engineering.getByText('Application details and materials', { exact: true }).click();
  await expect(engineering.getByRole('link', { name: 'Open portfolio (new tab)' })).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByLabel('Department', { exact: true }).selectOption('Engineering');
  await page.getByLabel('Mock resume').selectOption('Full-Stack Developer Resume (Sample)');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('You already have an application for this department.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(3);
});

test('submits a safe portfolio without a resume preset and re-reads it after reload', async ({ page }) => {
  await page.goto('/');
  await login(page, 'alex@example.com');
  await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
  await page.getByLabel('Department', { exact: true }).selectOption('Design');
  await page.getByLabel('Portfolio URL').fill('https://example.com/work');
  await expect(page.getByLabel('Mock resume')).toHaveValue('');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('Application submitted.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('Portfolio URL')).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(4);
  const application = page.getByRole('article', { name: 'Design application' });
  await application.getByText('Application details and materials', { exact: true }).click();
  await expect(application.getByText('Portfolio supplied; no mock resume selected', { exact: true })).toBeVisible();
  await expect(application.getByText('No mock resume selected. Review the supplied portfolio link.', { exact: true })).toBeVisible();
  const link = application.getByRole('link', { name: 'Open portfolio (new tab)' });
  await expect(link).toHaveAttribute('href', 'https://example.com/work');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions'))
    .find((record) => record.userId === 'user-alex' && record.department === 'Design'));
  expect(stored).toMatchObject({ userId: 'user-alex', department: 'Design', status: 'applied', interview: null,
    portfolioUrl: 'https://example.com/work', sampleResume: 'Portfolio supplied; no mock resume selected',
    resumeText: 'No mock resume selected. Review the supplied portfolio link.' });
});

test('registers, edits contacts, submits materials to multiple departments and persists through logout/login', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Register', exact: true }).click();
  await page.getByLabel('Full name').fill('Casey Quinn');
  await page.getByLabel('Email', { exact: true }).fill('casey.candidate@example.com');
  await page.getByLabel('Mobile').fill('2025550199');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('link', { name: 'Start an application' })).toBeVisible();
  await page.getByLabel('Full name').fill('Casey Morgan');
  await page.getByLabel('Email', { exact: true }).fill('casey.updated@example.com');
  await page.getByRole('button', { name: 'Save contact details' }).click();
  await expect(page.getByText('Contact details saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start an application' }).click();
  await page.getByLabel('Department', { exact: true }).selectOption('Design');
  await page.getByLabel('Portfolio URL').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByLabel('Portfolio URL')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Portfolio URL')).toHaveValue('javascript:alert(1)');
  await page.getByLabel('Portfolio URL').fill('https://example.com/casey');
  await page.getByLabel('Mock resume').selectOption('UI/UX Case Study');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('Application submitted.')).toBeVisible();
  await page.getByLabel('Department', { exact: true }).selectOption('Engineering');
  await page.getByLabel('Mock resume').selectOption('Full-Stack Developer Resume (Sample)');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await page.reload();
  await expect(page.getByText('Welcome, Casey Morgan.')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(2);
  const stored = await page.evaluate(() => {
    const session = JSON.parse(localStorage.getItem('hirehub_session'));
    const records = JSON.parse(localStorage.getItem('hirehub_submissions')).filter((record) => record.userId === session.userId);
    return { session, records };
  });
  expect(stored.session.displayName).toBe('Casey Morgan');
  expect(stored.records.map((record) => record.department).sort()).toEqual(['Design', 'Engineering']);
  expect(stored.records.every((record) => record.email === 'casey.updated@example.com'
    && record.status === 'applied' && record.interview === null)).toBe(true);
  expect(stored.records.find((record) => record.department === 'Design').portfolioUrl).toBe('https://example.com/casey');
  await page.getByRole('banner').getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Portal', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await login(page, 'casey.candidate@example.com');
  await expect(page.getByText('Welcome, Casey Morgan.')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(2);
});
