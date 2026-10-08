import { test, expect } from '@playwright/test';

test('ChatGPT connection controls sign in, choose a model, acknowledge usage and sign out', async ({
  page,
}) => {
  let status = {
    accounts: [] as Array<{
      id: string;
      label: string;
      connected: boolean;
      planEnabled: boolean;
      model?: string;
    }>,
    activeId: undefined as string | undefined,
    pending: false,
    welcome: false,
    usageUrl: 'https://chatgpt.com/settings/usage',
  };
  await page.route('**/api/agent/chatgpt/**', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    const data =
      route.request().method() === 'POST'
        ? (route.request().postDataJSON() as { model?: string })
        : {};
    if (action === 'login') {
      status.pending = true;
      await route.fulfill({ json: { url: 'about:blank' } });
      return;
    }
    if (action === 'models') {
      await route.fulfill({ json: [{ slug: 'test-model', display_name: 'Test Model' }] });
      return;
    }
    if (action === 'welcome') status.welcome = false;
    if (action === 'model') status.accounts[0]!.model = data.model;
    if (action === 'signout') {
      status.activeId = undefined;
      status.accounts[0]!.connected = false;
      status.accounts[0]!.planEnabled = false;
    }
    if (action === 'cancel') status.pending = false;
    await route.fulfill({ json: status });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /AI assistant/ }).click();
  await expect(
    page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }),
  ).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
  const popup = await popupPromise;
  await expect(page.getByText('Waiting for ChatGPT sign-in…')).toBeVisible();
  status = {
    ...status,
    pending: false,
    activeId: 'account-one',
    welcome: true,
    accounts: [
      {
        id: 'account-one',
        label: 'test@example.com · connection 1',
        connected: true,
        planEnabled: true,
      },
    ],
  };
  await expect(page.getByText('You’re using your ChatGPT plan')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Manage usage' })).toHaveAttribute(
    'href',
    'https://chatgpt.com/settings/usage',
  );
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByText('You’re using your ChatGPT plan')).toHaveCount(0);
  await page.getByLabel('ChatGPT model').selectOption('test-model');
  await expect(page.getByLabel('ChatGPT model')).toHaveValue('test-model');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('● Using ChatGPT plan')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Reconnect test@example.com/ })).toBeVisible();
  await popup.close();
});

test('ChatGPT cancel and protected-storage errors give actionable feedback', async ({ page }) => {
  let pending = false;
  let fail = false;
  await page.route('**/api/agent/chatgpt/**', async (route) => {
    const action = new URL(route.request().url()).pathname.split('/').at(-1);
    if (action === 'login') {
      if (fail) {
        await route.fulfill({
          status: 500,
          json: {
            error: 'Unlock your operating system credential store, then try ChatGPT sign-in again.',
          },
        });
        return;
      }
      pending = true;
      await route.fulfill({ json: { url: 'about:blank' } });
      return;
    }
    if (action === 'cancel') pending = false;
    await route.fulfill({
      json: {
        accounts: [],
        pending,
        welcome: false,
        usageUrl: 'https://chatgpt.com/settings/usage',
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /AI assistant/ }).click();
  await page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel sign-in' }).click();
  await expect(page.getByText('Waiting for ChatGPT sign-in…')).toHaveCount(0);
  fail = true;
  await page.getByRole('button', { name: 'Continue with ChatGPT', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Unlock your operating system credential store',
  );
});
