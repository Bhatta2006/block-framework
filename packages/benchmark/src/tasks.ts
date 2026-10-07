import type { BenchmarkTask } from './types.js';

/**
 * The M0 benchmark suite: 20 tasks covering the operations a builder
 * performs constantly. Each task mutates the base app graph and asserts
 * the compiler's behavior — including that failures fail loudly.
 *
 * The mock agent executes these mechanically (JSON edit + recompile, zero
 * tokens). The same tasks are designed to be replayed against a baseline
 * coding agent later; see README for the baseline procedure.
 */
export const TASKS: BenchmarkTask[] = [
  {
    id: 'T01',
    title: 'Add a quiz question',
    category: 'config-edit',
    description: 'Add a fourth question to the onboarding quiz config.',
    operation: {
      kind: 'set-config',
      instance: 'b1',
      config: {
        skippable: true,
        questions: [
          { prompt: 'What brings you here?', options: ['Habits', 'Projects'], multi: false },
          { prompt: 'Reminder time?', options: ['Morning', 'Evening'], multi: true },
          { prompt: 'Experience level?', options: ['New', 'Pro'], multi: false },
          { prompt: 'Biggest blocker?', options: ['Time', 'Motivation'], multi: false },
        ],
      },
    },
    expects: 'success',
    checks: [{ kind: 'changed-files', only: ['src/blocks/b1.tsx', 'src/wiring-report.json'] }],
  },
  {
    id: 'T02',
    title: 'Change paywall headline',
    category: 'config-edit',
    description: 'Rewrite the paywall headline copy.',
    operation: {
      kind: 'set-config',
      instance: 'b2',
      config: {
        headline: 'Go unlimited today',
        subheadline: 'Cancel anytime.',
        products: [{ id: 'monthly', title: 'Monthly', price: '$4.99', period: 'month' }],
        ctaText: 'Subscribe',
      },
    },
    expects: 'success',
    checks: [{ kind: 'changed-files', only: ['src/blocks/b2.tsx', 'src/wiring-report.json'] }],
  },
  {
    id: 'T03',
    title: 'Change brand color',
    category: 'config-edit',
    description: 'Change the app primary color; only the theme file (+ report) may change.',
    operation: { kind: 'set-theme', theme: { primaryColor: '#E11D48' } },
    expects: 'success',
    checks: [{ kind: 'changed-files', only: ['src/theme.ts', 'src/wiring-report.json'] }],
  },
  {
    id: 'T04',
    title: 'Empty quiz questions rejected',
    category: 'config-edit',
    description: 'Setting questions to [] must fail config validation (minItems 1).',
    operation: { kind: 'set-config', instance: 'b1', config: { questions: [] } },
    expects: 'compile-error',
  },
  {
    id: 'T05',
    title: 'Quiz variant swap: cards -> list',
    category: 'variant-swap',
    description: 'Switch the quiz to the list layout.',
    operation: { kind: 'set-variant', instance: 'b1', variant: 'quiz-list' },
    expects: 'success',
    checks: [{ kind: 'changed-files', only: ['src/blocks/b1.tsx', 'src/wiring-report.json'] }],
  },
  {
    id: 'T06',
    title: 'Paywall variant swap: cards -> compact',
    category: 'variant-swap',
    description: 'Switch the paywall to the compact single-product layout.',
    operation: { kind: 'set-variant', instance: 'b2', variant: 'compact' },
    expects: 'success',
  },
  {
    id: 'T07',
    title: 'Home variant swap: list -> grid',
    category: 'variant-swap',
    description: 'Switch the home screen to the 2-column grid.',
    operation: { kind: 'set-variant', instance: 'b3', variant: 'grid' },
    expects: 'success',
  },
  {
    id: 'T08',
    title: 'Unknown variant rejected',
    category: 'variant-swap',
    description: 'Requesting a variant the block does not declare must fail.',
    operation: { kind: 'set-variant', instance: 'b1', variant: 'quiz-hologram' },
    expects: 'compile-error',
  },
  {
    id: 'T09',
    title: 'Reorder screens',
    category: 'graph-op',
    description: 'Move the paywall first. Navigation must follow; block files must not change.',
    operation: { kind: 'reorder-screens', order: ['s2', 's1', 's3'] },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        not: ['src/blocks/b1.tsx', 'src/blocks/b2.tsx', 'src/blocks/b3.tsx'],
      },
    ],
  },
  {
    id: 'T10',
    title: 'Explicit wire overrides convention',
    category: 'graph-op',
    description: 'Wire quiz completion straight to home, skipping the paywall.',
    operation: {
      kind: 'add-wire',
      from: { instance: 'b1', event: 'onboarding.completed' },
      toScreen: 's3',
    },
    expects: 'success',
    checks: [
      { kind: 'wire-origin', instance: 'b1', event: 'onboarding.completed', origin: 'user' },
    ],
  },
  {
    id: 'T11',
    title: 'Remove the paywall screen',
    category: 'graph-op',
    description: 'Drop the paywall; the flow becomes quiz -> home with no other edits.',
    operation: { kind: 'remove-screen', screen: 's2' },
    expects: 'success',
  },
  {
    id: 'T12',
    title: 'Add a second quiz instance',
    category: 'graph-op',
    description: 'Add a fourth screen reusing the quiz block type as a new instance.',
    operation: {
      kind: 'add-screen',
      screen: { id: 's4', block: 'b4', title: 'Extra questions' },
      block: {
        id: 'b4',
        type: 'onboarding.quiz@1.0.0',
        variant: 'quiz-list',
        config: {
          questions: [{ prompt: 'One more?', options: ['Yes', 'No'], multi: false }],
        },
      },
    },
    expects: 'success',
  },
  {
    id: 'T13',
    title: 'Ambiguous wires rejected',
    category: 'wiring',
    description: 'Two explicit wires for the same event must fail loudly, not pick one.',
    operation: {
      kind: 'add-wires',
      wires: [
        { from: { instance: 'b1', event: 'onboarding.completed' }, toScreen: 's2' },
        { from: { instance: 'b1', event: 'onboarding.completed' }, toScreen: 's3' },
      ],
    },
    expects: 'compile-error',
  },
  {
    id: 'T14',
    title: 'Wire to unknown screen rejected',
    category: 'wiring',
    description: 'A wire targeting a screen that does not exist must fail.',
    operation: {
      kind: 'add-wire',
      from: { instance: 'b1', event: 'onboarding.completed' },
      toScreen: 's99',
    },
    expects: 'compile-error',
  },
  {
    id: 'T15',
    title: 'Unknown block type rejected',
    category: 'wiring',
    description: 'Referencing a block type the registry does not know must fail.',
    operation: { kind: 'set-block-type', instance: 'b1', type: 'nope.nope@9.9.9' },
    expects: 'compile-error',
  },
  {
    id: 'T16',
    title: 'Screen referencing unknown instance rejected',
    category: 'wiring',
    description: 'A screen pointing at a block instance that does not exist must fail.',
    operation: { kind: 'set-screen-block', screen: 's1', block: 'b99' },
    expects: 'compile-error',
  },
  {
    id: 'T17',
    title: 'Double compile is byte-identical',
    category: 'determinism',
    description: 'Compiling the same graph twice must produce identical output.',
    operation: { kind: 'none' },
    expects: 'success',
    checks: [{ kind: 'hash-stable' }],
  },
  {
    id: 'T18',
    title: 'Config change is surgically scoped',
    category: 'determinism',
    description: 'Editing one block config must change only that block file (+ report).',
    operation: {
      kind: 'set-config',
      instance: 'b3',
      config: {
        title: 'Tomorrow',
        items: [{ id: '1', title: 'New item' }],
      },
    },
    expects: 'success',
    checks: [{ kind: 'changed-files', only: ['src/blocks/b3.tsx', 'src/wiring-report.json'] }],
  },
  {
    id: 'T19',
    title: 'Malformed graph rejected',
    category: 'invalid',
    description: 'A graph with an invalid app slug must fail schema validation.',
    operation: { kind: 'set-slug', slug: 'Not A Slug!' },
    expects: 'compile-error',
  },
  {
    id: 'T20',
    title: 'Wrong-typed config rejected',
    category: 'invalid',
    description: 'A config value of the wrong type must fail with a clear message.',
    operation: { kind: 'set-config', instance: 'b1', config: { skippable: 'yes' } },
    expects: 'compile-error',
  },
];
