/** Exercise real candidate sign-in, private progress, contact persistence and tab synchronization. */
import { test, expect } from '@playwright/test';

const browserErrors = new WeakMap();
/** Capture runtime errors on every page before its first navigation. */
function observeErrors(page, errors) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
}
test.beforeEach(async ({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  observeErrors(page, errors);
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

/** Enter once, then use the real header and local account login form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Candidate portal', exact: true })).toBeVisible();
}

/** Change the real local demo store from a second tab, causing native storage events. */
async function updateOwnStatus(page, context, status) {
  const other = await context.newPage();
  observeErrors(other, browserErrors.get(page));
  await other.goto('/');
  await other.evaluate((nextStatus) => {
    const session = JSON.parse(localStorage.getItem('hirehub_session'));
    const records = JSON.parse(localStorage.getItem('hirehub_submissions'));
    localStorage.setItem('hirehub_submissions', JSON.stringify(records.map((record) => (
      record.userId === session.userId ? { ...record, status: nextStatus } : record
    ))));
  }, status);
  await other.close();
}

for (const [email, status, label, stageIndex] of [
  ['alex@example.com', 'interview', 'Interview Scheduled', 2],
  ['jordan@example.com', 'review', 'Under Review', 1],
  ['taylor@example.com', 'offer', 'Offer Extended', 3],
  ['alex@example.com', 'applied', 'Application Received', 0],
  ['alex@example.com', 'archived', 'Not Selected', 3],
]) {
  test(`candidate ${email} sees only own ${status} progress and next steps`, async ({ page, context }) => {
    await signIn(page, email);
    if (status === 'applied' || status === 'archived') await updateOwnStatus(page, context, status);
    const ownRecords = await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('hirehub_session'));
      return JSON.parse(localStorage.getItem('hirehub_submissions')).filter((record) => record.userId === session.userId);
    });
    await expect(page.getByRole('article')).toHaveCount(ownRecords.length);
    await expect(page.getByRole('article').first()).toContainText(ownRecords[0].id);
    await expect(page.getByRole('article').first().getByRole('status')).toHaveText(`Current status: ${label}`);
    const steps = page.getByRole('list', { name: 'Application progress' }).getByRole('listitem');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(stageIndex)).toHaveAttribute('aria-current', 'step');
    for (const text of ['Application Received', 'Profile Screening', 'Interview Scheduled', 'Final Decision']) {
      await expect(page.getByRole('list', { name: 'Application progress' })).toContainText(text);
    }
    await expect(page.getByText(/Next steps:/)).toBeVisible();
    if (ownRecords[0].interviewSchedule) await expect(page.getByRole('region', { name: 'Interview schedule' })).toContainText(ownRecords[0].interviewSchedule);
    else await expect(page.getByRole('region', { name: 'Interview schedule' })).toHaveCount(0);
    const privateData = await page.evaluate(() => {
      const session = JSON.parse(localStorage.getItem('hirehub_session'));
      const records = JSON.parse(localStorage.getItem('hirehub_submissions'));
      return { notes: records.map((record) => record.notes).filter(Boolean), others: records.filter((record) => record.userId !== session.userId).map((record) => record.email) };
    });
    for (const secret of [...privateData.notes, ...privateData.others]) await expect(page.getByRole('main')).not.toContainText(secret);
    if (status === 'archived') {
      await expect(page.getByText(/You were not selected/)).toBeVisible();
      await expect(page.getByText(/Congratulations/)).toHaveCount(0);
    }
    await page.getByRole('link', { name: 'Submit an application' }).click();
    await expect(page.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
    await page.getByRole('banner').getByRole('link', { name: 'Candidate portal' }).click();
    await expect(page.getByRole('article').first().getByRole('status')).toContainText(label);
  });
}

test('candidate edits contact, reloads, signs out and signs in using the new email', async ({ page }) => {
  await signIn(page, 'alex@example.com');
  const before = await page.evaluate(() => ({
    user: JSON.parse(localStorage.getItem('hirehub_users')).find((user) => user.id === 'u-201'),
    session: JSON.parse(localStorage.getItem('hirehub_session')),
    records: JSON.parse(localStorage.getItem('hirehub_submissions')),
  }));
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page.getByLabel('Full Name')).toBeFocused();
  await page.getByLabel('Mobile Number').fill('123');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByLabel('Mobile Number')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Profile saved in this browser.')).toHaveCount(0);
  await page.getByLabel('Full Name').fill('Alex Updated');
  await page.getByLabel('Email Address').fill('updated@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile saved in this browser.')).toBeVisible();
  await expect(page.getByText('Welcome, Alex Updated.')).toBeVisible();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Logout' })).toBeVisible();
  const after = await page.evaluate(() => ({
    user: JSON.parse(localStorage.getItem('hirehub_users')).find((user) => user.id === 'u-201'),
    session: JSON.parse(localStorage.getItem('hirehub_session')),
    records: JSON.parse(localStorage.getItem('hirehub_submissions')),
  }));
  expect(after.user).toEqual({ ...before.user, displayName: 'Alex Updated', username: 'updated@example.com', mobile: '0123456789' });
  expect(after.session).toEqual({ ...before.session, displayName: 'Alex Updated' });
  expect(after.records).toEqual(before.records.map((record) => record.userId === 'u-201'
    ? { ...record, fullName: 'Alex Updated', email: 'updated@example.com', mobile: '0123456789' } : record));
  await page.reload();
  await expect(page.getByText('Welcome, Alex Updated.')).toBeVisible();
  await expect(page.getByRole('article')).toContainText('updated@example.com');
  await page.getByRole('banner').getByRole('button', { name: 'Logout' }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid credentials');
  await page.getByLabel('Username', { exact: true }).fill('updated@example.com');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Welcome, Alex Updated.')).toBeVisible();
  await expect(page.getByRole('article')).toContainText('c-101');
});

test('registered mobile candidate sees empty applications and can reach the existing apply form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('banner').getByRole('link', { name: 'Register' }).click();
  await page.getByLabel('Full Name').fill('New Candidate');
  await page.getByLabel('Email Address').fill('new@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  await expect(page.getByText('0123456789', { exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  await page.getByRole('link', { name: 'Start an application' }).click();
  await expect(page.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
});

test('native storage synchronization refreshes own status and clears details after session loss', async ({ page, context }) => {
  await signIn(page, 'alex@example.com');
  await updateOwnStatus(page, context, 'offer');
  await expect(page.getByRole('article').getByRole('status')).toContainText('Offer Extended');
  const other = await context.newPage();
  observeErrors(other, browserErrors.get(page));
  await other.goto('/');
  await other.evaluate(() => localStorage.removeItem('hirehub_session'));
  await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('c-101');
  await expect(page.getByText('Welcome, Alex Rivera.')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Interview schedule' })).toHaveCount(0);
  await other.close();
});

test('guest candidate route is gated, then real login reveals own application', async ({ page }) => {
  await page.goto('/candidate');
  await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByLabel('Username', { exact: true }).fill('jordan@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Welcome, Jordan Chen.')).toBeVisible();
  await expect(page.getByRole('article').getByRole('status')).toContainText('Under Review');
});
