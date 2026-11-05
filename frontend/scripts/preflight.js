/** Capture representative rendered structure and styles for human review. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL || 'http://localhost:4173';
const browser = await chromium.launch();
const output = 'preflight-evidence';
await mkdir(output, { recursive: true });
const captures = [];
try {
  for (const [device, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    /** Save ARIA, computed styles, HTML, and screenshots without rerunning journey specs. */
    async function capture(state) {
      const styles = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        return { font: body.fontFamily, color: body.color, background: getComputedStyle(document.documentElement).backgroundColor,
          viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, theme: document.documentElement.dataset.theme };
      });
      const aria = await page.locator('body').ariaSnapshot();
      await writeFile(`${output}/${device}-${state}.html`, await page.content());
      await page.screenshot({ path: `${output}/${device}-${state}.png`, fullPage: true });
      captures.push({ device, state, styles, aria, errors: [...errors] });
    }
    await page.goto(baseURL);
    await capture('home-light');
    await page.getByRole('link', { name: 'Login', exact: true }).click();
    await page.getByLabel('Account role').selectOption('candidate');
    await page.getByLabel('Username').fill('alex@example.com');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.getByRole('heading', { name: 'Candidate Portal' }).waitFor();
    await capture('candidate-light');
    await page.getByRole('button', { name: 'Dark theme (current: light)' }).click();
    await capture('candidate-dark');
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await page.getByRole('link', { name: 'Login', exact: true }).click();
    await page.getByLabel('Account role').selectOption('admin');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password', { exact: true }).fill('admin');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.getByRole('heading', { name: 'Recruiter Access' }).waitFor();
    await capture('recruiter-dark');
    await page.getByRole('button', { name: 'materials Alex Morgan Engineering submission-1' }).click();
    await page.getByRole('dialog').waitFor();
    await capture('materials-dialog');
    await context.close();
  }
} finally {
  await writeFile(`${output}/review.json`, JSON.stringify(captures, null, 2));
  await browser.close();
}
