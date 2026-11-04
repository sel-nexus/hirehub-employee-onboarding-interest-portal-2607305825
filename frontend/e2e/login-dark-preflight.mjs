/** Capture login states and unchanged public pages against an already-running server. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import config from '../playwright.config.js';

const outputDirectory = new URL('../test-results/', import.meta.url);
const reportPath = new URL('login-dark-preflight.txt', outputDirectory);

/** Save the accessibility tree, computed styles, HTML and a reviewer screenshot. */
async function capture(page, name, errors) {
  const accessibility = await page.accessibility.snapshot({ interestingOnly: false });
  const styles = await page.evaluate(() => {
    const selectors = ['html', 'body', '.site-header', 'main', '.auth-card', 'h1',
      '.auth-hint', '.auth-disclaimer', '.submission-field label', '.submission-field input',
      '.submission-button', '.field-error', '.feature-card', '.submission-form'];
    return selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        selector, tag: element.tagName, id: element.id, className: element.className,
        color: style.color, background: style.backgroundColor, border: style.borderColor,
        scheme: style.colorScheme, outline: style.outline, shadow: style.boxShadow,
        font: style.font, padding: style.padding, margin: style.margin,
        minHeight: style.minHeight, width: bounds.width, top: bounds.top, bottom: bounds.bottom,
        placeholder: element.matches('input') ? getComputedStyle(element, '::placeholder').color : null,
      };
    }));
  });
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, outputDirectory)), fullPage: true });
  await appendFile(reportPath, `\n=== ${name} ===\nURL: ${page.url()}\nAccessibility:\n${JSON.stringify(accessibility, null, 2)}\nComputed styles:\n${JSON.stringify(styles, null, 2)}\nBrowser errors:\n${JSON.stringify(errors)}\nHTML:\n${await page.content()}\n`);
}

/** Visit representative states on the existing desktop/mobile device contracts. */
async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(reportPath, `Login-only dark preflight\nBase URL: ${config.use.baseURL}\n`);
  const browser = await chromium.launch();
  try {
    for (const project of config.projects) {
      const { defaultBrowserType, ...deviceOptions } = project.use;
      const context = await browser.newContext({ ...deviceOptions, baseURL: config.use.baseURL });
      const errors = [];
      try {
        const page = await context.newPage();
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto('/admin');
        await expect(page.getByRole('heading', { name: 'Admin Login' })).toBeVisible();
        await capture(page, `${project.name}-login-normal`, errors);
        await page.getByLabel('Username', { exact: true }).fill('admin');
        await page.getByLabel('Password', { exact: true }).fill('wrong');
        await page.getByRole('button', { name: 'Login', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveText('Invalid credentials. Please try again.');
        await page.getByLabel('Password', { exact: true }).focus();
        await capture(page, `${project.name}-login-error`, errors);
        const nav = page.getByRole('navigation', { name: 'Main navigation' });
        await nav.getByRole('link', { name: 'Home', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Build Your Future With Us' })).toBeVisible();
        await capture(page, `${project.name}-home-light`, errors);
        await nav.getByRole('link', { name: 'Apply', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Submit Application' })).toBeVisible();
        await capture(page, `${project.name}-apply-light`, errors);
        expect(errors, `${project.name} console and page errors`).toEqual([]);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  console.error(error);
  await appendFile(reportPath, `\nCAPTURE FAILED: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
