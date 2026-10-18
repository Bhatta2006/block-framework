import { test, expect } from '@playwright/test';

test('a missing capability becomes an experimental block after contract review', async ({
  page,
  request,
}) => {
  // Both browser projects share one Studio server, and an authored block stays registered.
  const authored = (await (await request.get('/api/agent/blocks')).json()) as {
    blocks: Array<{ id: string }>;
  };
  test.skip(
    authored.blocks.some((block) => block.id === 'chat.thread'),
    'chat.thread was already authored on this server by an earlier browser project',
  );

  await page.goto('/');
  await page.getByRole('button', { name: /AI assistant/ }).click();
  await page.getByRole('button', { name: 'Try example' }).click();
  await page.getByRole('button', { name: 'Plan build' }).click();
  await expect(page.getByText('Needs a new block: Live discussion chat')).toBeVisible();

  await page.getByRole('button', { name: 'Create block for Live discussion chat' }).click();
  const review = page.getByRole('region', { name: 'New block' });
  await expect(review.getByText('chat.thread', { exact: true })).toBeVisible();
  await expect(
    review.getByText('Message thread with author bubbles and a local message composer.', {
      exact: true,
    }),
  ).toBeVisible();
  // Nothing is written before approval.
  const before = (await (await request.get('/api/blocks')).json()) as Array<{ id: string }>;
  expect(before.map((block) => block.id)).not.toContain('chat.thread@1.0.0');

  await review.getByRole('button', { name: 'Approve contract' }).click();
  const checks = review.getByRole('list', { name: 'Block checks' });
  for (const name of ['manifest', 'sdk test', 'sdk validate', 'compile'])
    await expect(checks.getByText(`✓ ${name}`, { exact: true })).toBeVisible();
  await expect(
    review.getByText('chat.thread@1.0.0 is now an experimental library block'),
  ).toBeVisible();

  const after = (await (await request.get('/api/blocks')).json()) as Array<{
    id: string;
    experimental?: boolean;
  }>;
  expect(after.find((block) => block.id === 'chat.thread@1.0.0')?.experimental).toBe(true);
});
