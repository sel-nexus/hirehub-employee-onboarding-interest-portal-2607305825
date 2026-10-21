/** Specify real desktop/mobile application journeys; the parent runs these against Vite. */
import { test, expect } from '@playwright/test';

const SUCCESS_MESSAGE = 'Thank you! Your interest has been submitted successfully.';
const DUPLICATE_MESSAGE = 'This email has already been submitted.';

/** Capture browser failures before navigation and enter Apply through the shared header. */
test.beforeEach(async ({ page }) => {
  page.applyErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') page.applyErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    page.applyErrors.push(error.message);
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(page).toHaveURL(/\/apply$/);
});

/** Fail every test on any console error or uncaught browser exception. */
test.afterEach(async ({ page }) => {
  expect(page.applyErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Fill the visible fields without mocking application code or browser storage. */
async function fillForm(page, email = 'alice@example.com') {
  await page.getByLabel('Full Name').fill('Alice Smith');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
}

/** Assert custom errors are visible, associated, and do not persist invalid records. */
test('invalid application shows errors below all fields and preserves invalid input', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Join Our Team' })).toBeVisible();
  await expect(page.getByText('Express your interest in working with us.')).toBeVisible();
  await expect(page.getByRole('link', { name: '← Back to Home' })).toHaveAttribute('href', '/');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  for (const label of ['Full Name', 'Email Address', 'Mobile Number', 'Department of Interest']) {
    const field = page.getByLabel(label);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const description = await field.getAttribute('aria-describedby');
    await expect(page.locator(`#${description}`)).toBeVisible();
  }
  await page.getByLabel('Full Name').fill('Alice1');
  await page.getByLabel('Email Address').fill('not-an-email');
  await page.getByLabel('Mobile Number').fill('123456789');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  await expect(page.getByLabel('Full Name')).toHaveValue('Alice1');
  await expect(page.getByLabel('Email Address')).toHaveValue('not-an-email');
  await expect(page.getByLabel('Mobile Number')).toHaveValue('123456789');
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

/** Prove complete record persistence, confirmation lifecycle, reload survival, and duplicate protection. */
test('valid submit clears fields, dismisses success, persists on reload, and rejects case-variant duplicate', async ({ page }) => {
  const before = Date.now();
  await fillForm(page);
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText(SUCCESS_MESSAGE);
  for (const label of ['Full Name', 'Email Address', 'Mobile Number', 'Department of Interest']) {
    await expect(page.getByLabel(label)).toHaveValue('');
  }
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
  expect(records).toEqual([{
    id: expect.any(String), fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
    department: 'Engineering', submittedAt: expect.any(String),
  }]);
  expect(records[0].id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  expect(new Date(records[0].submittedAt).toISOString()).toBe(records[0].submittedAt);
  expect(Date.parse(records[0].submittedAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(records[0].submittedAt)).toBeLessThanOrEqual(Date.now());
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 6000 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')))).toEqual(records);
  await fillForm(page, ' ALICE@EXAMPLE.COM ');
  const enteredEmail = await page.getByLabel('Email Address').inputValue();
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('alert')).toHaveText(DUPLICATE_MESSAGE);
  await expect(page.getByLabel('Email Address')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Email Address')).toHaveValue(enteredEmail);
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')))).toEqual(records);
  await page.getByRole('link', { name: '← Back to Home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
});
