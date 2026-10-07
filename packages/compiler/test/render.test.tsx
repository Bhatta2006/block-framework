/**
 * @vitest-environment jsdom
 *
 * Headless render tests: compile the example graph, bundle the GENERATED
 * block components with esbuild (aliasing react-native to a DOM mock),
 * and render them with @testing-library/react. This is the automated proof
 * that the emitted app doesn't just typecheck — its screens actually render
 * and their interaction logic works (answer quiz → onComplete fires,
 * subscribe → mock purchase completes).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { compileProject } from '@blockfw/compiler';
import { loadDefaultRegistry } from '@blockfw/blocks';
import type { ProjectGraph } from '@blockfw/manifest';
import baseGraphJson from '../../benchmark/src/base/graph.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const RN_MOCK = join(import.meta.dirname, 'rn-mock.tsx');
const BUNDLER = join(import.meta.dirname, 'bundle-block.mjs');
// Bundles live inside the repo so bare `require('react')` resolves to the
// workspace's node_modules (same React copy the test uses).
const OUT_DIR = join(import.meta.dirname, '__render_out__');

beforeAll(() => {
  rmSync(OUT_DIR, { recursive: true, force: true });
  const graph = JSON.parse(JSON.stringify(baseGraphJson)) as ProjectGraph;
  // Add one instance of each M1 block so every generated component is rendered.
  const extraBlocks = [
    {
      id: 'b4',
      type: 'settings.list@1.0.0',
      variant: 'list',
      config: {
        title: 'Settings',
        sections: [
          {
            title: 'Notifications',
            rows: [{ id: 'push', label: 'Push notifications', kind: 'toggle', value: true }],
          },
          {
            title: 'Account',
            rows: [{ id: 'signout', label: 'Sign out', kind: 'link', detail: 'Not Ada' }],
          },
        ],
      },
    },
    {
      id: 'b5',
      type: 'profile.card@1.0.0',
      variant: 'card',
      config: { name: 'Ada Lovelace', handle: '@ada', bio: 'First programmer.' },
    },
    {
      id: 'b6',
      type: 'auth.email@1.0.0',
      variant: 'signin',
      config: { headline: 'Welcome back', subheadline: 'Sign in to continue.', ctaText: 'Sign in' },
    },
    {
      id: 'b7',
      type: 'content.detail@1.0.0',
      variant: 'article',
      config: { showImage: false, ctaText: 'Read more' },
    },
    {
      id: 'b8',
      type: 'stats.overview@1.0.0',
      variant: 'row',
      config: {
        title: 'This week',
        stats: [
          { label: 'Day streak', value: '12' },
          { label: 'Completed', value: '34', delta: '+5' },
        ],
      },
    },
  ];
  for (const b of extraBlocks) {
    graph.blocks.push(b as (typeof graph.blocks)[number]);
    graph.screens.push({
      id: `s${b.id.slice(1)}`,
      block: b.id,
      title: b.id,
    } as (typeof graph.screens)[number]);
  }
  const { files } = compileProject(graph, loadDefaultRegistry());
  for (const file of files) {
    const full = join(OUT_DIR, file.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.content);
  }
});

afterAll(() => {
  rmSync(OUT_DIR, { recursive: true, force: true });
});

/**
 * Bundle a generated block entry in a child process (esbuild cannot run
 * inside vitest workers) and return its exports. `react` stays external so
 * the bundle shares the test's React copy (hooks keep working).
 */
function loadBlock(instanceId: string): Record<string, unknown> {
  const entry = join(OUT_DIR, 'src', 'blocks', `${instanceId}.tsx`);
  const outFile = join(OUT_DIR, `${instanceId}.bundle.cjs`);
  execFileSync(process.execPath, [BUNDLER, entry, RN_MOCK, outFile], { stdio: 'pipe' });
  delete require.cache[outFile];
  return require(outFile) as Record<string, unknown>;
}

interface QuizResult {
  answers: Record<string, string[]>;
  skipped: boolean;
}

interface PaywallResult {
  productId?: string;
  restored?: boolean;
  mocked: boolean;
}

type Component<P> = (props: P) => React.ReactElement;

describe('generated quiz block', () => {
  it('renders questions and completes the flow', () => {
    const { B1Block } = loadBlock('b1') as {
      B1Block: Component<{ onComplete?: (r: QuizResult) => void }>;
    };
    const onComplete = vi.fn();
    const { unmount } = render(<B1Block onComplete={onComplete} />);

    expect(screen.getByText('What brings you here?')).toBeDefined();
    fireEvent.click(screen.getByText('Build a habit'));
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('When do you want reminders?')).toBeDefined();
    fireEvent.click(screen.getByText('Morning'));
    fireEvent.click(screen.getByText('Finish'));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      answers: { '0': ['Build a habit'], '1': ['Morning'] },
      skipped: false,
    });
    unmount();
  });

  it('shows progress through the questions', () => {
    const { B1Block } = loadBlock('b1') as {
      B1Block: Component<{ onComplete?: (r: QuizResult) => void }>;
    };
    const { unmount } = render(<B1Block onComplete={() => undefined} />);
    expect(screen.getByText('Question 1 of 2')).toBeDefined();
    unmount();
  });
});

