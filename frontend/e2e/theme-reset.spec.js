/** Exercise real local themes/reset journeys and attach desktop/mobile review evidence. */
import { test, expect } from '@playwright/test';

test.setTimeout(60000);
const browserErrors = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = [];
  browserErrors.set(page, errors);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => { expect(browserErrors.get(page)).toEqual([]); });

/** Attach human screenshots and raw ARIA/HTML/computed-style evidence for the current state. */
async function capture(page, testInfo, label) {
  await testInfo.attach(`${label}-screenshot`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  const aria = page.accessibility?.snapshot
    ? JSON.stringify(await page.accessibility.snapshot(), null, 2)
    : await page.locator('body').ariaSnapshot();
  await testInfo.attach(`${label}-aria`, { body: aria, contentType: 'text/plain' });
  await testInfo.attach(`${label}-html`, { body: await page.content(), contentType: 'text/html' });
  const styles = await page.evaluate(() => {
    /** Record semantic surface colors and typography without mutating application state. */
    function describe(element) {
      const css = getComputedStyle(element);
      return {
        tag: element.tagName, className: element.className,
        label: element.getAttribute('aria-label'), text: element.textContent.trim().slice(0, 100),
        background: css.backgroundColor, color: css.color, border: css.borderColor,
        font: css.fontFamily, fontSize: css.fontSize, padding: css.padding,
        maxHeight: css.maxHeight, overflowX: css.overflowX, overflowY: css.overflowY,
      };
    }
    return {
      theme: document.documentElement.dataset.theme,
      viewport: { width: innerWidth, height: innerHeight },
      body: describe(document.body), root: describe(document.documentElement),
      documentWidth: document.documentElement.scrollWidth,
      surfaces: [...document.querySelectorAll('.site-header, .hero, .auth-card, .stat-card, .dashboard-table-card, .edit-dialog, .status-badge, section[aria-labelledby^="application-"], ol[aria-label="Hiring progress"], .demo-utility')].map(describe),
    };
  });
  await testInfo.attach(`${label}-styles`, { body: JSON.stringify(styles, null, 2), contentType: 'application/json' });
}

/** Verify the actual root, body and card surfaces use the PRD colors in the selected theme. */
async function expectTheme(page, theme) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.getByRole('button', { name: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme` }))
    .toHaveAttribute('aria-pressed', String(theme === 'dark'));
  await expect(page.locator('body')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(15, 23, 42)' : 'rgb(248, 250, 252)');
  await expect(page.locator('.site-header')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(30, 41, 59)' : 'rgb(255, 255, 255)');
  await expect(page.locator('body')).toHaveCSS('font-family', /-apple-system.*BlinkMacSystemFont.*Segoe UI.*Roboto.*sans-serif/);
  const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
}

/** Read actual persisted datasets for before/after reset equality assertions. */
async function datasets(page) {
  return page.evaluate(() => ({
    submissions: JSON.parse(localStorage.getItem('hirehub_submissions')),
    users: JSON.parse(localStorage.getItem('hirehub_users')),
    departments: JSON.parse(localStorage.getItem('hirehub_departments')),
    session: localStorage.getItem('hirehub_session'), theme: localStorage.getItem('hirehub_theme'),
  }));
}

for (const initialTheme of ['light', 'dark']) {
  test(`OS ${initialTheme}, persistent toggles and representative portal/dialog surfaces`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: initialTheme });
    await page.goto('/'); // Initial entry only; all app navigation below uses real links.
    await expect(page.getByRole('heading', { name: 'Build Your Future With Us', exact: true })).toBeVisible();
    await expectTheme(page, initialTheme);
    expect((await datasets(page)).theme).toBeNull();
    const changedTheme = initialTheme === 'dark' ? 'light' : 'dark';
    await page.emulateMedia({ colorScheme: changedTheme });
    await expectTheme(page, changedTheme); // Follow OS until the visitor explicitly chooses.
    await page.getByRole('button', { name: `Switch to ${initialTheme} theme` }).click();
    await expectTheme(page, initialTheme);
    expect((await datasets(page)).theme).toBe(initialTheme);
    await page.emulateMedia({ colorScheme: changedTheme });
    await expectTheme(page, initialTheme); // Saved preference wins over subsequent OS changes.
    await page.reload();
    await expectTheme(page, initialTheme);
    await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
    await capture(page, testInfo, `${initialTheme}-login`);
    await page.getByLabel('Email Address').fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('incorrect');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
    await capture(page, testInfo, `${initialTheme}-login-error`);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Candidate Portal' })).toBeVisible();
    await expect(page.getByText('Welcome, Alex Rivera.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Hiring progress' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Current stage' })).toBeVisible();
    expect((await datasets(page)).session).not.toBeNull();
    await capture(page, testInfo, `${initialTheme}-candidate`);
    await page.getByRole('button', { name: 'Edit contact details' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit Contact Details' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Full Name')).toBeFocused();
    await capture(page, testInfo, `${initialTheme}-candidate-dialog`);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit contact details' })).toBeFocused();
    await page.getByRole('banner').getByRole('button', { name: 'Logout', exact: true }).click();
    await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
    await page.getByRole('tab', { name: 'Administrator / Recruiter' }).click();
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password', { exact: true }).fill('admin');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(9);
    await expectTheme(page, initialTheme);
    await capture(page, testInfo, `${initialTheme}-dashboard`);
    await page.getByRole('button', { name: 'Review submission for Alex Rivera, alex@example.com', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Review Submission' });
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Preview Resume', exact: true }).click();
    await expect(review.getByRole('article', { name: 'Local resume preview' })).toBeVisible();
    await capture(page, testInfo, `${initialTheme}-review-dialog`);
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: `Switch to ${changedTheme} theme` }).click();
    await expectTheme(page, changedTheme);
    await capture(page, testInfo, `${changedTheme}-dashboard-toggled`);
    expect(browserErrors.get(page)).toEqual([]);
  });
}

test('candidate and recruiter one-click reset restore exact baseline, stale accounts and session while retaining theme', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us', exact: true })).toBeVisible();
  const baseline = await datasets(page);
  expect(baseline.submissions).toHaveLength(8);
  expect(baseline.users).toHaveLength(10);
  expect(baseline.departments).toEqual(['Engineering', 'Design', 'Product', 'Marketing', 'Operations']);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Register' }).click();
  await page.getByLabel('Full Name').fill('Reset Test Candidate');
  await page.getByLabel('Email Address').fill('reset-test@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByLabel('Confirm Password').fill('password123');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  await capture(page, testInfo, 'dark-new-candidate-empty');
  await page.getByRole('link', { name: 'Start an application' }).click();
  await page.getByLabel('Full Name').fill('Reset Test Candidate');
  await page.getByLabel('Email Address').fill('reset-test@example.com');
  await page.getByLabel('Mobile Number').fill('4155552671');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('main').getByRole('status')).toContainText('submitted successfully');
  expect((await datasets(page)).submissions).toHaveLength(9);
  expect((await datasets(page)).users).toHaveLength(11);
  await page.getByRole('banner').getByRole('link', { name: 'Candidate Portal' }).click();
  await expect(page.getByRole('heading', { name: 'Engineering application' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset Mock Data' }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByRole('contentinfo').getByRole('status')).toContainText('Eight sample applications');
  expect(await datasets(page)).toEqual({ ...baseline, session: null, theme: 'dark' });
  await expectTheme(page, 'dark');
  await capture(page, testInfo, 'dark-candidate-reset-home');
  await page.getByRole('banner').getByRole('link', { name: 'Candidate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Candidate Login' })).toBeVisible();
  await page.getByLabel('Email Address').fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('Welcome, Alex Rivera.')).toBeVisible(); // Default accounts really work after reset.
  await page.getByRole('banner').getByRole('button', { name: 'Logout', exact: true }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true }).click();
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete submission for Alex Rivera, alex@example.com', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(8);
  expect((await datasets(page)).submissions).toHaveLength(7);
  await page.getByRole('button', { name: 'Reset Mock Data' }).click();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  expect(await datasets(page)).toEqual({ ...baseline, session: null, theme: 'dark' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us', exact: true })).toBeVisible();
  await expectTheme(page, 'dark');
  expect(await datasets(page)).toEqual({ ...baseline, session: null, theme: 'dark' });
  await capture(page, testInfo, 'dark-recruiter-reset-reloaded');
  expect(browserErrors.get(page)).toEqual([]);
});
