// S19.md: offline installation and update behavior. Nothing here mocks the
// network evaluator or the service worker — these flows exercise the actual
// built dist/sw.js against a real browser network toggle.
import { test, expect } from '@playwright/test';

async function enableApp(page) {
  await page.goto('/');
  await page.fill('#opening-command', 'enable');
  await page.press('#opening-command', 'Enter');
  await expect(page.locator('.home-screen')).toBeVisible();
}

async function waitOfflineReady(page) {
  await expect(page.locator('.home-offline-ready')).toHaveText('Ready offline', { timeout: 15_000 });
}

test.describe('Offline installation and update behavior', () => {
  test('the built service worker queues activation behind an explicit message rather than updating silently', async ({ page }) => {
    // A direct check of the shipped artifact (S19.md: "An update does not
    // silently regenerate an existing attempt") — registerType 'prompt'
    // (vite.config.ts) must never emit an unconditional skipWaiting() the
    // way registerType 'autoUpdate' would.
    const swText = await (await page.request.get('/sw.js')).text();
    expect(swText).toContain('SKIP_WAITING');
    expect(swText).not.toContain('self.skipWaiting(),');
  });

  test('visiting online reaches Ready offline, then a reload while offline still serves the app from cache', async ({ page, context }) => {
    await enableApp(page);
    await waitOfflineReady(page);

    await context.setOffline(true);
    await page.reload();
    await page.fill('#opening-command', 'enable');
    await page.press('#opening-command', 'Enter');
    await expect(page.locator('.home-screen')).toBeVisible();
    await expect(page.locator('.home-offline-ready')).toHaveText('Ready offline');

    await context.setOffline(false);
  });

  test('offline: a fresh seeded case can be configured, tested and its study material read, then survives closing and reopening the page', async ({ page, context }) => {
    await enableApp(page);
    await waitOfflineReady(page);
    await context.setOffline(true);

    // Open a fresh seeded case entirely offline.
    await page.fill('.home-seed-form input', 'TF1-BR-2-V-offline1');
    await page.click('.home-seed-form button:has-text("Go")');
    await expect(page.locator('.mission-screen')).toBeVisible();
    const title = await page.locator('.mission-title').textContent();

    // Configure/test: inspect a device and run a test, all offline.
    await page.click('.diagram-device >> nth=0');
    await page.click('.device-tests button:has-text("Ping gateway")');
    await page.click('.mission-tab:has-text("Findings")');
    await expect(page.locator('.findings-list')).not.toHaveCount(0);

    // Study material is bundled in the JS, not fetched — reachable offline too.
    await page.click('.mission-tab:has-text("Network")');
    await page.click('.mission-exit');
    await page.click('.home-study-button');
    await expect(page.locator('.study-lesson-list li')).not.toHaveCount(0);
    await page.click('.study-screen button:has-text("Back")');

    // Close and reopen the page (a new page in the same, still-offline context).
    await page.close();
    const reopened = await context.newPage();
    await reopened.goto('/');
    await reopened.fill('#opening-command', 'enable');
    await reopened.press('#opening-command', 'Enter');
    await expect(reopened.locator('.home-screen')).toBeVisible();
    await reopened.click('.home-continue');
    await expect(reopened.locator('.mission-screen')).toBeVisible();
    await expect(reopened.locator('.mission-title')).toHaveText(title);

    await context.setOffline(false);
  });

  test('offline first-ever visit is not supported: a fresh context with no prior online visit cannot load the app', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
    await context.setOffline(true);
    const page = await context.newPage();
    let navigationFailed = false;
    try {
      await page.goto('/', { timeout: 5_000 });
    } catch {
      navigationFailed = true;
    }
    if (!navigationFailed) {
      // Some browsers resolve the navigation to their own offline error
      // page rather than rejecting goto(); either way, the app never loads.
      await expect(page.locator('.opening-screen')).toHaveCount(0);
    }
    await context.close();
  });
});
