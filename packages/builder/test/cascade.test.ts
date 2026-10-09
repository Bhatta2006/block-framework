import { describe, expect, it } from 'vitest';
import {
  applyCascade,
  emptyProject,
  markTouched,
  validateProfile,
  type BuilderProfile,
  type BuilderProject,
} from '@blockfw/builder';
import type { ProjectGraph } from '@blockfw/manifest';

function testGraph(): ProjectGraph {
  return {
    schemaVersion: '0',
    app: { name: 'App', slug: 'app', version: '1.0.0', theme: { primaryColor: '#000000' } },
    blocks: [
      {
        id: 'b1',
        type: 'paywall.basic@1.0.0',
        variant: 'cards',
        config: {
          headline: 'Old',
          subheadline: 'Old sub',
          ctaText: 'Old CTA',
          products: [{ id: 'monthly', title: 'Monthly', price: '$9.99', period: 'month' }],
        },
      },
      {
        id: 'b2',
        type: 'auth.email@1.0.0',
        variant: 'signin',
        config: { headline: 'Hi' },
      },
    ],
    screens: [{ id: 's1', block: 'b2', title: 'Sign in' }],
  };
}

const PROFILE: BuilderProfile = {
  appName: 'HabitFlow',
  audience: 'busy professionals',
  tone: 'playful',
  brandColor: '#4F46E5',
  price: '4.99',
  currency: 'USD',
};

function projectWithProfile(): BuilderProject {
  const p = emptyProject(testGraph());
  p.profile = { ...PROFILE };
  return p;
}

describe('applyCascade', () => {
  it('protects an edited parent array from nested derived writes', () => {
    const p = projectWithProfile();
    markTouched(p, 'block:b1.config.products');
    const before = structuredClone(p.graph.blocks[0]!.config!.products);
    const result = applyCascade(p);
    expect(p.graph.blocks[0]!.config!.products).toEqual(before);
    expect(result.skippedTouched).toContain('block:b1.config.products.0.price');
  });
  it('derives app fields, theme, and block configs from the profile', () => {
    const p = projectWithProfile();
    const { applied } = applyCascade(p);
    expect(p.graph.app.name).toBe('HabitFlow');
    expect(p.graph.app.slug).toBe('habitflow');
    expect(p.graph.app.theme?.primaryColor).toBe('#4F46E5');
    const paywall = p.graph.blocks.find((b) => b.id === 'b1');
    expect(paywall?.config).toMatchObject({
      headline: 'Supercharge your HabitFlow',
      subheadline: 'Built for busy professionals. Cancel anytime.',
      ctaText: "Let's go!",
    });
    expect((paywall?.config as { products: Array<{ price: string }> }).products[0]?.price).toBe(
      '$4.99',
    );
    const auth = p.graph.blocks.find((b) => b.id === 'b2');
    expect(auth?.config).toMatchObject({ headline: 'Welcome to HabitFlow' });
    expect(applied.length).toBeGreaterThan(5);
  });

  it('never overwrites user-touched paths (exit criterion)', () => {
    const p = projectWithProfile();
    // User hand-edits the paywall headline and the brand color target.
    const paywall = p.graph.blocks.find((b) => b.id === 'b1');
    (paywall!.config as Record<string, unknown>)['headline'] = 'My custom headline';
    markTouched(p, 'block:b1.config.headline');

    // First cascade applies everything except the touched headline.
    const first = applyCascade(p);
    expect(first.applied).not.toContain('block:b1.config.headline');
    expect(first.skippedTouched).toContain('block:b1.config.headline');
    expect((paywall!.config as Record<string, unknown>)['headline']).toBe('My custom headline');

    // User changes the brand color; re-derive. Only untouched paths update.
    p.profile = { ...PROFILE, brandColor: '#E11D48' };
    const second = applyCascade(p);
    expect(p.graph.app.theme?.primaryColor).toBe('#E11D48');
    expect(second.applied).toContain('app.theme.primaryColor');
    // The user's headline is still theirs.
    expect((paywall!.config as Record<string, unknown>)['headline']).toBe('My custom headline');
    expect(second.skippedTouched).toContain('block:b1.config.headline');
  });

  it('is idempotent', () => {
    const p = projectWithProfile();
    applyCascade(p);
    const before = JSON.stringify(p.graph);
    const { applied } = applyCascade(p);
    expect(JSON.stringify(p.graph)).toBe(before);
    expect(applied.length).toBeGreaterThan(0); // re-applies same values
  });

  it('throws without a profile', () => {
    const p = emptyProject(testGraph());
    expect(() => applyCascade(p)).toThrow(/no profile/);
  });

  it('formats INR prices', () => {
    const p = projectWithProfile();
    p.profile = { ...PROFILE, price: '199', currency: 'INR' };
    applyCascade(p);
    const paywall = p.graph.blocks.find((b) => b.id === 'b1');
    expect((paywall?.config as { products: Array<{ price: string }> }).products[0]?.price).toBe(
      '₹199',
    );
  });
});

describe('validateProfile', () => {
  it('accepts a complete profile', () => {
    expect(validateProfile(PROFILE)).toEqual([]);
  });

  it('rejects bad color and price', () => {
    const errors = validateProfile({ ...PROFILE, brandColor: 'red', price: 'free' });
    expect(errors.join(' ')).toMatch(/hex/);
    expect(errors.join(' ')).toMatch(/number/);
  });
});

describe('markTouched', () => {
  it('is idempotent and sorted', () => {
    const p = projectWithProfile();
    markTouched(p, 'b.path');
    markTouched(p, 'a.path');
    markTouched(p, 'a.path');
    expect(p.touched).toEqual(['a.path', 'b.path']);
  });
});
