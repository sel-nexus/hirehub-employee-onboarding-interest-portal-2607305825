/** Verify login-only colors and the real demo-session journey on both projects. */
import { test, expect } from '@playwright/test';

/** Fail journeys on browser errors collected before the initial entry. */
test.beforeEach(({ page }) => {
  page.loginDarkErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') page.loginDarkErrors.push(message.text());
  });
  page.on('pageerror', (error) => page.loginDarkErrors.push(error.message));
});

/** Assert collected errors even when a journey assertion fails. */
test.afterEach(({ page }) => {
  expect(page.loginDarkErrors, 'Console and uncaught page errors').toEqual([]);
});

/** Read actual text, surface, border and keyboard-focus colors from a control. */
async function readStyles(locator, pseudo = null) {
  return locator.evaluate((element, pseudoElement) => {
    const style = getComputedStyle(element, pseudoElement);
    let surface = element;
    while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') {
      surface = surface.parentElement;
    }
    return {
      color: style.color,
      background: getComputedStyle(surface).backgroundColor,
      border: style.borderTopColor,
      outline: style.outlineColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: parseFloat(style.outlineWidth),
    };
  }, pseudo);
}

/** Calculate WCAG contrast for the browser's opaque RGB colors. */
function contrast(first, second) {
  /** Convert computed RGB channels to relative luminance. */
  function luminance(color) {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

/** Assert shared light tokens and header remain outside the login scope. */
async function expectLightShell(page) {
  expect(await page.locator('html').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor,
      text: style.color,
      scheme: style.colorScheme,
      card: style.getPropertyValue('--color-card').trim(),
    };
  })).toEqual({
    background: 'rgb(241, 245, 249)', text: 'rgb(30, 41, 59)', scheme: 'light', card: '#ffffff',
  });
  await expect(page.getByRole('banner')).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  await expect(page.getByRole('banner')).toHaveCSS('color', 'rgb(255, 255, 255)');
}

for (const preference of ['default', 'dark', 'light']) {
  test(`login is always dark with ${preference} OS preference and exits to light pages`, async ({ page }) => {
    if (preference !== 'default') await page.emulateMedia({ colorScheme: preference });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('link', { name: 'Admin', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    const main = page.getByRole('main');
    const card = page.locator('.auth-card');
    const username = page.getByLabel('Username', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    const submit = page.getByRole('button', { name: 'Login', exact: true });
    await expect(main).toHaveClass('auth-page login-dark');
    await expect(main).toHaveCSS('background-color', 'rgb(16, 18, 20)');
    await expect(main).toHaveCSS('color-scheme', 'dark');
    await expect(card).toHaveCSS('background-color', 'rgb(27, 30, 34)');
    expect(await main.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.top === 60 && bounds.bottom >= window.innerHeight;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectLightShell(page);
    for (const locator of [page.getByRole('heading', { name: 'Admin Login' }),
      page.locator('.auth-hint'), page.locator('.auth-disclaimer'),
      page.locator('label[for="admin-username"]'), page.locator('label[for="admin-password"]'), submit]) {
      const style = await readStyles(locator);
      expect(contrast(style.color, style.background)).toBeGreaterThanOrEqual(4.5);
    }
    for (const input of [username, password]) {
      await expect(input).toHaveCSS('background-color', 'rgb(20, 23, 27)');
      const style = await readStyles(input);
      expect(contrast(style.color, style.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(style.border, style.background)).toBeGreaterThanOrEqual(3);
      const placeholder = await readStyles(input, '::placeholder');
      expect(contrast(placeholder.color, placeholder.background)).toBeGreaterThanOrEqual(4.5);
    }
    await username.focus();
    await expect(username).toBeFocused();
    const usernameFocus = await readStyles(username);
    expect(usernameFocus.outlineStyle).toBe('solid');
    expect(usernameFocus.outlineWidth).toBeGreaterThanOrEqual(3);
    expect(contrast(usernameFocus.outline, 'rgb(27, 30, 34)')).toBeGreaterThanOrEqual(3);
    await page.keyboard.press('Tab');
    await expect(password).toBeFocused();
    for (const control of [password, submit]) {
      if (control === submit) await page.keyboard.press('Tab');
      await expect(control).toBeFocused();
      const focus = await readStyles(control);
      expect(focus.outlineStyle).toBe('solid');
      expect(focus.outlineWidth).toBeGreaterThanOrEqual(3);
      expect(contrast(focus.outline, 'rgb(27, 30, 34)')).toBeGreaterThanOrEqual(3);
    }
    await username.fill('admin');
    await password.fill('wrong');
    await submit.click();
    const error = page.getByRole('alert');
    await expect(error).toHaveText('Invalid credentials. Please try again.');
    for (const input of [username, password]) {
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(input).toHaveAttribute('aria-describedby', 'login-error');
      const style = await readStyles(input);
      expect(contrast(style.border, style.background)).toBeGreaterThanOrEqual(3);
    }
    const errorStyle = await readStyles(error);
    expect(contrast(errorStyle.color, errorStyle.background)).toBeGreaterThanOrEqual(4.5);
    await password.focus();
    const invalidFocus = await readStyles(password);
    expect(invalidFocus.outlineStyle).toBe('solid');
    expect(contrast(invalidFocus.outline, errorStyle.background)).toBeGreaterThanOrEqual(3);
    expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
    await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toHaveCount(0);

    await password.fill('admin');
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.locator('.login-dark')).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');
    await expectLightShell(page);
    await expect(page.locator('.dashboard-table-card')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await nav.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
    await expect(page.locator('.feature-card').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('.login-dark')).toHaveCount(0);
    await expectLightShell(page);
    await nav.getByRole('link', { name: 'Apply', exact: true }).click();
    await expect(page).toHaveURL(/\/apply$/);
    await expect(page.getByRole('button', { name: 'Submit Application' })).toBeVisible();
    await expect(page.locator('.submission-form')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByLabel('Full Name')).toHaveCSS('color', 'rgb(30, 41, 59)');
    await expect(page.getByLabel('Full Name')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.locator('.login-dark')).toHaveCount(0);
    await expectLightShell(page);
    await nav.getByRole('link', { name: 'Admin', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Submissions Dashboard' })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBe('true');
    await page.getByRole('banner').getByRole('button', { name: 'Logout', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => sessionStorage.getItem('hirehub_admin_auth'))).toBeNull();
    await page.getByRole('banner').getByRole('link', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('main')).toHaveCSS('background-color', 'rgb(16, 18, 20)');
    await expect(username).toHaveValue('');
    await expect(password).toHaveValue('');
    expect(await page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key !== 'hirehub_submissions'))).toEqual([]);
    expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  });
}
