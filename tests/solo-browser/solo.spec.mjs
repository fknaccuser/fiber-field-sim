// S18.md: Chromium flows against the production build (playwright.solo.config.mjs's
// webServer runs `npm run build && npm run preview`). Nothing here mocks the
// network evaluator — every check drives the real UI against the real engine.
import { test, expect } from '@playwright/test';

// Manually created contexts (browser.newContext()) do not inherit the
// project's `use` options (baseURL/viewport), unlike the `page`/`context`
// test fixtures — the determinism/persistence tests below need this passed
// explicitly.
const BASE_URL = 'http://localhost:4173';

async function enableApp(page) {
  await page.goto('/');
  await page.fill('#opening-command', 'enable');
  await page.press('#opening-command', 'Enter');
  await expect(page.locator('.home-screen')).toBeVisible();
}

test.describe('The Field Solo', () => {
  test('launch enable, start the recommended cable-repair job, verify both clients and complete with a note', async ({ page }) => {
    await enableApp(page);
    await expect(page.locator('.home-recommended-row')).toContainText('TF1-HM-1-P-START');

    await page.click('.home-recommended-row button:has-text("Start")');
    await expect(page.locator('.mission-screen')).toBeVisible();

    // Reconnect PC1's cable (P1: disconnected Ethernet cable).
    await page.click('.cable-hit >> nth=0');
    await expect(page.locator('.reconnect-heading')).toContainText('disconnected');
    await page.selectOption('.reconnect-panel select', 'PC1:eth0');
    await page.click('.reconnect-panel button:has-text("Next")');
    await page.selectOption('.reconnect-panel select', 'SW1:Gi0/1');
    await page.click('.reconnect-panel button:has-text("Connect")');
    await expect(page.locator('.reconnect-panel')).toHaveCount(0);

    // Verify the target client (test results surface as Findings rows, not
    // inline under Tests — the completion checklist below is the real proof).
    await page.click('.diagram-device >> nth=0');
    await page.click('.device-tests button:has-text("Open portal")');

    // Verify the protected client.
    await page.click('.mission-tab:has-text("Network")');
    await page.click('.diagram-device >> nth=1');
    await page.click('.device-tests button:has-text("Check protected client")');

    // Select a genuine finding, write a note, submit. (noteChange deliberately
    // skips re-rendering to keep the textarea/cursor intact, so the checklist
    // only reflects the note once Submit itself re-renders — checking it
    // mid-flight here would just assert a documented, intentional lag.)
    await page.click('.mission-tab:has-text("Findings")');
    await expect(page.locator('.findings-list')).toContainText('passed');
    await page.locator('.findings-list input[type=checkbox]').first().check();
    await page.fill('.mission-panel-findings textarea', 'Reconnected the workstation cable and verified portal access from both workstations.');
    await page.click('.findings-submit');

    await expect(page.locator('.debrief-screen')).toBeVisible();
    await expect(page.locator('.debrief-status')).toHaveText('Completed independently.');
  });

  test('a seeded DNS repair (TF1-HM-2-D-e2edns1, deterministically D1) can be solved end to end', async ({ page }) => {
    await enableApp(page);
    await page.fill('.home-seed-form input', 'TF1-HM-2-D-e2edns1');
    await page.click('.home-seed-form button:has-text("Go")');
    await expect(page.locator('.mission-screen')).toBeVisible();
    await expect(page.locator('.mission-title')).toHaveText('TF1-HM-2-D-e2edns1');

    // Fix the client's DNS to the actual portal server address for this seed's x=65.
    // Scoped to .device-configure: an unscoped getByLabel('DNS') also matches
    // the topology diagram's "DNS and portal (server)" device aria-label.
    await page.click('.diagram-device >> nth=0');
    await page.click('#inspector-tab-configure');
    await page.locator('.device-configure').getByLabel('DNS').fill('10.65.30.53');
    await page.locator('.device-configure button:has-text("Apply")').click();
    await page.click('.device-tests button:has-text("Open portal")');

    await page.click('.mission-tab:has-text("Network")');
    await page.click('.diagram-device >> nth=1');
    await page.click('.device-tests button:has-text("Check protected client")');

    await page.click('.mission-tab:has-text("Findings")');
    await page.locator('.findings-list input[type=checkbox]').first().check();
    await page.fill('.mission-panel-findings textarea', 'Corrected the resolver address and verified portal access from both workstations.');
    await page.click('.findings-submit');
    await expect(page.locator('.debrief-screen')).toBeVisible();
  });

  test('reloading the page resumes the active mission from IndexedDB, not just in-memory state', async ({ page }) => {
    await enableApp(page);
    await page.click('.home-recommended-row button:has-text("Start")');
    await expect(page.locator('.mission-screen')).toBeVisible();
    const title = await page.locator('.mission-title').textContent();

    await page.reload();
    // A fresh load always starts at the opening screen (openingEnabled default).
    await page.fill('#opening-command', 'enable');
    await page.press('#opening-command', 'Enter');
    await expect(page.locator('.home-screen')).toBeVisible();

    const continueButton = page.locator('.home-continue');
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(page.locator('.mission-screen')).toBeVisible();
    await expect(page.locator('.mission-title')).toHaveText(title);
  });

  test('GUI and CLI agree on network state in both directions', async ({ page }) => {
    await enableApp(page);
    await page.click('.home-configure-row button:has-text("Home lab")');
    await expect(page.locator('.mission-screen')).toBeVisible();

    // Full-teardown re-renders replace the terminal's DOM on every command;
    // wait for each command's own echo before typing the next one, so a
    // render mid-flight can never eat a keystroke meant for its successor.
    async function runCliCommand(text) {
      await page.click('#inspector-tab-console');
      const terminalInput = page.locator('.device-terminal .terminal-input');
      await terminalInput.fill(text);
      await terminalInput.press('Enter');
      await expect(page.locator('.terminal-output')).toContainText(text);
    }

    // CLI -> GUI: change SW1:Gi0/1's access VLAN over the terminal, then read
    // it back from the Configure form.
    await page.click('.diagram-device >> nth=2'); // SW1
    await expect(page.locator('.device-panel h2')).toContainText('switch');
    for (const command of ['enable', 'configure terminal', 'interface Gi0/1', 'switchport access vlan 20']) {
      await runCliCommand(command);
    }
    const gi01Vlan = page.locator('p.device-port-heading:text-is("Gi0/1") + form.device-form').getByLabel('Access VLAN');
    await page.click('#inspector-tab-configure');
    await expect(gi01Vlan).toHaveValue('20');

    // GUI -> CLI: disable Gi0/2 from its Configure form, then read it back
    // from `show interfaces status`.
    const gi02Form = page.locator('p.device-port-heading:text-is("Gi0/2") + form.device-form');
    await gi02Form.getByLabel('Port enabled').uncheck();
    await gi02Form.locator('button:has-text("Apply")').click();
    // Show commands need privileged/user mode (ENGINE_RULES.md); the
    // terminal is still in interface config mode from the CLI->GUI step.
    await runCliCommand('end');
    await runCliCommand('show interfaces status');
    await expect(page.locator('.terminal-output')).toContainText('Gi0/2 admin down');
  });

  test('backup import preview can be cancelled without replacing anything', async ({ page }) => {
    await enableApp(page);
    const recommendedBefore = await page.locator('.home-recommended-row span').textContent();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('.home-export-button'),
    ]);
    const savedPath = await download.path();

    await page.setInputFiles('.home-import-label input[type=file]', savedPath);
    await expect(page.locator('.home-pending-prompt')).toBeVisible();
    await expect(page.locator('.home-pending-prompt')).toContainText('completed run');

    await page.click('.home-pending-prompt button:has-text("Cancel")');
    await expect(page.locator('.home-pending-prompt')).toHaveCount(0);

    const recommendedAfter = await page.locator('.home-recommended-row span').textContent();
    expect(recommendedAfter).toBe(recommendedBefore);
  });

  test.describe('390px phone width', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Home, Progress, Study and Reference are all reachable and return correctly', async ({ page }) => {
      await enableApp(page);

      await page.click('.home-progress-button');
      await expect(page.locator('.progress-screen')).toBeVisible();
      await page.click('.progress-screen button:has-text("Back")');
      await expect(page.locator('.home-screen')).toBeVisible();

      await page.click('.home-study-button');
      await expect(page.locator('.study-screen')).toBeVisible();
      await page.click('.study-screen button:has-text("Back")');
      await expect(page.locator('.home-screen')).toBeVisible();

      await page.click('.home-reference-button');
      await expect(page.locator('.reference-screen')).toBeVisible();
      await page.click('.reference-screen button:has-text("Back")');
      await expect(page.locator('.home-screen')).toBeVisible();

      // Mission tab navigation at phone width (one panel visible at a time).
      await page.click('.home-recommended-row button:has-text("Start")');
      await expect(page.locator('.mission-panel-network')).toBeVisible();
      await expect(page.locator('.mission-panel-device')).toBeHidden();
      await page.click('.diagram-device >> nth=0');
      await expect(page.locator('.mission-panel-device')).toBeVisible();
      await page.click('.mission-tab:has-text("Findings")');
      await expect(page.locator('.mission-panel-findings')).toBeVisible();
      await expect(page.locator('.mission-panel-network')).toBeHidden();
    });
  });

  test.describe('900px+ tablet split', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('the canvas stays visible while Device and Findings share one inspector', async ({ page }) => {
      await enableApp(page);
      await page.click('.home-recommended-row button:has-text("Start")');
      await expect(page.locator('.mission-screen')).toBeVisible();
      await expect(page.locator('.mission-tabs')).toBeVisible();
      await expect(page.locator('.mission-panel-network')).toBeVisible();
      await expect(page.locator('.mission-panel-findings')).toBeHidden();
      // Selecting a device makes the third panel meaningful without any tab click.
      await page.click('.diagram-device >> nth=0');
      await expect(page.locator('.mission-panel-device')).toBeVisible();
      await expect(page.locator('.mission-panel-device')).toContainText('Customer workstation');
      await page.getByRole('tab', { name: 'Findings', exact: true }).click();
      await expect(page.locator('.mission-panel-network')).toBeVisible();
      await expect(page.locator('.mission-panel-device')).toBeHidden();
      await expect(page.locator('.mission-panel-findings')).toBeVisible();
    });
  });
});

