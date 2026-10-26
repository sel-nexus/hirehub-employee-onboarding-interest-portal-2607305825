/** Verify demo seed/reset against a real browser store; this slice does not run the spec. */
import { test, expect } from '@playwright/test';
import { AUTH_KEY } from '../src/features/admin/auth';
import { DEFAULT_SUBMISSIONS, DEFAULT_USERS, DEFAULT_DEPARTMENTS } from '../src/features/demo/mockData';

/** Capture browser failures before entering any application route. */
function captureErrors(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** Enter the existing recruiter gate through real shared navigation and form controls. */
async function loginAdmin(page) {
  await page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
}

/** Read actual persistence without replacing or intercepting any application dependency. */
async function readStore(page) {
  return page.evaluate(() => ({
    submissions: JSON.parse(localStorage.getItem('hirehub_submissions')),
    users: JSON.parse(localStorage.getItem('hirehub_users')),
    departments: JSON.parse(localStorage.getItem('hirehub_departments')),
    session: localStorage.getItem('hirehub_session'),
    theme: localStorage.getItem('hirehub_theme'),
  }));
}

/** Snapshot every real storage value to prove a canceled reset preserves exact bytes. */
async function readStorage(page) {
  return page.evaluate(() => ({
    local: Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])),
    session: Object.fromEntries(Object.keys(sessionStorage).sort().map((key) => [key, sessionStorage.getItem(key)])),
  }));
}

/** Await the native confirmation and its resolution, using only the public footer action. */
async function resetMockData(page, confirmed) {
  const handled = page.waitForEvent('dialog').then(async (dialog) => {
    const type = dialog.type();
    const message = dialog.message();
    if (confirmed) await dialog.accept();
    else await dialog.dismiss();
    expect(type).toBe('confirm');
    expect(message).toContain('theme preference will be kept');
  });
  await Promise.all([
    handled,
    page.getByRole('contentinfo', { name: 'Demo utilities' }).getByRole('button', { name: 'Reset Mock Data' }).click(),
  ]);
}

