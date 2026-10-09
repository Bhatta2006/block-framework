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
    const light = await page
      .locator('.generated-app')
      .evaluate((app) => globalThis.getComputedStyle(app).backgroundColor);
    await page.evaluate(() => {
      globalThis.document.documentElement.dataset.theme = 'dark';
    });
    const dark = await page
      .locator('.generated-app')
      .evaluate((app) => globalThis.getComputedStyle(app).backgroundColor);
    assert.notEqual(dark, light, 'the exported application consumes shared theme colors');
    await page.evaluate(() => {
      delete globalThis.document.documentElement.dataset.theme;
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(
      await page.evaluate(() =>
        globalThis
          .getComputedStyle(globalThis.document.documentElement)
          .getPropertyValue('--motion-fast')
          .trim(),
      ),
      '0ms',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
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
      engine.name() +
        ': shared theme, reduced motion, navigation, edit persistence and phone-width layout passed',
    );
  } finally {
    await browser.close();
  }
}
