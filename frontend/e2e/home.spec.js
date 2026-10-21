/** Exercise real home navigation and capture desktop/mobile preflight evidence. */
import { test, expect } from '@playwright/test';

/**
 * Capture browser failures before the single initial navigation in every test.
 * Args:
 *   context: The isolated Playwright page.
 */
test.beforeEach(async ({ page }) => {
  page.homeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      page.homeErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    page.homeErrors.push(error.message);
  });
  await page.goto('/');
});

/** Assert that every journey completed without browser-side failures. */
test.afterEach(async ({ page }) => {
  expect(page.homeErrors, 'Browser console and uncaught page errors').toEqual([]);
});

/** Verify the supplied content, responsive structure, and text-based preflight. */
test('home presents exact culture copy and responsive cards', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Build Your Future With Us' })).toBeVisible();
  await expect(page.getByText("Join a team that values innovation, collaboration, and growth. We're looking for talented people like you.")).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why Join Us?' })).toBeVisible();
  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(4);
  const features = [
    ['💡', 'Innovation', 'Work on cutting-edge projects that push boundaries and shape the future of technology.'],
    ['📈', 'Career Growth', 'Clear career paths, mentorship programs, and continuous learning opportunities for every team member.'],
    ['🤝', 'Great Culture', 'A diverse, inclusive workplace where collaboration and creativity thrive every day.'],
    ['🌍', 'Global Impact', "Your work reaches millions of users worldwide, making a real difference in people's lives."],
  ];
  for (const [index, [icon, title, description]] of features.entries()) {
    await expect(cards.nth(index).getByRole('heading', { name: title })).toBeVisible();
    await expect(cards.nth(index).getByText(icon)).toBeVisible();
    await expect(cards.nth(index).getByText(description)).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Ready to take the next step?' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const name of ['Home', 'Apply', 'Admin']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');

  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.feature-card')].map((card) => {
      const { x, y } = card.getBoundingClientRect();
      return { x, y };
    });
    const links = [...document.querySelectorAll('.main-nav a')].map((link) => link.getBoundingClientRect().y);
    return {
      mobile: window.innerWidth < 768,
      cards,
      links,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(layout.noOverflow).toBe(true);
  expect(new Set(layout.links).size).toBe(1);
  if (layout.mobile) {
    expect(new Set(layout.cards.map((card) => card.x)).size).toBe(1);
    expect(layout.cards[1].y).toBeGreaterThan(layout.cards[0].y);
  } else {
    expect(layout.cards[0].y).toBe(layout.cards[1].y);
    expect(layout.cards[2].y).toBe(layout.cards[3].y);
    expect(layout.cards[2].y).toBeGreaterThan(layout.cards[0].y);
  }

  await testInfo.attach('home-screenshot', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await testInfo.attach('home-accessibility', {
    body: await page.locator('body').ariaSnapshot(),
    contentType: 'text/yaml',
  });
  await testInfo.attach('home-html', {
    body: await page.content(),
    contentType: 'text/html',
  });
  const bodyStyles = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      color: style.color,
      backgroundColor: style.backgroundColor,
      colorScheme: style.colorScheme,
      margin: style.margin,
    };
  });
  await testInfo.attach('home-body-styles', {
    body: JSON.stringify(bodyStyles, null, 2),
    contentType: 'application/json',
  });
});

for (const name of ['Express Your Interest', 'Apply Now']) {
  /** Verify each independent CTA enters the candidate route through a click. */
  test(`${name} opens the apply route`, async ({ page }) => {
    const cta = page.getByRole('link', { name, exact: true });
    await expect(cta).toHaveAttribute('href', '/apply');
    await cta.click();
    await expect(page).toHaveURL(/\/apply$/);
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Apply', exact: true })).toHaveAttribute('aria-current', 'page');
  });
}

/** Follow all header routes without replacing navigation with direct goto calls. */
test('header links update the URL and active destination', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  for (const [name, pathname] of [['Apply', '/apply'], ['Admin', '/admin'], ['Home', '/']]) {
    await nav.getByRole('link', { name, exact: true }).click();
    expect(new URL(page.url()).pathname).toBe(pathname);
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    for (const other of ['Home', 'Apply', 'Admin'].filter((item) => item !== name)) {
      await expect(nav.getByRole('link', { name: other, exact: true })).not.toHaveAttribute('aria-current', 'page');
    }
  }
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'HireHub', exact: true }).click();
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Build Your Future With Us' })).toBeVisible();
});
