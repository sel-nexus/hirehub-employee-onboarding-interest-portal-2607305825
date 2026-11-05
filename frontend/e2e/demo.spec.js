/** Specify real browser demo seeding and reset on inherited desktop/mobile projects; run after all slices. */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.demoErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') page.demoErrors.push(message.text());
  });
  page.on('pageerror', (error) => page.demoErrors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(page.demoErrors, 'Browser console and page exceptions').toEqual([]);
});

/** Read the actual browser dataset rather than injecting mock services. */
async function records(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
}

test('empty storage seeds eight applications and one-click reset removes test data without changing theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Reset Mock Data' })).toBeVisible();
  const initial = await records(page);
  expect(initial).toHaveLength(8);
  const users = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_users')));
  expect(users).toHaveLength(5);
  expect(users.filter((user) => user.role === 'candidate').map((user) => user.username))
    .toEqual(['alex@example.com', 'jordan@example.com', 'taylor@example.com']);
  for (const user of users.filter((account) => account.role === 'candidate')) {
    expect(user).toMatchObject({ password: 'password123', displayName: expect.any(String) });
  }
  for (const record of initial) {
    expect(record).toMatchObject({ sampleResume: expect.any(String), portfolioUrl: expect.any(String) });
    expect(record.resumeText).toContain(record.sampleResume);
  }
  expect(users.find((user) => user.username === 'admin')).toMatchObject({ password: 'admin' });
  expect(users.find((user) => user.email === 'recruiter@hirehub.demo')).toMatchObject({ password: 'admin123' });
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('link', { name: 'Apply', exact: true }).click();
  await page.getByLabel('Full Name').fill('Demo Test Candidate');
  await page.getByLabel('Email Address').fill('reset.test@example.com');
  await page.getByLabel('Mobile Number').fill('2025550199');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByText('Thank you! Your interest has been submitted successfully.')).toBeVisible();
  expect(await records(page)).toHaveLength(9);
  await page.evaluate(() => {
    localStorage.setItem('hirehub_theme', 'dark');
    const user = JSON.parse(localStorage.getItem('hirehub_users')).find((account) => account.username === 'alex@example.com');
    localStorage.setItem('hirehub_session', JSON.stringify({ userId: user.id, role: user.role,
      displayName: user.displayName, loginTimestamp: '2026-10-26T14:30:00.000Z' }));
    sessionStorage.setItem('hirehub_admin_auth', 'true');
  });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session'))))
    .toEqual({ userId: users[0].id, role: 'candidate', displayName: users[0].displayName,
      loginTimestamp: '2026-10-26T14:30:00.000Z' });
  await page.getByRole('button', { name: 'Reset Mock Data' }).click();
  await expect(page.getByText('Demo reset: eight applications restored. All demo sessions cleared.')).toBeVisible();
  expect(await records(page)).toEqual(initial);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('hirehub_theme'))).toBe('dark');
  await navigation.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  expect(await records(page)).toEqual(initial);
});

test('corrupted data recovers visibly and intentional empty data stays empty until reset', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hirehub_submissions', '{bad');
    localStorage.setItem('hirehub_users', '[]');
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Corrupted hirehub_submissions data was recovered');
  expect(await records(page)).toHaveLength(8);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_users')))).toEqual([]);
  await page.getByRole('button', { name: 'Reset Mock Data' }).click();
  await expect(page.getByText('Demo reset: eight applications restored. All demo sessions cleared.')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_users')))).toHaveLength(5);
});
