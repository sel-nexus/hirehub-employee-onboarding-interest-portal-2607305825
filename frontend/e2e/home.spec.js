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
  // Five guest links supersede the original three-link landing navigation.
  await expect(nav.getByRole('link')).toHaveCount(5);
  for (const name of ['Home', 'Apply', 'Candidate portal', 'Admin', 'Register']) {
    const link = nav.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await link.click({ trial: true });
  }
  const banner = page.getByRole('banner');
  for (const name of ['HireHub', 'Login']) {
    const link = banner.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await link.click({ trial: true });
  }
  const theme = nav.getByRole('button', { name: /Switch to (light|dark) theme/ });
  await expect(theme).toBeVisible();
  await expect(theme).toBeEnabled();
  const wasDark = await theme.getAttribute('aria-pressed');
  await theme.click();
  await expect(theme).toHaveAttribute('aria-pressed', wasDark === 'true' ? 'false' : 'true');
  await theme.click();
  await expect(theme).toHaveAttribute('aria-pressed', wasDark);
  await expect(nav.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');

  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.feature-card')].map((card) => {
      const { x, y } = card.getBoundingClientRect();
      return { x, y };
    });
    const links = [...document.querySelectorAll('.main-nav a')].map((link) => link.getBoundingClientRect().y);
    const header = document.querySelector('.site-header').getBoundingClientRect();
    const controls = [...document.querySelectorAll('.site-header a, .site-header button')].map((control) => {
      const { left, right, top, bottom, width, height } = control.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    });
    return {
      mobile: window.innerWidth < 768,
      viewportWidth: window.innerWidth,
      headerBottom: header.bottom,
      cards,
      links,
      controls,
      noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
    };
  });
  expect(layout.noOverflow).toBe(true);
  expect(layout.controls).toHaveLength(8); // Five nav links, brand, Login, and theme.
  for (const control of layout.controls) {
    expect(control.width).toBeGreaterThan(0);
    expect(control.height).toBeGreaterThan(0);
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(control.top).toBeGreaterThanOrEqual(0);
    expect(control.bottom).toBeLessThanOrEqual(layout.headerBottom);
  }
  if (layout.mobile) {
    // Responsive CSS permits multiple nav rows; visibility/actionability remain required.
    expect(new Set(layout.cards.map((card) => card.x)).size).toBe(1);
    expect(layout.cards[1].y).toBeGreaterThan(layout.cards[0].y);
  } else {
    expect(new Set(layout.links).size).toBe(1);
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
  const destinations = [['Apply', '/apply'], ['Candidate portal', '/candidate'], ['Admin', '/admin'], ['Register', '/register'], ['Home', '/']];
  for (const [name, pathname] of destinations) {
    await nav.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${pathname}$`));
    expect(new URL(page.url()).pathname).toBe(pathname);
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    for (const [other] of destinations.filter(([item]) => item !== name)) {
      await expect(nav.getByRole('link', { name: other, exact: true })).not.toHaveAttribute('aria-current', 'page');
    }
  }
  // PRD42 supersedes Login's former /admin destination with the shared role chooser.
  const login = page.getByRole('banner').getByRole('link', { name: 'Login', exact: true });
  await expect(login).toHaveAttribute('href', '/login');
  await login.click();
  await expect(page).toHaveURL(/\/login$/);
  const candidateTab = page.getByRole('tab', { name: 'Candidate', exact: true });
  const adminTab = page.getByRole('tab', { name: 'Administrator / Recruiter' });
  await expect(candidateTab).toBeVisible();
  await expect(candidateTab).toHaveAttribute('aria-selected', 'true');
  await expect(adminTab).toBeVisible();
  await expect(adminTab).toHaveAttribute('aria-selected', 'false');
  await adminTab.click();
  await expect(adminTab).toHaveAttribute('aria-selected', 'true');
  await expect(candidateTab).toHaveAttribute('aria-selected', 'false');
  await candidateTab.click();
  await expect(candidateTab).toHaveAttribute('aria-selected', 'true');
  await expect(adminTab).toHaveAttribute('aria-selected', 'false');
  for (const [name] of destinations) {
    await expect(nav.getByRole('link', { name, exact: true })).not.toHaveAttribute('aria-current', 'page');
  }
  await page.getByRole('link', { name: 'HireHub', exact: true }).click();
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Build Your Future With Us' })).toBeVisible();
});
