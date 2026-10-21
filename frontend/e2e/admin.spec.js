/** Specify the real candidate-to-admin CRUD journey on the existing desktop and mobile projects. */
import { test, expect } from '@playwright/test';

/** Capture every browser failure before the first navigation. */
test.beforeEach(async ({ page }) => {
  page.adminErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') page.adminErrors.push(message.text());
  });
  page.on('pageerror', (error) => page.adminErrors.push(error.message));
});

/** Fail each journey on console errors and uncaught page exceptions. */
test.afterEach(async ({ page }) => {
  expect(page.adminErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Requery the actual application dataset rather than mocking or seeding it. */
async function storedRecords(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
}

/** Save text-based preflight evidence and screenshots for human review. */
async function captureState(page, testInfo, state) {
  const prefix = `${testInfo.project.name}-${state}`;
  await testInfo.attach(`${prefix}-screenshot`, {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  // Playwright 1.50 exposes accessibility snapshots through Locator.ariaSnapshot().
  await testInfo.attach(`${prefix}-accessibility-snapshot`, {
    body: await page.locator('body').ariaSnapshot(), contentType: 'text/yaml',
  });
  await testInfo.attach(`${prefix}-html`, { body: await page.content(), contentType: 'text/html' });
  const styles = await page.evaluate(() => {
    const selectors = ['.dashboard-page', '.dashboard-stats', '.table-scroll', '.department-badge', '.edit-overlay', '.edit-dialog'];
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

/** Exercise create, login, review, validation, edit/cancel, confirmed delete, and reload persistence. */
test('candidate submission is reviewed, edited, cancelled and deleted through the real admin workflow', async ({ page }, testInfo) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(page).toHaveURL(/\/apply$/);
  await page.getByLabel('Full Name').fill('Alice Smith');
  await page.getByLabel('Email Address').fill('alice@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText('Thank you! Your interest has been submitted successfully.');
  const original = await storedRecords(page);
  expect(original).toEqual([{
    id: expect.any(String), fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
    department: 'Engineering', submittedAt: expect.any(String),
  }]);
  const formattedDate = new Date(original[0].submittedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  await navigation.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toHaveCount(0);
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');
  // Locate the semantic definition list and its associated summary values.
  const stats = page.locator('dl[aria-label="Submission summary"]');
  await expect(stats.locator('.stat-total dd')).toHaveText('1');
  await expect(stats.locator('.stat-departments dd')).toHaveText('1');
  await expect(stats.locator('.stat-latest dd')).toHaveText(formattedDate);
  const row = page.getByRole('row').filter({ hasText: 'alice@example.com' });
  for (const value of ['1', 'Alice Smith', 'alice@example.com', '0123456789', 'Engineering', formattedDate]) {
    await expect(row.getByRole('cell', { name: value, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('columnheader')).toHaveCount(7);
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
  await modal.getByLabel('Full Name').fill('Alice Updated');
  await modal.getByLabel('Mobile Number').fill('9876543210');
  await modal.getByLabel('Department of Interest').selectOption('Design');
  await modal.getByRole('button', { name: 'Save Changes' }).click();
  await expect(modal).toHaveCount(0);
  await expect(row.getByRole('cell', { name: 'Alice Updated', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: '9876543210', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: 'Design', exact: true })).toBeVisible();
  const updated = [{ ...original[0], fullName: 'Alice Updated', mobile: '9876543210', department: 'Design' }];
  expect(await storedRecords(page)).toEqual(updated);
  await expect(stats.locator('.stat-total dd')).toHaveText('1');
  await expect(stats.locator('.stat-departments dd')).toHaveText('1');
  await expect(stats.locator('.stat-latest dd')).toHaveText(formattedDate);
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
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();
  await expect(stats.locator('.stat-total dd')).toHaveText('0');
  await expect(stats.locator('.stat-departments dd')).toHaveText('0');
  await expect(stats.locator('.stat-latest dd')).toHaveText('N/A');
  expect(await storedRecords(page)).toEqual([]);
  await page.reload();
  await expect(page.getByText('No submissions yet.', { exact: true })).toBeVisible();
  expect(await storedRecords(page)).toEqual([]);
  await page.locator('.dashboard-heading').getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
  await navigation.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
});
