import type { BenchmarkTask } from './types.js';

/**
 * The M0 benchmark suite: 20 tasks covering the operations a builder
 * performs constantly. M1 adds T21-T32 for the new blocks, semantic
 * routing, and the Entity Spine.
 *
 * Each task mutates the base app graph and asserts the compiler's
 * behavior — including that failures fail loudly.
 *
 * The mock agent executes these mechanically (JSON edit + recompile, zero
 * tokens). The same tasks are designed to be replayed against a baseline
 * coding agent later; see README for the baseline procedure.
 */

const SPINE_V1 = {
  entities: [
    {
      name: 'profiles',
      description: 'App users.',
      fields: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'email', type: 'text', unique: true },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
    {
      name: 'habits',
      description: 'Habits tracked by a user.',
      fields: [
        { name: 'id', type: 'uuid', primaryKey: true, default: 'gen_random_uuid()' },
        { name: 'user_id', type: 'uuid', references: 'profiles.id' },
        { name: 'title', type: 'text' },
        { name: 'created_at', type: 'timestamptz', default: 'now()' },
      ],
    },
  ],
};
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
    checks: [
      {
        kind: 'changed-files',
        only: ['blockfw.lock.json', 'src/blocks/b1.tsx', 'src/wiring-report.json'],
      },
    ],
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
    checks: [
      {
        kind: 'changed-files',
        only: ['blockfw.lock.json', 'src/blocks/b2.tsx', 'src/wiring-report.json'],
      },
    ],
  },
  {
    id: 'T03',
    title: 'Change brand color',
    category: 'config-edit',
    description: 'Change the app primary color; only the theme file (+ report) may change.',
    operation: { kind: 'set-theme', theme: { primaryColor: '#E11D48' } },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: ['blockfw.lock.json', 'src/theme.ts', 'src/wiring-report.json'],
      },
    ],
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
    checks: [
      {
        kind: 'changed-files',
        only: ['blockfw.lock.json', 'src/blocks/b1.tsx', 'src/wiring-report.json'],
      },
    ],
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
    checks: [
      {
        kind: 'changed-files',
        only: ['blockfw.lock.json', 'src/blocks/b3.tsx', 'src/wiring-report.json'],
      },
    ],
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
  // ---------------------------------------------------------------- M1 tasks
  {
    id: 'T21',
    title: 'Settings block: add a settings screen',
    category: 'config-edit',
    description: 'Replace the home screen block with a settings list block.',
    operation: {
      kind: 'replace-block',
      instance: 'b3',
      type: 'settings.list@1.0.0',
      variant: 'list',
      config: {
        title: 'Settings',
        sections: [
          {
            title: 'Notifications',
            rows: [{ id: 'push', label: 'Push notifications', kind: 'toggle', value: true }],
          },
        ],
      },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'src/blocks/b3.tsx',
          'src/screens/s3.tsx',
          'src/wiring-report.json',
        ],
      },
    ],
  },
  {
    id: 'T22',
    title: 'Settings variant swap: list -> grouped',
    category: 'variant-swap',
    description: 'Switch the settings block to the grouped layout.',
    operation: {
      kind: 'replace-block',
      instance: 'b3',
      type: 'settings.list@1.0.0',
      variant: 'grouped',
      config: {
        title: 'Settings',
        sections: [
          {
            title: 'Notifications',
            rows: [{ id: 'push', label: 'Push notifications', kind: 'toggle', value: true }],
          },
        ],
      },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'src/blocks/b3.tsx',
          'src/screens/s3.tsx',
          'src/wiring-report.json',
        ],
      },
    ],
  },
  {
    id: 'T23',
    title: 'Profile card block: add a profile screen',
    category: 'config-edit',
    description: 'Replace the home screen block with a profile card block.',
    operation: {
      kind: 'replace-block',
      instance: 'b3',
      type: 'profile.card@1.0.0',
      variant: 'card',
      config: { name: 'Ada Lovelace', handle: '@ada', bio: 'First programmer.' },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'src/blocks/b3.tsx',
          'src/screens/s3.tsx',
          'src/wiring-report.json',
        ],
      },
    ],
  },
  {
    id: 'T24',
    title: 'Profile variant swap: card -> compact',
    category: 'variant-swap',
    description: 'Switch the profile block to the compact layout.',
    operation: {
      kind: 'replace-block',
      instance: 'b3',
      type: 'profile.card@1.0.0',
      variant: 'compact',
      config: { name: 'Ada Lovelace', handle: '@ada' },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'src/blocks/b3.tsx',
          'src/screens/s3.tsx',
          'src/wiring-report.json',
        ],
      },
    ],
  },
  {
    id: 'T25',
    title: 'Auth email block: add a sign-in screen',
    category: 'config-edit',
    description: 'Replace the paywall screen block with an email auth block (mock service).',
    operation: {
      kind: 'replace-block',
      instance: 'b2',
      type: 'auth.email@1.0.0',
      variant: 'signin',
      config: { headline: 'Welcome back', ctaText: 'Sign in' },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'src/blocks/b2.tsx',
          'src/services/auth.mock.ts',
          'src/wiring-report.json',
        ],
      },
    ],
  },
  {
    id: 'T26',
    title: 'Auth variant swap: signin -> signup',
    category: 'variant-swap',
    description: 'Switch the auth block to the signup layout.',
    operation: {
      kind: 'replace-block',
      instance: 'b2',
      type: 'auth.email@1.0.0',
      variant: 'signup',
      config: { headline: 'Create your account', ctaText: 'Sign up' },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'src/blocks/b2.tsx',
          'src/services/auth.mock.ts',
          'src/wiring-report.json',
        ],
      },
    ],
  },
  {
    id: 'T27',
    title: 'Stats overview block: add a stats screen',
    category: 'config-edit',
    description: 'Replace the home screen block with a stats overview block.',
    operation: {
      kind: 'replace-block',
      instance: 'b3',
      type: 'stats.overview@1.0.0',
      variant: 'row',
      config: {
        title: 'This week',
        stats: [
          { label: 'Day streak', value: '12' },
          { label: 'Completed', value: '34' },
        ],
      },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'src/blocks/b3.tsx',
          'src/screens/s3.tsx',
          'src/wiring-report.json',
        ],
      },
    ],
  },
  {
    id: 'T28',
    title: 'Stats variant swap: row -> grid',
    category: 'variant-swap',
    description: 'Switch the stats block to the grid layout.',
    operation: {
      kind: 'replace-block',
      instance: 'b3',
      type: 'stats.overview@1.0.0',
      variant: 'grid',
      config: {
        title: 'This week',
        stats: [
          { label: 'Day streak', value: '12' },
          { label: 'Completed', value: '34' },
        ],
      },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'src/blocks/b3.tsx',
          'src/screens/s3.tsx',
          'src/wiring-report.json',
        ],
      },
    ],
  },
  {
    id: 'T29',
    title: 'Semantic routing: tapping an item opens its detail',
    category: 'wiring',
    description:
      'Adding a content.detail screen must auto-wire home.itemSelected to it semantically — no manual wire needed.',
    operation: {
      kind: 'add-screen',
      screen: { id: 's4', block: 'b4', title: 'Detail' },
      block: { id: 'b4', type: 'content.detail@1.0.0', variant: 'article', config: {} },
    },
    expects: 'success',
    checks: [
      { kind: 'wire-origin', instance: 'b3', event: 'home.itemSelected', origin: 'auto' },
      {
        kind: 'wire-target',
        instance: 'b3',
        event: 'home.itemSelected',
        screen: 's4',
        toInstance: 'b4',
      },
    ],
  },
  {
    id: 'T30',
    title: 'Entity Spine: attaching a spine emits SQL + types + client',
    category: 'graph-op',
    description:
      'Attaching an Entity Spine must generate the migration, TS types, and Supabase client.',
    operation: { kind: 'set-spine', spine: SPINE_V1 },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'package.json',
          'src/spine-types.ts',
          'src/supabase.ts',
          'supabase/migrations/0001_spine.sql',
          'src/wiring-report.json',
        ],
      },
      {
        kind: 'file-contains',
        path: 'supabase/migrations/0001_spine.sql',
        text: 'CREATE TABLE IF NOT EXISTS "profiles"',
      },
      { kind: 'file-contains', path: 'src/spine-types.ts', text: 'export interface Database' },
    ],
  },
  {
    id: 'T31',
    title: 'Entity Spine: invalid spine rejected',
    category: 'invalid',
    description: 'A spine with a duplicate entity name must fail validation loudly.',
    operation: {
      kind: 'set-spine',
      spine: {
        entities: [
          {
            name: 'profiles',
            fields: [{ name: 'id', type: 'uuid', primaryKey: true }],
          },
          {
            name: 'profiles',
            fields: [{ name: 'id', type: 'uuid', primaryKey: true }],
          },
        ],
      },
    },
    expects: 'compile-error',
  },
  {
    id: 'T32',
    title: 'Entity Spine: spine compile is deterministic',
    category: 'determinism',
    description: 'Compiling with a spine twice must produce identical output.',
    operation: { kind: 'set-spine', spine: SPINE_V1 },
    expects: 'success',
    checks: [{ kind: 'hash-stable' }],
  },
  // ---------------------------------------------------------------- M2 tasks
  {
    id: 'T33',
    title: 'Profile Cascade: six answers configure the app',
    category: 'graph-op',
    description:
      'Applying a profile derives the app name, slug, brand color, and paywall copy/price.',
    operation: {
      kind: 'apply-profile',
      profile: {
        appName: 'BenchApp',
        audience: 'testers',
        tone: 'professional',
        brandColor: '#123456',
        price: '9.99',
        currency: 'EUR',
      },
    },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: [
          'blockfw.lock.json',
          'README.md',
          'app.json',
          'package.json',
          'src/blocks/b2.tsx',
          'src/theme.ts',
          'src/wiring-report.json',
        ],
      },
      { kind: 'file-contains', path: 'src/theme.ts', text: '#123456' },
      { kind: 'file-contains', path: 'src/blocks/b2.tsx', text: 'BenchApp Premium' },
      { kind: 'file-contains', path: 'src/blocks/b2.tsx', text: '€9.99' },
    ],
  },
  {
    id: 'T34',
    title: 'Profile Cascade: hand-edited fields are never overwritten',
    category: 'graph-op',
    description: 'A touched paywall headline survives re-cascade; the brand color still updates.',
    operation: {
      kind: 'apply-profile',
      profile: {
        appName: 'BenchApp',
        audience: 'testers',
        tone: 'professional',
        brandColor: '#123456',
        price: '9.99',
        currency: 'EUR',
      },
      touched: ['block:b2.config.headline'],
    },
    expects: 'success',
    checks: [
      // The original headline (not the derived "BenchApp Premium") is still there.
      { kind: 'file-contains', path: 'src/blocks/b2.tsx', text: 'Unlock your full potential' },
      { kind: 'file-contains', path: 'src/theme.ts', text: '#123456' },
    ],
  },
  {
    id: 'T35',
    title: 'Flow Lanes: moving a screen to the tabs lane',
    category: 'graph-op',
    description:
      'Assigning a tabs lane adds navigation controls and updates the flow model — no block code.',
    operation: { kind: 'set-lane', screen: 's3', lane: 'tabs' },
    expects: 'success',
    checks: [
      {
        kind: 'changed-files',
        only: ['blockfw.lock.json', 'src/navigation.tsx', 'src/wiring-report.json'],
      },
      { kind: 'file-contains', path: 'src/wiring-report.json', text: '"tabs"' },
    ],
  },
  {
    id: 'T36',
    title: 'Block cards: deterministic and within budget',
    category: 'determinism',
    description: 'All 8 block cards generate deterministically within 300 tokens.',
    operation: { kind: 'none' },
    expects: 'success',
    checks: [{ kind: 'cards-stable' }],
  },
];
