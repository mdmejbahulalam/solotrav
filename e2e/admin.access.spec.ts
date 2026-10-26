import { expect, test } from '@playwright/test';

test.describe('admin access', () => {
  for (const path of ['/', '/users', '/reports', '/roles', '/audit', '/settings', '/analytics']) {
    test(`${path} sends anonymous visitors to the staff sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('the staff sign-in states who may enter and is not indexable', async ({ page }) => {
    const res = await page.goto('/login');
    await expect(page.getByText('Authorised staff only')).toBeVisible();
    const robots = res?.headers()['x-robots-tag'] ?? (await page.locator('meta[name=robots]').getAttribute('content')) ?? '';
    expect(robots).toMatch(/noindex/);
  });
});
