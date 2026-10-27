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
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us', exact: true })).toBeVisible();
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

/** Attach meaningful invalid-form evidence using APIs supported by Playwright 1.50. */
async function captureInvalidForm(page, testInfo, state) {
  await testInfo.attach(`${state}-screenshot`, {
    body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
  });
  await testInfo.attach(`${state}-aria.yaml`, {
    body: await page.locator('body').ariaSnapshot(), contentType: 'text/yaml',
  });
  await testInfo.attach(`${state}-page.html`, {
    body: await page.content(), contentType: 'text/html',
  });
  const styles = await page.getByRole('form', { name: 'Application form' }).evaluate((form) => {
    const elements = [form, ...form.querySelectorAll('label, input, select, [role="alert"], button')];
    return elements.map((element) => {
      const computed = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName, id: element.id, text: element.textContent.trim(),
        value: 'value' in element ? element.value : undefined,
        ariaInvalid: element.getAttribute('aria-invalid'),
        ariaDescribedby: element.getAttribute('aria-describedby'),
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: Object.fromEntries([
          'color', 'background-color', 'border-color', 'border-width', 'border-style',
          'font-family', 'font-size', 'font-weight', 'line-height',
          'display', 'visibility', 'opacity', 'margin-top', 'margin-bottom', 'padding',
        ].map((property) => [property, computed.getPropertyValue(property)])),
      };
    });
  });
  await testInfo.attach(`${state}-computed-styles.json`, {
    body: JSON.stringify(styles, null, 2), contentType: 'application/json',
  });
}

/** Assert custom errors are visible, associated, and do not persist invalid records. */
test('invalid application shows errors below all fields and preserves invalid input', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Join Our Team' })).toBeVisible();
  await expect(page.getByText('Express your interest in working with us.')).toBeVisible();
  await expect(page.getByRole('link', { name: '← Back to Home' })).toHaveAttribute('href', '/');
  const baseline = await page.evaluate(() => localStorage.getItem('hirehub_submissions'));
  expect(JSON.parse(baseline)).toHaveLength(8);
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  for (const label of ['Full Name', 'Email Address', 'Mobile Number', 'Department of Interest']) {
    const field = page.getByLabel(label);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const description = await field.getAttribute('aria-describedby');
    await expect(page.locator(`#${description}`)).toBeVisible();
  }
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(baseline);
  await captureInvalidForm(page, testInfo, 'empty-invalid-form');
  await page.getByLabel('Full Name').fill('Alice1');
  await page.getByLabel('Email Address').fill('not-an-email');
  await page.getByLabel('Mobile Number').fill('123456789');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  await expect(page.getByLabel('Full Name')).toHaveValue('Alice1');
  await expect(page.getByLabel('Email Address')).toHaveValue('not-an-email');
  await expect(page.getByLabel('Mobile Number')).toHaveValue('123456789');
  expect(await page.evaluate(() => localStorage.getItem('hirehub_submissions'))).toBe(baseline);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await captureInvalidForm(page, testInfo, 'malformed-invalid-form');
});

/** Prove complete record persistence, confirmation lifecycle, reload survival, and duplicate protection. */
test('valid submit clears fields, dismisses success, persists on reload, and rejects case-variant duplicate', async ({ page }) => {
  const baseline = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
  expect(baseline).toHaveLength(8);
  const before = Date.now();
  await fillForm(page);
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText(SUCCESS_MESSAGE);
  for (const label of ['Full Name', 'Email Address', 'Mobile Number', 'Department of Interest']) {
    await expect(page.getByLabel(label)).toHaveValue('');
  }
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
  expect(records).toEqual([...baseline, {
    id: expect.any(String), userId: '', fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
    department: 'Engineering', status: 'received', submittedAt: expect.any(String), notes: '', portfolioUrl: '', sampleResume: '',
  }]);
  const appended = records[baseline.length];
  expect(appended.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  expect(new Date(appended.submittedAt).toISOString()).toBe(appended.submittedAt);
  expect(Date.parse(appended.submittedAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(appended.submittedAt)).toBeLessThanOrEqual(Date.now());
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