describe('generated paywall block', () => {
  it('completes a mock purchase', async () => {
    const { B2Block } = loadBlock('b2') as {
      B2Block: Component<{ onComplete?: (r: PaywallResult) => void }>;
    };
    const onComplete = vi.fn();
    const { unmount } = render(<B2Block onComplete={onComplete} />);

    expect(screen.getByText('Unlock your full potential')).toBeDefined();
    expect(screen.getByText('$4.99')).toBeDefined();
    fireEvent.click(screen.getByText('Start my free trial'));

    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledWith({ productId: 'monthly', mocked: true });
      },
      { timeout: 3000 },
    );
    unmount();
  });
});

describe('generated home block', () => {
  it('renders the configured items', () => {
    const { B3Block } = loadBlock('b3') as { B3Block: Component<Record<string, never>> };
    const { unmount } = render(<B3Block />);
    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('Morning hydration')).toBeDefined();
    expect(screen.getByText('Deep work')).toBeDefined();
    expect(screen.getByText('Evening reset')).toBeDefined();
    unmount();
  });

  it('fires onComplete with the tapped item', () => {
    const { B3Block } = loadBlock('b3') as {
      B3Block: Component<{ onComplete?: (p: { item: { id: string; title: string } }) => void }>;
    };
    const onComplete = vi.fn();
    const { unmount } = render(<B3Block onComplete={onComplete} />);
    fireEvent.click(screen.getByText('Deep work'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0].item).toMatchObject({ id: '2', title: 'Deep work' });
    unmount();
  });
});

describe('generated settings block', () => {
  it('renders sections and toggles rows', () => {
    const { B4Block } = loadBlock('b4') as { B4Block: Component<Record<string, never>> };
    const { unmount } = render(<B4Block />);
    expect(screen.getByText('Settings')).toBeDefined();
    expect(screen.getByText('Notifications')).toBeDefined();
    expect(screen.getByText('Push notifications')).toBeDefined();
    expect(screen.getByText('Sign out')).toBeDefined();

    const toggle = screen.getByRole('switch') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    unmount();
  });
});

describe('generated profile block', () => {
  it('renders the configured profile', () => {
    const { B5Block } = loadBlock('b5') as { B5Block: Component<Record<string, never>> };
    const { unmount } = render(<B5Block />);
    expect(screen.getByText('Ada Lovelace')).toBeDefined();
    expect(screen.getByText('@ada')).toBeDefined();
    expect(screen.getByText('First programmer.')).toBeDefined();
    unmount();
  });
});

describe('generated auth block', () => {
  it('validates input and completes a mock sign-in', async () => {
    const { B6Block } = loadBlock('b6') as {
      B6Block: Component<{
        onComplete?: (r: { user: { id: string; email: string }; mocked: boolean }) => void;
      }>;
    };
    const onComplete = vi.fn();
    const { unmount } = render(<B6Block onComplete={onComplete} />);

    expect(screen.getByText('Welcome back')).toBeDefined();
    const emailInput = screen.getByPlaceholderText('you@example.com') as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('At least 6 characters') as HTMLInputElement;
    const submit = screen.getByText('Sign in').closest('button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(emailInput, { target: { value: 'ada@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'secret1' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 },
    );
    const payload = onComplete.mock.calls[0]![0];
    expect(payload.mocked).toBe(true);
    expect(payload.user.email).toBe('ada@example.com');
    expect(typeof payload.user.id).toBe('string');
    unmount();
  });

  it('rejects an invalid email without calling the service', () => {
    const { B6Block } = loadBlock('b6') as {
      B6Block: Component<{ onComplete?: (r: unknown) => void }>;
    };
    const onComplete = vi.fn();
    const { unmount } = render(<B6Block onComplete={onComplete} />);
    const emailInput = screen.getByPlaceholderText('you@example.com');
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    const submit = screen.getByText('Sign in').closest('button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    unmount();
  });
});

describe('generated detail block', () => {
  it('renders the fallback item without input', () => {
    const { B7Block } = loadBlock('b7') as {
      B7Block: Component<{ input?: { item: { id: string; title: string; subtitle?: string } } }>;
    };
    const { unmount } = render(<B7Block />);
    expect(screen.getByText('Sample item')).toBeDefined();
    unmount();
  });

  it('renders the routed item from input (semantic payload)', () => {
    const { B7Block } = loadBlock('b7') as {
      B7Block: Component<{ input?: { item: { id: string; title: string; subtitle?: string } } }>;
    };
    const { unmount } = render(
      <B7Block input={{ item: { id: '2', title: 'Deep work', subtitle: '90 min focus' } }} />,
    );
    expect(screen.getByText('Deep work')).toBeDefined();
    expect(screen.getByText('90 min focus')).toBeDefined();
    unmount();
  });
});

describe('generated stats block', () => {
  it('renders the configured stats', () => {
    const { B8Block } = loadBlock('b8') as { B8Block: Component<Record<string, never>> };
    const { unmount } = render(<B8Block />);
    expect(screen.getByText('This week')).toBeDefined();
    expect(screen.getByText('Day streak')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('Completed')).toBeDefined();
    expect(screen.getByText('34')).toBeDefined();
    unmount();
  });
});
