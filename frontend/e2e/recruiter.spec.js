/** Write real recruiter/candidate journeys for inherited desktop/mobile projects; do not run in this slice. */
import { test, expect } from '@playwright/test';

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));

/** Navigate through the public login link and use the real persisted account flow. */
async function login(page, role, username, password) {
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Account role').selectOption(role);
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

/** Select one accessible row action by the immutable submission ID. */
function action(page, mode, id) {
  return page.getByRole('button', { name: new RegExp(`^${mode} .* ${id}$`) });
}

/** Requery real browser-local data without replacing or mocking application state. */
async function records(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
}

test('recruiter moves Alex interview to offer; candidate sees the persisted Offer Extended outcome', async ({ page }) => {
  await page.goto('/');
  await login(page, 'admin', 'admin', 'admin');
  await expect(page.getByRole('heading', { name: 'Recruiter Dashboard' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Status for Alex Morgan Engineering submission-1' }).selectOption('offer');
  await expect(page.getByText('Status saved.', { exact: true })).toBeVisible();
  expect((await records(page)).find((record) => record.id === 'submission-1')).toMatchObject({
    userId: 'user-alex', status: 'offer', interview: { date: '2026-04-15', time: '14:00', timezone: 'America/New_York' },
  });
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await login(page, 'candidate', 'alex@example.com', 'password123');
  await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
  const engineering = page.getByRole('article', { name: 'Engineering application' });
  await expect(engineering.getByText('Offer Extended', { exact: true })).toBeVisible();
  await page.reload();
  await expect(engineering.getByText('Offer Extended', { exact: true })).toBeVisible();
  expect((await records(page)).find((record) => record.id === 'submission-1').status).toBe('offer');
  await page.getByRole('banner').getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Portal', exact: true }).click();
  await expect(engineering.getByText('Offer Extended', { exact: true })).toBeVisible();
});

test('manages UI-created test applications with search/filter/edit/notes/material preview and confirmed deletion', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Register', exact: true }).click();
  await page.getByLabel('Full name').fill('Casey Quinn');
  await page.getByLabel('Email', { exact: true }).fill('casey.recruiter-test@example.com');
  await page.getByLabel('Mobile').fill('2025550199');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('link', { name: 'Start an application' }).click();
  await page.getByLabel('Department', { exact: true }).selectOption('Engineering');
  await page.getByLabel('Mock resume').selectOption('Full-Stack Developer Resume (Sample)');
  await page.getByLabel('Portfolio URL').fill('https://example.com/casey');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('Application submitted.', { exact: true })).toBeVisible();
  await page.getByLabel('Department', { exact: true }).selectOption('Design');
  await page.getByLabel('Mock resume').selectOption('UI/UX Case Study');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('article')).toHaveCount(2);
  const testRecords = (await records(page)).filter((record) => record.email === 'casey.recruiter-test@example.com');
  const id = testRecords.find((record) => record.department === 'Engineering').id;
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await login(page, 'admin', 'admin', 'admin');
  await page.getByLabel('Search name or email').fill('CASEY.RECRUITER-TEST@EXAMPLE.COM');
  await expect(page.getByRole('combobox')).toHaveCount(2);
  for (const department of ['Engineering', 'Design', 'Product', 'Marketing', 'Operations']) {
    await page.getByRole('button', { name: department, exact: true }).click();
    await expect(page.getByRole('combobox')).toHaveCount(['Engineering', 'Design'].includes(department) ? 1 : 0);
  }
  await page.getByRole('button', { name: 'Engineering', exact: true }).click();
  await expect(page).toHaveURL(/department=Engineering/);
  await page.reload();
  await expect(page.getByRole('combobox')).toHaveCount(1);
  await action(page, 'edit', id).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Department', { exact: true }).selectOption('Design');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText(/already has a record/)).toBeVisible();
  await dialog.getByLabel('Department', { exact: true }).selectOption('Engineering');
  await dialog.getByLabel('Full name').fill('Casey Smith');
  await dialog.getByLabel('Mobile').fill('2025550188');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toHaveCount(0);
  await action(page, 'notes', id).click();
  await dialog.getByLabel('Internal notes').fill('Demo review: strong application.');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  const materialTrigger = action(page, 'materials', id);
  await materialTrigger.click();
  await expect(dialog.getByText(/Mock experience for the Engineering team/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Open portfolio (new tab)' })).toHaveAttribute('href', 'https://example.com/casey');
  await expect(dialog.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  await page.keyboard.press('Escape');
  await expect(materialTrigger).toBeFocused();
  const changed = (await records(page)).find((record) => record.id === id);
  expect(changed).toMatchObject({ fullName: 'Casey Smith', mobile: '2025550188', notes: 'Demo review: strong application.',
    email: 'casey.recruiter-test@example.com', userId: testRecords[0].userId,
    submittedAt: testRecords.find((record) => record.id === id).submittedAt, portfolioUrl: 'https://example.com/casey' });
  await action(page, 'delete', id).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await records(page)).some((record) => record.id === id)).toBe(true);
  await action(page, 'delete', id).click();
  await dialog.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByText('No applications match this view.')).toBeVisible();
  expect((await records(page)).some((record) => record.id === id)).toBe(false);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await expect(page.getByRole('combobox')).toHaveCount(1);
  await page.getByLabel('Search name or email').fill('no-match');
  await expect(page.getByText('No applications match this view.')).toBeVisible();
});