test.describe('Determinism and storage across separate browser contexts', () => {
  test('the same case code produces an identical fault in two independent fresh profiles', async ({ browser }) => {
    const contextA = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
    const contextB = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    for (const page of [pageA, pageB]) {
      await enableApp(page);
      await page.fill('.home-seed-form input', 'TF1-BR-2-I-detcheck1');
      await page.click('.home-seed-form button:has-text("Go")');
      await expect(page.locator('.mission-screen')).toBeVisible();
      await page.click('.diagram-device >> nth=0');
    }

    const ipA = await pageA.getByLabel('IP address (/24)').inputValue();
    const ipB = await pageB.getByLabel('IP address (/24)').inputValue();
    expect(ipA).toBe(ipB);
    const titleA = await pageA.locator('.mission-title').textContent();
    const titleB = await pageB.locator('.mission-title').textContent();
    expect(titleA).toBe(titleB);

    await contextA.close();
    await contextB.close();
  });

  test('storage persists across a full page reload in a fresh context', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await enableApp(page);
    await page.click('.home-recommended-row button:has-text("Start")');
    await expect(page.locator('.mission-screen')).toBeVisible();
    await page.click('.cable-hit >> nth=0');
    await page.selectOption('.reconnect-panel select', 'PC1:eth0');
    await page.click('.reconnect-panel button:has-text("Next")');
    await page.selectOption('.reconnect-panel select', 'SW1:Gi0/1');
    await page.click('.reconnect-panel button:has-text("Connect")');
    await expect(page.locator('.reconnect-panel')).toHaveCount(0);

    await page.reload();
    await page.fill('#opening-command', 'enable');
    await page.press('#opening-command', 'Enter');
    await page.click('.home-continue');
    await expect(page.locator('.mission-screen')).toBeVisible();
    // The repaired cable's state survived the reload (read from IndexedDB,
    // not memory) — the link list no longer reads "disconnected".
    await expect(page.locator('.cable-hit').first()).toHaveAttribute('aria-label', 'Cable L1, connected');
    await page.click('.diagram-device >> nth=0');
    await page.click('.device-tests button:has-text("Open portal")');
    await page.click('.mission-tab:has-text("Findings")');
    await expect(page.locator('.findings-list')).toContainText('passed');

    await context.close();
  });
});
