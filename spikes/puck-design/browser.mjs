import assert from 'node:assert/strict';
import { chromium, firefox } from '@playwright/test';
for (const engine of [chromium, firefox]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:5201');
    for (const title of ['Hero evaluation', 'Collection evaluation', 'Account evaluation'])
      await page.getByRole('heading', { name: title, exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Hero evaluation', exact: true }).click();
    await page.locator('input[id="hero_text_title"]:visible').first().fill('Edited through Puck');
    await page.getByRole('heading', { name: 'Edited through Puck', exact: true }).waitFor();
    await page.getByText('Publish', { exact: true }).click();
    await page.getByTestId('operations').filter({ hasText: 'setBlockField' }).waitFor();
    const operations = JSON.parse(await page.getByTestId('operations').textContent());
    assert.deepEqual(operations, [
      {
        type: 'setBlockField',
        id: 'hero',
        path: ['config', 'title'],
        value: 'Edited through Puck',
      },
    ]);
    assert.deepEqual(errors, []);
    console.log(
      engine.name() +
        ': three real blocks, selection/config edit, published graph operation and no page errors passed',
    );
  } finally {
    await browser.close();
  }
}
