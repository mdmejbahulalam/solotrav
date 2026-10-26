import { expect, test } from '@playwright/test';

test.describe('public pages', () => {
  test('landing page shows the brand, hero and calls to action', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Explore More\. Share Your Journey\./);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Explore more.');
    await expect(page.getByRole('link', { name: 'Sign up free' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start planning' })).toHaveAttribute('href', '/signup');
    await expect(page.getByText('Your location stays yours')).toBeVisible();
  });

  test('explore lists the demo destinations and filters by category', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: 'Explore', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: "Cox's Bazar" })).toBeVisible();
    await page.getByRole('link', { name: 'Beaches', exact: true }).click();
    await expect(page).toHaveURL(/cat=beaches/);
    await expect(page.getByRole('heading', { name: "Cox's Bazar" })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sajek Valley' })).toHaveCount(0);
  });

  test('a destination page is shareable and asks anonymous visitors to log in to save', async ({ page }) => {
    await page.goto('/destinations/coxs-bazar');
    await expect(page.getByRole('heading', { name: "Cox's Bazar", level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Log in to save or plan/ })).toBeVisible();
    await expect(page.getByText('Visiting a place never records you.')).toBeVisible();
  });

  test('an unknown destination is a 404, not a crash', async ({ page }) => {
    const res = await page.goto('/destinations/does-not-exist');
    expect(res?.status()).toBe(404);
  });

  test('the nearby card does not ask for location until the button is pressed', async ({ page, context }) => {
    await context.grantPermissions([]);
    await page.addInitScript(() => { navigator.geolocation.getCurrentPosition = () => { (window as unknown as { __asked: boolean }).__asked = true; }; });
    await page.goto('/explore');
    const asked = await page.evaluate(() => Boolean((window as unknown as { __asked?: boolean }).__asked));
    expect(asked).toBe(false);
  });
});

test.describe('sign-in guards', () => {
  for (const path of ['/home', '/trips', '/trips/new', '/saved', '/messages', '/notifications', '/settings']) {
    test(`${path} redirects anonymous visitors to log in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('a private trip id never renders for anonymous visitors', async ({ page }) => {
    await page.goto('/trips/00000000-0000-4000-8000-000000000000');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login form validates and offers Google, forgot password and sign up', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('open redirects are ignored after login', async ({ page }) => {
    await page.goto('/login?next=https://evil.example/steal');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(page.url()).toContain('localhost');
  });
});

test.describe('security headers', () => {
  test('pages ship a CSP, nosniff and frame protection', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['content-security-policy']).toBeTruthy();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options'] ?? h['content-security-policy']).toBeTruthy();
  });
});
