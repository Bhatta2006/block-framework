import type { CompiledFile } from './files.js';

export const WEB_TEST_DEPS = {
  vitest: '5.0.3',
  jsdom: '30.1.2',
  '@testing-library/react': '16.3.3',
  '@testing-library/dom': '10.4.2',
};

export function workspaceCheckFiles(pnpm: string): CompiledFile[] {
  return [
    {
      path: 'apps/web/vitest.config.ts',
      content: `import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'jsdom', include: ['tests/**/*.test.tsx'] },
});
`,
    },
    {
      path: 'apps/web/tests/pages.test.tsx',
      content: `// Generated page smoke tests from src/project.json and src/wires.json.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Application, type Graph } from '../src/runtime';
import project from '../src/project.json';
import wires from '../src/wires.json';

const graph = project as Graph;
beforeEach(() => {
  history.replaceState(null, '', '/');
  localStorage.clear();
  // jsdom has no layout or scrolling; rendering and navigation remain real.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('generated pages', () => {
  for (const page of graph.screens) {
    it('renders ' + page.id + ' with its composed blocks', async () => {
      render(<Application graph={graph} wires={wires} initialPage={page.id} />);
      const main = screen.getByRole('main');
      const ids = page.blocks ?? [page.block];
      await waitFor(() => {
        const blocks = main.querySelectorAll(':scope > .block-container');
        expect(blocks.length).toBe(ids.length);
        for (const block of blocks) expect(block.textContent?.trim().length).toBeGreaterThan(0);
      });
      expect(within(main).queryByRole('heading', { name: 'Custom block' })).toBeNull();
    });
    if (page.navigation !== false) {
      it('navigates to ' + page.id + ' through the app header', () => {
        render(<Application graph={graph} wires={wires} />);
        const index = graph.screens.filter(item => item.navigation !== false).findIndex(item => item.id === page.id);
        const button = within(screen.getByRole('navigation')).getAllByRole('button')[index]!;
        expect(button.textContent).toBe(page.title);
        fireEvent.click(button);
        expect(location.hash).toBe('#' + page.id);
        expect(screen.getByRole('main').querySelectorAll(':scope > .block-container').length).toBe((page.blocks ?? [page.block]).length);
      });
    }
  }
});
`,
    },
    {
      path: '.github/workflows/verify.yml',
      content: `name: Verify generated app
on: [push, pull_request]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      CI: 'true'
      TURBO_TELEMETRY_DISABLED: '1'
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: '24'
      - run: npm install --global pnpm@${pnpm}
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
`,
    },
  ];
}
