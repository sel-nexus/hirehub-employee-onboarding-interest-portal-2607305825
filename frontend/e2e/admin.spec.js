/** Specify real recruiter CRUD and recruiter-to-candidate journeys; written only in this slice. */
import { test, expect } from '@playwright/test';

/** Capture every browser failure before the first navigation. */
test.beforeEach(async ({ page }) => {
  page.adminErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') page.adminErrors.push(message.text());
  });
  page.on('pageerror', (error) => page.adminErrors.push(error.message));
});

/** Fail every journey on console errors and uncaught page exceptions. */
test.afterEach(async ({ page }) => {
  expect(page.adminErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Requery the actual application dataset rather than mocking application services. */
async function storedRecords(page) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hirehub_submissions') !== null)).toBe(true);
  return page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
}

/** Assert all existing summary fields from the actual unsorted persisted dataset. */
async function expectSummary(page, records) {
  const stats = page.locator('dl[aria-label="Submission summary"]');
  const latest = records.reduce((maximum, record) => Math.max(maximum, Date.parse(record.submittedAt)), -Infinity);
  await expect(stats.locator('.stat-total dd')).toHaveText(String(records.length));
  await expect(stats.locator('.stat-departments dd')).toHaveText(String(new Set(records.map((record) => record.department)).size));
  await expect(stats.locator('.stat-latest dd')).toHaveText(records.length
    ? new Date(latest).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A');
}

/** Sign in through real role controls, not a manufactured session. */
async function recruiterLogin(page, username = 'admin', password = 'admin') {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toHaveCount(0);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
  expect(session).toEqual({
    userId: username === 'admin' ? 'u-admin' : 'u-recruiter', role: 'admin',
    displayName: username === 'admin' ? 'Talent Admin' : 'Demo Recruiter', loginTimestamp: expect.any(String),
  });
  expect(new Date(session.loginTimestamp).toISOString()).toBe(session.loginTimestamp);
}

/** Save text-based preflight evidence and screenshots for human review. */
async function captureState(page, testInfo, state) {
  const prefix = `${testInfo.project.name}-${state}`;
  await testInfo.attach(`${prefix}-screenshot`, {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  await testInfo.attach(`${prefix}-accessibility-snapshot`, {
    body: await page.locator('body').ariaSnapshot(), contentType: 'text/yaml',
  });
  await testInfo.attach(`${prefix}-html`, { body: await page.content(), contentType: 'text/html' });
  const styles = await page.evaluate(() => {
    const selectors = ['.dashboard-page', '.dashboard-stats', '.table-scroll', '.department-badge', '.edit-overlay', '.edit-dialog', '.resume-drawer'];
    return Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const css = getComputedStyle(element);
      return [selector, {
        display: css.display, gridTemplateColumns: css.gridTemplateColumns, overflowX: css.overflowX,
        backgroundColor: css.backgroundColor, color: css.color, maxWidth: css.maxWidth,
        padding: css.padding, position: css.position, zIndex: css.zIndex,
      }];
    }));
  });
  await testInfo.attach(`${prefix}-computed-styles`, { body: JSON.stringify(styles, null, 2), contentType: 'application/json' });
}

/** Preserve create, login, validation, immutable email, edit/cancel, delete and reload assertions. */
test('candidate submission is reviewed, edited, cancelled and deleted through the real admin workflow', async ({ page }, testInfo) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const baseline = await storedRecords(page);
  expect(baseline).toHaveLength(8);
  await navigation.getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(page).toHaveURL(/\/apply$/);
  await page.getByLabel('Full Name').fill('Alice Smith');
  await page.getByLabel('Email Address').fill('alice@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText('Thank you! Your interest has been submitted successfully.');
  const original = await storedRecords(page);
  expect(original).toEqual([...baseline, {
    id: expect.any(String), fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
    department: 'Engineering', submittedAt: expect.any(String),
  }]);
  const created = original.at(-1);
  const formattedDate = new Date(created.submittedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  await recruiterLogin(page);
  await expectSummary(page, original);
  const row = page.getByRole('row').filter({ hasText: 'alice@example.com' });
  for (const value of ['9', 'Alice Smith', 'alice@example.com', '0123456789', 'Engineering', formattedDate]) {
    await expect(row.getByRole('cell', { name: value, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('columnheader')).toHaveCount(8);
  const tableRegion = page.getByRole('region', { name: 'Submissions table, scroll horizontally' });
  await expect(tableRegion).toHaveCSS('overflow-x', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'mobile') {
    expect(await tableRegion.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await tableRegion.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    expect(await tableRegion.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
  await captureState(page, testInfo, 'populated-dashboard');
  await row.getByRole('button', { name: /Edit submission for Alice Smith, alice@example.com/ }).click();
  const modal = page.getByRole('dialog', { name: 'Edit Submission' });
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(modal.getByLabel('Full Name')).toBeFocused();
  await expect(modal.getByLabel('Email Address')).toHaveValue('alice@example.com');
  await expect(modal.getByLabel('Email Address')).toHaveAttribute('readonly', '');
  await modal.getByLabel('Email Address').click();
  await page.keyboard.type('changed');
  await expect(modal.getByLabel('Email Address')).toHaveValue('alice@example.com');
  await captureState(page, testInfo, 'open-edit-modal');
  await modal.getByLabel('Full Name').fill('Alice1');
  await modal.getByLabel('Mobile Number').fill('123');
  await modal.getByLabel('Department of Interest').selectOption('');
  await modal.getByRole('button', { name: 'Save Changes' }).click();
  await expect(modal.getByRole('alert')).toHaveCount(3);
  for (const label of ['Full Name', 'Mobile Number', 'Department of Interest']) {
    await expect(modal.getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
  }
  expect(await storedRecords(page)).toEqual(original);
  await captureState(page, testInfo, 'invalid-edit-modal');
  await modal.getByLabel('Full Name').fill('Alice Updated');
  await modal.getByLabel('Mobile Number').fill('9876543210');
  await modal.getByLabel('Department of Interest').selectOption('Design');
  await modal.getByRole('button', { name: 'Save Changes' }).click();
  await expect(modal).toHaveCount(0);
  for (const value of ['Alice Updated', '9876543210', 'Design']) {
    await expect(row.getByRole('cell', { name: value, exact: true })).toBeVisible();
  }
  const updated = [...baseline, { ...created, fullName: 'Alice Updated', mobile: '9876543210', department: 'Design' }];
  expect(await storedRecords(page)).toEqual(updated);
  await expectSummary(page, updated);
  await page.reload();
  await expect(page.getByRole('cell', { name: 'Alice Updated', exact: true })).toBeVisible();
  expect(await storedRecords(page)).toEqual(updated);
  await row.getByRole('button', { name: /Edit submission for Alice Updated/ }).click();
  await modal.getByLabel('Full Name').fill('Unsaved Name');
  await modal.getByLabel('Mobile Number').fill('1111111111');
  await modal.getByLabel('Department of Interest').selectOption('Finance');
  await modal.getByRole('button', { name: 'Cancel' }).click();
  await expect(modal).toHaveCount(0);
  await expect(row.getByRole('cell', { name: 'Alice Updated', exact: true })).toBeVisible();
  expect(await storedRecords(page)).toEqual(updated);
  const deletion = row.getByRole('button', { name: /Delete submission for Alice Updated/ });
  const cancelledPrompt = page.waitForEvent('dialog');
  const cancelClick = deletion.click();
  const cancelDialog = await cancelledPrompt;
  expect(cancelDialog.type()).toBe('confirm');
  expect(cancelDialog.message()).toBe('Are you sure you want to delete this submission?');
  await cancelDialog.dismiss();
  await cancelClick;
  await expect(row).toBeVisible();
  expect(await storedRecords(page)).toEqual(updated);
  const confirmedPrompt = page.waitForEvent('dialog');
  const confirmClick = deletion.click();
  const confirmDialog = await confirmedPrompt;
  expect(confirmDialog.message()).toBe('Are you sure you want to delete this submission?');
  await confirmDialog.accept();
  await confirmClick;
  await expect(row).toHaveCount(0);
  await expectSummary(page, baseline);
  expect(await storedRecords(page)).toEqual(baseline);
  await captureState(page, testInfo, 'deleted-test-record');
  await page.reload();
  await expect(row).toHaveCount(0);
  expect(await storedRecords(page)).toEqual(baseline);
  await page.locator('.dashboard-heading').getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
  await navigation.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
});

/** Keep last-record deletion/empty summary coverage, with explicit 2.0 reload reseeding. */
test('deleting every record shows a persisted empty dashboard and reload restores the demo baseline', async ({ page }, testInfo) => {
  await page.goto('/');
  const baseline = await storedRecords(page);
  expect(baseline).toHaveLength(8);
  await recruiterLogin(page);
  for (const record of baseline) {
    const prompt = page.waitForEvent('dialog');
    const click = page.getByRole('button', { name: `Delete submission for ${record.fullName}, ${record.email}`, exact: true }).click();
    const dialog = await prompt;
    expect(dialog.message()).toBe('Are you sure you want to delete this submission?');
    await dialog.accept();
    await click;
    await expect(page.getByRole('cell', { name: record.email, exact: true })).toHaveCount(0);
  }
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expectSummary(page, []);
  expect(await storedRecords(page)).toEqual([]);
  await captureState(page, testInfo, 'empty-dashboard');
  await page.reload();
  expect(await storedRecords(page)).toEqual(baseline);
  // Re-enter the dashboard so its fresh read observes the mount-time seed.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Apply', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Admin', exact: true }).click();
  await expectSummary(page, baseline);
});

/** Recover malformed JSON and invalid records without weakening corruption assertions. */
test('admin dashboard resets corrupted submissions storage without browser errors', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('hirehub_submissions', '{malformed JSON'));
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe('{malformed JSON');
  await recruiterLogin(page);
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();
  await expectSummary(page, []);
  expect(await storedRecords(page)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe('[]');
  await page.evaluate(() => localStorage.setItem('hirehub_submissions', '[{}]'));
  expect(await storedRecords(page)).toEqual([{}]);
  // Stay in the SPA to test the reader's invalid-record reset independently of mount-time seeding.
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('link', { name: 'Apply', exact: true }).click();
  await navigation.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();
  await expectSummary(page, []);
  expect(await storedRecords(page)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe('[]');
});

/** Exercise search, five filters, preview, notes/status, logout and candidate-visible changes. */
test('recruiter review and status persist into candidate portal while notes stay private', async ({ page }, testInfo) => {
  await page.goto('/');
  const baseline = await storedRecords(page);
  expect(baseline).toHaveLength(8);
  await recruiterLogin(page, 'recruiter@hirehub.demo', 'admin123');
  const filters = page.getByRole('group', { name: 'Department filters' });
  await expect(filters.getByRole('button')).toHaveText(['All departments', 'Engineering', 'Design', 'Product', 'Marketing', 'Operations']);
  for (const department of ['Engineering', 'Design', 'Product', 'Marketing', 'Operations']) {
    await filters.getByRole('button', { name: department, exact: true }).click();
    await expect(filters.getByRole('button', { name: department, exact: true })).toHaveAttribute('aria-pressed', 'true');
    const expected = baseline.filter((record) => record.department === department);
    await expect(page.getByRole('row')).toHaveCount(expected.length + 1);
    for (const record of expected) await expect(page.getByRole('cell', { name: record.email, exact: true })).toBeVisible();
  }
  await filters.getByRole('button', { name: 'All departments' }).click();
  const search = page.getByLabel('Search by name or email');
  await search.fill('aLeX');
  await expect(page.getByRole('row')).toHaveCount(2);
  await search.fill('ALEX@EXAMPLE.COM');
  await filters.getByRole('button', { name: 'Design', exact: true }).click();
  await expect(page.getByText('No submissions match your search and department filter.')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await filters.getByRole('button', { name: 'Engineering', exact: true }).click();
  await expect(page).toHaveURL(/q=ALEX%40EXAMPLE.COM&department=Engineering$/);
  await page.reload();
  await expect(search).toHaveValue('ALEX@EXAMPLE.COM');
  await expect(filters.getByRole('button', { name: 'Engineering', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const row = page.getByRole('row').filter({ hasText: 'alex@example.com' });
  await expect(row).toBeVisible();
  const preview = row.getByRole('button', { name: /Preview resume and portfolio for Alex/ });
  await preview.click();
  const drawer = page.getByRole('dialog', { name: 'Resume and portfolio for Alex Rivera' });
  await expect(drawer).toHaveAttribute('aria-modal', 'true');
  await expect(drawer.getByRole('heading', { level: 3 })).toHaveText('Frontend Software Engineer (5 YOE)');
  await expect(drawer.getByText('Five years building accessible React applications and frontend architecture.')).toBeVisible();
  const portfolio = drawer.getByRole('link', { name: 'Open portfolio in a new tab' });
  await expect(portfolio).toHaveAttribute('href', 'https://alexrivera.dev/');
  await expect(portfolio).toHaveAttribute('target', '_blank');
  await expect(portfolio).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(drawer.getByRole('button', { name: 'Close preview' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(portfolio).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(drawer.getByRole('button', { name: 'Close preview' })).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  await captureState(page, testInfo, 'resume-preview');
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(preview).toBeFocused();
  await expect(page).toHaveURL(/\/admin\?/);
  expect(await storedRecords(page)).toEqual(baseline);
  await row.getByRole('button', { name: /Edit submission for Alex/ }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Submission' });
  await editor.getByLabel('Recruiter Notes (private)').fill('Private recruiter evaluation: recommend offer.');
  await editor.getByLabel('Interview Schedule (optional)').fill('Friday at 11 AM Pacific — Engineering follow-up.');
  const localPortfolio = new URL('/?portfolio=alex-demo', page.url()).href;
  await editor.locator('input[name="portfolioUrl"]').fill(localPortfolio);
  await editor.getByRole('button', { name: 'Save Changes' }).click();
  await expect(editor).toHaveCount(0);
  await preview.click();
  const localLink = drawer.getByRole('link', { name: 'Open portfolio in a new tab' });
  await expect(localLink).toHaveAttribute('href', localPortfolio);
  const observePopup = (newPage) => {
    newPage.on('console', (message) => {
      if (message.type() === 'error') page.adminErrors.push(message.text());
    });
    newPage.on('pageerror', (error) => page.adminErrors.push(error.message));
  };
  page.context().on('page', observePopup);
  const popupOpened = page.waitForEvent('popup');
  await localLink.click();
  const popup = await popupOpened;
  page.context().off('page', observePopup);
  await expect(popup).toHaveURL(localPortfolio);
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/\/admin\?/);
  await popup.close();
  await drawer.getByRole('button', { name: 'Close preview' }).click();
  await expect(drawer).toHaveCount(0);
  await row.getByRole('combobox', { name: /Status for Alex/ }).selectOption('offer');
  const expected = baseline.map((record) => record.id === 'c-101' ? {
    ...record, status: 'offer', notes: 'Private recruiter evaluation: recommend offer.',
    portfolioUrl: localPortfolio,
    interviewSchedule: 'Friday at 11 AM Pacific — Engineering follow-up.',
  } : record);
  expect(await storedRecords(page)).toEqual(expected);
  await row.getByRole('button', { name: /Edit submission for Alex/ }).click();
  await expect(editor.getByLabel('Recruiter Notes (private)')).toHaveValue('Private recruiter evaluation: recommend offer.');
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.dashboard-heading').getByRole('button', { name: 'Logout', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
  await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
  await page.getByRole('tab', { name: 'Candidate', exact: true }).click();
  await page.getByLabel('Username').fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/candidate$/);
  await expect(page.getByRole('heading', { name: 'Candidate portal' })).toBeVisible();
  await expect(page.getByText('Current status: Offer Extended', { exact: true })).toBeVisible();
  await expect(page.getByText('Friday at 11 AM Pacific — Engineering follow-up.', { exact: true })).toBeVisible();
  await expect(page.getByText('Private recruiter evaluation: recommend offer.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('jordan@example.com', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Current status: Offer Extended', { exact: true })).toBeVisible();
  await expect(page.getByText('Private recruiter evaluation: recommend offer.', { exact: true })).toHaveCount(0);
  expect(await storedRecords(page)).toEqual(expected);
});
