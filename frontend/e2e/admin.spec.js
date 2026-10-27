/** Exercise real seeded recruiter review, maintenance and candidate handoff on desktop/mobile. */
import { test, expect } from '@playwright/test';

/** Capture browser errors before entering the application. */
test.beforeEach(async ({ page }) => {
  page.adminErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') page.adminErrors.push(message.text());
  });
  page.on('pageerror', (error) => page.adminErrors.push(error.message));
});

/** Fail every journey on browser errors, including the last interaction. */
test.afterEach(async ({ page }) => {
  expect(page.adminErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Inspect actual persisted records without mocks or storage fixture injection. */
async function storedRecords(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
}

/** Preserve visual and text-based evidence for the parent's browser verification. */
async function captureState(page, testInfo, state) {
  const prefix = `${testInfo.project.name}-${state}`;
  await testInfo.attach(`${prefix}-screenshot`, {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  await testInfo.attach(`${prefix}-accessibility`, {
    body: await page.locator('body').ariaSnapshot(), contentType: 'text/yaml',
  });
  await testInfo.attach(`${prefix}-html`, { body: await page.content(), contentType: 'text/html' });
  const styles = await page.evaluate(() => {
    const selectors = ['.dashboard-page', '.table-scroll', '.status-badge', '.edit-overlay', '.edit-dialog'];
    return Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const css = getComputedStyle(element);
      return [selector, {
        display: css.display, overflowX: css.overflowX, overflowY: css.overflowY,
        backgroundColor: css.backgroundColor, color: css.color, maxWidth: css.maxWidth,
        padding: css.padding, position: css.position,
      }];
    }));
  });
  await testInfo.attach(`${prefix}-styles`, { body: JSON.stringify(styles, null, 2), contentType: 'application/json' });
}

for (const [username, password] of [['admin', 'admin'], ['recruiter@hirehub.demo', 'admin123']]) {
  test(`${username} reviews and maintains submissions, then Alex sees the changed stage without internal notes`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(navigation).toBeVisible();
    const original = await storedRecords(page);
    expect(original).toHaveLength(8);
    const originalAlex = original.find((record) => record.email === 'alex@example.com');

    // Create a disposable entry through the public form, not by seeding storage.
    await navigation.getByRole('link', { name: 'Apply', exact: true }).click();
    await page.getByLabel('Full Name').fill('Alice Smith');
    await page.getByLabel('Email Address').fill('alice@example.com');
    await page.getByLabel('Mobile Number').fill('0123456789');
    await page.getByLabel('Department of Interest').selectOption('Engineering');
    await page.getByRole('button', { name: 'Submit Application' }).click();
    await expect(page.getByRole('status')).toHaveText('Thank you! Your interest has been submitted successfully.');
    expect(await storedRecords(page)).toHaveLength(9);

    await navigation.getByRole('link', { name: 'Admin', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toHaveCount(0);
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator('.stat-total dd')).toHaveText('9');
    await expect(page.getByRole('columnheader')).toHaveCount(8);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')).role)).toBe('admin');
    const region = page.getByRole('region', { name: 'Submissions table, scroll horizontally' });
    await expect(region).toHaveCSS('overflow-x', 'auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureState(page, testInfo, 'populated-dashboard');

    for (const department of ['Engineering', 'Design', 'Product', 'Marketing', 'Operations']) {
      await page.getByRole('button', { name: department, exact: true }).click();
      await expect(page.getByRole('button', { name: department, exact: true })).toHaveAttribute('aria-pressed', 'true');
      const expected = (await storedRecords(page)).filter((record) => record.department === department);
      await expect(page.getByRole('row')).toHaveCount(expected.length + 1);
      for (const record of expected) await expect(page.getByRole('cell', { name: record.email, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: 'All', exact: true }).click();
    const search = page.getByLabel('Search candidate name or email');
    await search.fill('ALEX@EXAMPLE');
    await expect(page.getByRole('row')).toHaveCount(2);
    await search.fill('Rivera');
    await page.getByRole('button', { name: 'Engineering', exact: true }).click();
    await page.getByLabel('Filter by stage').selectOption('interview');
    await expect(page.getByRole('cell', { name: 'alex@example.com', exact: true })).toBeVisible();
    await page.reload();
    await expect(search).toHaveValue('Rivera');
    await expect(page.getByLabel('Filter by stage')).toHaveValue('interview');
    await expect(page.getByRole('button', { name: 'Engineering', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(page.getByText('No submissions match your filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Engineering', exact: true }).click();

    const alexRow = page.getByRole('row').filter({ hasText: 'alex@example.com' });
    await alexRow.getByLabel(`Change stage for Alex Rivera, alex@example.com, ${originalAlex.id}`).selectOption('offer');
    await expect(page.getByText('No submissions match your filters.')).toBeVisible();
    await page.getByLabel('Filter by stage').selectOption('offer');
    await expect(alexRow.getByRole('status')).toHaveText('Offer Extended');
    expect((await storedRecords(page)).find((record) => record.id === originalAlex.id)).toEqual({ ...originalAlex, status: 'offer' });

    const reviewTrigger = alexRow.getByRole('button', { name: /Review submission for Alex Rivera/ });
    await reviewTrigger.click();
    const review = page.getByRole('dialog', { name: 'Review Submission' });
    await expect(review).toHaveAttribute('aria-modal', 'true');
    await expect(review.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(review.getByRole('button', { name: 'Save Notes' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(review.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await review.getByRole('button', { name: 'Preview Resume' }).click();
    await expect(review.getByRole('article')).toContainText('five years of experience');
    const portfolio = review.getByRole('link', { name: 'View portfolio (opens in a new tab)' });
    await expect(portfolio).toHaveAttribute('href', originalAlex.portfolioUrl);
    await expect(portfolio).toHaveAttribute('target', '_blank');
    await expect(portfolio).toHaveAttribute('rel', 'noopener noreferrer');
    const privateNote = 'Internal evaluation: ready for offer discussion.';
    await review.getByLabel('Internal Recruiter Notes').fill(privateNote);
    await review.getByRole('button', { name: 'Save Notes' }).click();
    await expect(review.getByRole('status')).toHaveText('Internal notes saved locally.');
    await captureState(page, testInfo, 'resume-review');
    await page.keyboard.press('Escape');
    await expect(review).toHaveCount(0);
    await expect(reviewTrigger).toBeFocused();

    await alexRow.getByRole('button', { name: /Edit submission for Alex Rivera/ }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Submission' });
    await expect(edit.getByLabel('Email Address')).toHaveAttribute('readonly', '');
    await edit.getByLabel('Mobile Number').fill('9876543210');
    await edit.getByLabel('Portfolio URL').fill('https://example.com/alex-work');
    await edit.getByLabel('Sample Resume').selectOption('UI/UX Case Study');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await expect(edit).toHaveCount(0);
    const expectedAlex = { ...originalAlex, status: 'offer', notes: privateNote,
      mobile: '9876543210', portfolioUrl: 'https://example.com/alex-work', sampleResume: 'UI/UX Case Study' };
    expect((await storedRecords(page)).find((record) => record.id === originalAlex.id)).toEqual(expectedAlex);
    await page.reload();
    await expect(alexRow.getByRole('status')).toHaveText('Offer Extended');
    await reviewTrigger.click();
    await expect(review.getByLabel('Internal Recruiter Notes')).toHaveValue(privateNote);
    await review.getByRole('button', { name: 'Preview Resume' }).click();
    await expect(review.getByRole('article')).toContainText('usability testing');
    await review.getByRole('button', { name: 'Close', exact: true }).click();

    // Retain invalid edit, cancel and delete-confirmation regression assertions.
    await search.fill('alice@example.com');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByLabel('Filter by stage').selectOption('');
    const aliceRow = page.getByRole('row').filter({ hasText: 'alice@example.com' });
    const beforeEdit = await storedRecords(page);
    await aliceRow.getByRole('button', { name: /Edit submission for Alice Smith/ }).click();
    await edit.getByLabel('Full Name').fill('Alice1');
    await edit.getByLabel('Mobile Number').fill('123');
    await edit.getByLabel('Department of Interest').selectOption('');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await expect(edit.getByRole('alert')).toHaveCount(3);
    for (const label of ['Full Name', 'Mobile Number', 'Department of Interest']) {
      await expect(edit.getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(await storedRecords(page)).toEqual(beforeEdit);
    await edit.getByLabel('Full Name').fill('Alice Updated');
    await edit.getByLabel('Mobile Number').fill('1111111111');
    await edit.getByLabel('Department of Interest').selectOption('Design');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await expect(aliceRow.getByRole('cell', { name: 'Alice Updated', exact: true })).toBeVisible();
    const beforeCancel = await storedRecords(page);
    await aliceRow.getByRole('button', { name: /Edit submission for Alice Updated/ }).click();
    await edit.getByLabel('Full Name').fill('Unsaved Name');
    await edit.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await storedRecords(page)).toEqual(beforeCancel);
    const deletion = aliceRow.getByRole('button', { name: /Delete submission for Alice Updated/ });
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toBe('Are you sure you want to delete this submission?');
      await dialog.dismiss();
    });
    await deletion.click();
    await expect(aliceRow).toBeVisible();
    expect(await storedRecords(page)).toEqual(beforeCancel);
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Are you sure you want to delete this submission?');
      await dialog.accept();
    });
    await deletion.click();
    await expect(page.getByText('No submissions match your filters.')).toBeVisible();
    await search.fill('');
    await expect(page.locator('.stat-total dd')).toHaveText('8');
    await page.reload();
    expect(await storedRecords(page)).toEqual(original.map((record) => record.id === expectedAlex.id ? expectedAlex : record));

    await page.locator('.dashboard-heading').getByRole('button', { name: 'Logout', exact: true }).click();
    expect(await page.evaluate(() => localStorage.getItem('hirehub_session'))).toBeNull();
    await navigation.getByRole('link', { name: 'Candidate', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    await page.getByLabel('Email Address').fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Offer Extended');
    await expect(page.locator('[aria-current="step"]')).toContainText('Final Decision');
    await expect(page.getByText('9876543210', { exact: true })).toBeVisible();
    await expect(page.getByText(privateNote, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Internal Recruiter Notes')).toHaveCount(0);
    await expect(page.getByText('jordan@example.com', { exact: true })).toHaveCount(0);
    await captureState(page, testInfo, 'candidate-handoff');
    expect(page.adminErrors).toEqual([]);
  });
}
