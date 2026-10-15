import { test, expect } from '@playwright/test';

test('local login shows multiple restaurants and preserves selection on reload', async ({ page, baseURL }) => {
  // Prepare a local session with two restaurants
  const session = {
    userId: 'test-user',
    email: 'conta.teste@example.com',
    authMode: 'local',
    userFullName: 'Conta Teste',
    globalRole: 'user',
    memberships: [
      {
        membershipId: 'm-1',
        accountId: 'acc-1',
        restaurantId: 'r-katzsu',
        restaurantName: 'KatzSu',
        role: 'viewer'
      },
      {
        membershipId: 'm-2',
        accountId: 'acc-1',
        restaurantId: 'r-nosso-ipanema',
        restaurantName: 'Nosso Ipanema',
        role: 'viewer'
      }
    ],
    activeRole: 'viewer',
    activeRestaurantId: 'r-katzsu',
    activeRestaurantName: 'KatzSu'
  };

  // Inject session into localStorage before the app loads
  await page.addInitScript((sessionStr) => {
    const key = 'grest.auth.session';
    try {
      localStorage.setItem(key, sessionStr);
    } catch (e) {
      // noop
    }
  }, JSON.stringify(session));

  // Go to the app root
  await page.goto('/');

  const switcher = page.locator('.restaurant-switcher');
  await expect(switcher.locator('summary')).toContainText('KatzSu');
  await switcher.locator('summary').click();
  await expect(switcher.getByRole('button', { name: 'KatzSu' })).toBeVisible();
  await switcher.getByRole('button', { name: 'Nosso Ipanema' }).click();
  await expect(switcher.locator('summary')).toContainText('Nosso Ipanema');
  await expect(switcher).not.toHaveAttribute('open', '');
  await page.reload();
  await expect(switcher.locator('summary')).toContainText('Nosso Ipanema');
  await expect(page.locator('.workspace-context-user strong')).toHaveText('Conta Teste');
  await expect(page.locator('.sidebar-account-menu button')).toHaveCount(2);
  await expect(page.locator('.sidebar-account-menu .profile-avatar')).toHaveCount(0);
  // Give the real shell a long page even when the fixture has no imported data.
  await page.locator('.dashboard-content').evaluate(element => {
    const filler = document.createElement('div');
    filler.style.height = '2400px';
    filler.setAttribute('aria-hidden', 'true');
    element.append(filler);
  });
  const bar = page.getByLabel('Restaurante e usuário ativos', { exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
  for (const width of [320, 390, 768, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 850 });
    if (width > 1180) {
      for (const height of [850, 1000]) {
        await page.setViewportSize({ width, height });
        for (const scrollY of [0, 500, 1000]) {
          await page.evaluate(value => window.scrollTo(0, value), scrollY);
          await expect.poll(async () => {
            const logo = await page.locator('.dashboard-sidebar-brand .brand-logo-frame').boundingBox();
            const selector = await switcher.locator('summary').boundingBox();
            const user = await page.locator('.workspace-context-user').boundingBox();
            const logoCenter = logo!.y + logo!.height / 2;
            return Math.max(Math.abs(logoCenter - (selector!.y + selector!.height / 2)), Math.abs(logoCenter - (user!.y + user!.height / 2)));
          }).toBeLessThan(1);
        }
      }
      await page.setViewportSize({ width, height: 850 });
    }
    await page.evaluate(() => window.scrollTo(0, 1000));
    await expect.poll(async () => {
      const bounds = await bar.boundingBox();
      const expectedTop = await bar.evaluate(element => parseFloat(getComputedStyle(element).top));
      return Math.abs(bounds!.y - expectedTop);
    }).toBeLessThan(2);
    const barBounds = await bar.boundingBox();
    const selectorBounds = await switcher.boundingBox();
    const userBounds = await page.locator('.workspace-context-user').boundingBox();
    expect(selectorBounds!.y).toBeGreaterThanOrEqual(barBounds!.y);
    expect(selectorBounds!.y + selectorBounds!.height).toBeLessThanOrEqual(barBounds!.y + barBounds!.height);
    expect(userBounds!.x).toBeGreaterThanOrEqual(selectorBounds!.x + selectorBounds!.width);
    if (width <= 1180) {
      const navBounds = await page.locator('.dashboard-sidebar').boundingBox();
      expect(barBounds!.y).toBeGreaterThanOrEqual(navBounds!.y + navBounds!.height);
    }
    await expect(switcher).toHaveCSS('position', 'relative');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await switcher.locator('summary').click();
    const bounds = await switcher.locator('.restaurant-switcher-menu').boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(851);
    await page.keyboard.press('Escape');
  }
  }
  await page.screenshot({ path: 'test-results/restaurant-selector.png' });
  await page.locator('.workspace-context-user').click();
  await expect(page.locator('.account-panel')).toBeVisible();
  await expect(bar).toBeVisible();
  await expect(switcher.locator('summary')).toContainText('Nosso Ipanema');
});
