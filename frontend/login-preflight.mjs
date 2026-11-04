/** Capture login accessibility, computed styles and HTML without replaying journey tests. */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.BASE_URL || 'http://localhost:4173';
const output = 'preflight-evidence';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const evidence = [];
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    await page.goto(baseURL);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Admin', exact: true }).click();
    for (const state of ['light', 'dark', 'dark-error']) {
      if (state === 'dark') await page.getByRole('button', { name: 'Dark mode' }).click();
      if (state === 'dark-error') await page.getByRole('button', { name: 'Login', exact: true }).click();
      const styles = await page.evaluate(() => {
        const selectors = ['body', '.auth-page', '.auth-card', '.auth-disclaimer', '.login-theme-toggle', '#admin-username', '.submission-button', '#login-error'];
        return Object.fromEntries(selectors.map((selector) => {
          const element = document.querySelector(selector);
          if (!element) return [selector, null];
          const style = getComputedStyle(element);
          return [selector, { color: style.color, background: style.backgroundColor, font: style.fontFamily,
            padding: style.padding, fontSize: style.fontSize, colorScheme: style.colorScheme,
            width: element.getBoundingClientRect().width }];
        }));
      });
      evidence.push(`## ${name} ${state}\nAccessibility:\n${JSON.stringify(await page.accessibility.snapshot(), null, 2)}\nStyles:\n${JSON.stringify(styles, null, 2)}\nHTML:\n${await page.content()}`);
      await page.screenshot({ path: `${output}/${name}-${state}.png`, fullPage: true });
    }
    await page.close();
  }
  await writeFile(`${output}/login-preflight.txt`, evidence.join('\n\n'), 'utf8');
  console.log('Captured six desktop/mobile light/dark/error states.');
} finally {
  await browser.close();
}
