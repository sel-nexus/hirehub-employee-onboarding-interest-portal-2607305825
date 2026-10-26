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
  page.applyBaseline = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
  expect(page.applyBaseline).toHaveLength(8);
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
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  for (const label of ['Full Name', 'Email Address', 'Mobile Number', 'Department of Interest']) {
    const field = page.getByLabel(label);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const description = await field.getAttribute('aria-describedby');
    await expect(page.locator(`#${description}`)).toBeVisible();
  }
  await captureInvalidForm(page, testInfo, 'empty-invalid-form');
  await page.getByLabel('Full Name').fill('Alice1');
  await page.getByLabel('Email Address').fill('not-an-email');
  await page.getByLabel('Mobile Number').fill('123456789');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('alert')).toHaveCount(4);
  await expect(page.getByLabel('Full Name')).toHaveValue('Alice1');
  await expect(page.getByLabel('Email Address')).toHaveValue('not-an-email');
  await expect(page.getByLabel('Mobile Number')).toHaveValue('123456789');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')))).toEqual(page.applyBaseline);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await captureInvalidForm(page, testInfo, 'malformed-invalid-form');
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
  expect(records).toEqual([...page.applyBaseline, {
    id: expect.any(String), fullName: 'Alice Smith', email: 'alice@example.com', mobile: '0123456789',
    department: 'Engineering', submittedAt: expect.any(String),
  }]);
  const created = records.at(-1);
  expect(created.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  expect(new Date(created.submittedAt).toISOString()).toBe(created.submittedAt);
  expect(Date.parse(created.submittedAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(created.submittedAt)).toBeLessThanOrEqual(Date.now());
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

/** Register through the UI, validate materials, persist two applications and read them as the candidate. */
test('new candidate saves bundled materials with honest identity and multiple application persistence', async ({ page }) => {
  const baseline = page.applyBaseline;
  await page.goto('/register');
  await page.getByLabel('Full Name').fill('New Candidate');
  await page.getByLabel('Email Address').fill('newcandidate@example.com');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/candidate$/);
  await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_session')));
  expect(session).toMatchObject({ role: 'candidate', displayName: 'New Candidate', userId: expect.any(String) });
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await navigation.getByRole('link', { name: 'Apply', exact: true }).click();
  const email = page.getByLabel('Email Address');
  await expect(email).toHaveValue('newcandidate@example.com');
  await expect(email).toHaveAttribute('readonly', '');
  await email.click();
  await page.keyboard.type('spoof@example.com');
  await expect(email).toHaveValue('newcandidate@example.com');
  await page.getByLabel('Full Name').fill('New Candidate');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Product');
  const portfolio = page.getByLabel('Portfolio URL (optional)');
  const sample = page.getByLabel('Sample Resume (optional)');
  await expect(sample.locator('option')).toHaveText([
    'No sample resume', 'Frontend Software Engineer (5 YOE)', 'Full-Stack Developer Resume (Sample)', 'UI/UX Case Study',
  ]);
  await portfolio.fill('javascript:alert(1)');
  await sample.selectOption('Full-Stack Developer Resume (Sample)');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(portfolio).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveText('Use an http or https portfolio URL.');
  await expect(portfolio).toHaveValue('javascript:alert(1)');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')))).toEqual(baseline);
  await portfolio.fill('https://example.com/newcandidate');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText(SUCCESS_MESSAGE);
  await expect(portfolio).toHaveValue('');
  await expect(sample).toHaveValue('');
  await expect(email).toHaveValue('newcandidate@example.com');
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
  expect(first).toEqual([...baseline, {
    id: expect.any(String), userId: session.userId, fullName: 'New Candidate', email: 'newcandidate@example.com',
    mobile: '0123456789', department: 'Product', status: 'applied', submittedAt: expect.any(String),
    portfolioUrl: 'https://example.com/newcandidate', sampleResume: 'Full-Stack Developer Resume (Sample)',
  }]);
  await page.getByLabel('Full Name').fill('New Candidate');
  await page.getByLabel('Mobile Number').fill('0123456789');
  await page.getByLabel('Department of Interest').selectOption('Engineering');
  await sample.selectOption('UI/UX Case Study');
  await page.getByRole('button', { name: 'Submit Application' }).click();
  await expect(page.getByRole('status')).toHaveText(SUCCESS_MESSAGE);
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')));
  expect(records).toEqual([...first, {
    id: expect.any(String), userId: session.userId, fullName: 'New Candidate', email: 'newcandidate@example.com',
    mobile: '0123456789', department: 'Engineering', status: 'applied', submittedAt: expect.any(String), sampleResume: 'UI/UX Case Study',
  }]);
  expect(records.at(-1).id).not.toBe(first.at(-1).id);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hirehub_submissions')))).toEqual(records);
  await navigation.getByRole('link', { name: 'Candidate portal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product application', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Engineering application', exact: true })).toBeVisible();
  await expect(page.getByText('Current status: Application Received', { exact: true })).toHaveCount(2);
  await expect(page.getByText('alex@example.com', { exact: true })).toHaveCount(0);
});
