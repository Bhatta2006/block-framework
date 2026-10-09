import assert from 'node:assert/strict';
import { chromium, firefox } from '@playwright/test';

const url = process.env.BLOCKFW_SAAS_URL || 'http://127.0.0.1:5202';
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(url);
    await page.getByRole('heading', { name: 'Make space for your next launch' }).waitFor();
    await page.getByRole('button', { name: 'Open workspace' }).click();
    await page.getByRole('heading', { name: 'Your projects', exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '#dashboard');
    await page.getByRole('heading', { name: 'Customer portal', exact: true }).click();
    const title = page.getByRole('textbox', { name: 'Note title', exact: true });
    await title.waitFor();
    assert.equal(await title.inputValue(), 'Customer portal');
    await title.fill('Customer portal revised');
    await page.getByText('Saved on this device', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to notes' }).click();
    await page.getByRole('heading', { name: 'Customer portal revised', exact: true }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Customer portal revised', exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      engine.name() + ': landing, dashboard, edit persistence and phone-width layout passed',
    );
  } finally {
    await browser.close();
  }
}