test('startup shows real preparing DOM before the ready home and valid baseline', async ({ page }) => {
  const errors = captureErrors(page);
  await page.addInitScript(() => {
    window.demoPreparingObservation = null;
    // Observe real committed DOM, including nodes removed within the same mutation batch.
    const observePreparing = (root) => {
      if (!(root instanceof Element || root instanceof Document)) return;
      const busy = root instanceof Element && root.matches('main[aria-busy="true"]')
        ? root : root.querySelector('main[aria-busy="true"]');
      const status = busy?.querySelector('[role="status"]');
      if (status?.textContent.trim() === 'Preparing local demo data…') {
        window.demoPreparingObservation = { text: status.textContent.trim(), busy: busy.getAttribute('aria-busy') };
      }
    };
    new MutationObserver((mutations) => {
      observePreparing(document);
      for (const mutation of mutations) {
        observePreparing(mutation.target);
        for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) observePreparing(node);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-busy'] });
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.demoPreparingObservation)).toEqual({
    text: 'Preparing local demo data…', busy: 'true',
  });
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
  const baseline = await readStore(page);
  expect(baseline.submissions).toHaveLength(8);
  expect(baseline.submissions).toEqual(DEFAULT_SUBMISSIONS);
  expect(baseline.users).toHaveLength(5);
  expect(baseline.users).toEqual(DEFAULT_USERS);
  expect(baseline.departments).toEqual(DEFAULT_DEPARTMENTS);
  expect(baseline.session).toBeNull();
  expect(errors).toEqual([]);
});

test('authorized local persistence and confirmed reset restore the curated baseline', async ({ page }) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByRole('contentinfo', { name: 'Demo utilities' })).toBeVisible();
  const baseline = await readStore(page);
  expect(baseline.submissions).toHaveLength(8);
  expect(new Set(baseline.submissions.map((record) => record.department))).toEqual(new Set(['Engineering', 'Design', 'Product', 'Marketing', 'Operations']));
  expect(new Set(baseline.submissions.map((record) => record.status))).toEqual(new Set(['applied', 'review', 'interview', 'offer', 'archived']));
  expect(baseline.users).toHaveLength(5);
  expect(baseline.users).toEqual(DEFAULT_USERS);
  expect(baseline.departments).toEqual(DEFAULT_DEPARTMENTS);
  expect(baseline.users).toEqual(expect.arrayContaining([
    expect.objectContaining({ username: 'admin', password: 'admin', role: 'admin' }),
    expect.objectContaining({ username: 'recruiter@hirehub.demo', password: 'admin123', role: 'admin' }),
    expect.objectContaining({ username: 'alex@example.com', password: 'password123', id: 'u-201' }),
    expect.objectContaining({ username: 'jordan@example.com', password: 'password123' }),
    expect.objectContaining({ username: 'taylor@example.com', password: 'password123' }),
  ]));
  await loginAdmin(page);
  await expect(page.getByRole('row')).toHaveCount(9);
  await expect(page.getByRole('cell', { name: 'Alex Rivera', exact: true })).toBeVisible();

  const authenticated = await readStore(page);
  const recruiterSession = JSON.parse(authenticated.session);
  expect(recruiterSession.role).toBe('admin');
  expect(authenticated.users).toContainEqual(expect.objectContaining({
    id: recruiterSession.userId, role: recruiterSession.role, displayName: recruiterSession.displayName,
  }));
  // Add stale data without removing the recruiter account or replacing its valid UI-created session.
  await page.evaluate((legacyAuthKey) => {
    const records = JSON.parse(localStorage.getItem('hirehub_submissions'));
    records[0].fullName = 'Alex Updated';
    localStorage.setItem('hirehub_submissions', JSON.stringify(records));
    const users = JSON.parse(localStorage.getItem('hirehub_users'));
    users.push({ id: 'test-user', role: 'candidate', username: 'test@example.com', password: 'test', displayName: 'Test User' });
    localStorage.setItem('hirehub_users', JSON.stringify(users));
    localStorage.setItem('hirehub_departments', JSON.stringify(['Custom Team']));
    localStorage.setItem('hirehub_theme', 'dark');
    localStorage.setItem('unrelated-demo-test', 'retain');
    sessionStorage.setItem(legacyAuthKey, 'true');
  }, AUTH_KEY);
  const edited = await readStore(page);
  const exactEditedStorage = await readStorage(page);
  expect(edited.users).toEqual([...baseline.users, {
    id: 'test-user', role: 'candidate', username: 'test@example.com', password: 'test', displayName: 'Test User',
  }]);
  expect(edited.departments).toEqual(['Custom Team']);
  expect(edited.session).toBe(authenticated.session);
  await page.getByRole('banner').getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Alex Updated', exact: true })).toBeVisible();
  expect(await readStore(page)).toEqual(edited);
  await page.reload();
  await expect(page.getByRole('cell', { name: 'Alex Updated', exact: true })).toBeVisible();
  expect(await readStore(page)).toEqual(edited);
  expect(await readStorage(page)).toEqual(exactEditedStorage);
  await resetMockData(page, false);
  expect(await readStore(page)).toEqual(edited);
  expect(await readStorage(page)).toEqual(exactEditedStorage);
  await expect(page.getByRole('cell', { name: 'Alex Updated', exact: true })).toBeVisible();

  await resetMockData(page, true);
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(/Mock data restored/);
  const restored = await readStore(page);
  expect(restored.submissions).toEqual(baseline.submissions);
  expect(restored.users).toEqual(baseline.users);
  expect(restored.departments).toEqual(baseline.departments);
  expect(restored.session).toBeNull();
  expect(restored.theme).toBe('dark');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), AUTH_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-demo-test'))).toBe('retain');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  expect((await readStore(page)).submissions).toEqual(baseline.submissions);
  await loginAdmin(page);
  await expect(page.getByRole('cell', { name: 'Alex Rivera', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Alex Updated', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('demo-baseline.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('stale identity is denied Admin access and guest footer reset restores credentials and baseline', async ({ page }) => {
  const errors = captureErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  const baseline = await readStore(page);
  expect(baseline.submissions).toHaveLength(8);
  expect(baseline.users).toHaveLength(5);
  await loginAdmin(page);
  const authenticated = await readStore(page);
  // Remove the current recruiter account and install a full-shaped but unmatched identity.
  await page.evaluate(({ session, legacyAuthKey }) => {
    localStorage.setItem('hirehub_users', JSON.stringify([
      { id: 'test-user', role: 'candidate', username: 'test@example.com', password: 'test', displayName: 'Test User' },
    ]));
    localStorage.setItem('hirehub_session', JSON.stringify({ ...JSON.parse(session), userId: 'stale-user' }));
    const records = JSON.parse(localStorage.getItem('hirehub_submissions'));
    records[0].fullName = 'Stale Candidate';
    localStorage.setItem('hirehub_submissions', JSON.stringify(records));
    localStorage.setItem('hirehub_departments', JSON.stringify(['Custom Team']));
    localStorage.setItem('hirehub_theme', 'dark');
    sessionStorage.setItem(legacyAuthKey, 'true');
  }, { session: authenticated.session, legacyAuthKey: AUTH_KEY });
  await page.getByRole('banner').getByRole('link', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Join Our Team' })).toBeVisible();
  await page.getByRole('banner').getByRole('link', { name: 'Admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
  const stale = await readStore(page);
  expect(stale.users).toHaveLength(1);
  expect(stale.users[0].username).toBe('test@example.com');
  expect(JSON.parse(stale.session).userId).toBe('stale-user');
  expect(stale.departments).toEqual(['Custom Team']);
  expect(stale.submissions[0].fullName).toBe('Stale Candidate');

  await resetMockData(page, true);
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(/Mock data restored/);
  const restored = await readStore(page);
  expect(restored.submissions).toHaveLength(8);
  expect(restored.submissions).toEqual(baseline.submissions);
  expect(restored.users).toEqual(baseline.users);
  expect(restored.departments).toEqual(baseline.departments);
  expect(restored.session).toBeNull();
  expect(restored.theme).toBe('dark');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), AUTH_KEY)).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  expect(await readStore(page)).toEqual(restored);
  await loginAdmin(page);
  await expect(page.getByRole('row')).toHaveCount(9);
  await expect(page.getByRole('cell', { name: 'Alex Rivera', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Stale Candidate', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('corrupt JSON recovers to seeded records without browser errors on mobile', async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    for (const key of ['hirehub_submissions', 'hirehub_users', 'hirehub_departments']) localStorage.setItem(key, '{corrupt');
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset Mock Data' })).toBeVisible();
  const data = await readStore(page);
  expect(data.submissions).toHaveLength(8);
  expect(data.users).toHaveLength(5);
  expect(data.departments).toEqual(['Engineering', 'Design', 'Product', 'Marketing', 'Operations']);
  await loginAdmin(page);
  await expect(page.getByRole('cell', { name: 'Alex Rivera', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('demo-mobile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('valid nonempty six-field legacy records survive initial seeding and reload', async ({ page }) => {
  const errors = captureErrors(page);
  const legacy = {
    id: 'legacy-record', fullName: 'Legacy Candidate', email: 'legacy@example.com',
    mobile: '0123456789', department: 'Engineering', submittedAt: '2026-03-04T12:00:00.000Z',
  };
  await page.addInitScript((record) => {
    if (localStorage.getItem('hirehub_submissions') === null) localStorage.setItem('hirehub_submissions', JSON.stringify([record]));
  }, legacy);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset Mock Data' })).toBeVisible();
  expect((await readStore(page)).submissions).toEqual([legacy]);
  await loginAdmin(page);
  await expect(page.getByRole('cell', { name: 'Legacy Candidate', exact: true })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('cell', { name: 'Legacy Candidate', exact: true })).toBeVisible();
  expect((await readStore(page)).submissions).toEqual([legacy]);
  expect(errors).toEqual([]);
});
