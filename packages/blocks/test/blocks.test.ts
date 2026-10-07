import { describe, expect, it } from 'vitest';
import { validateBlockConfig } from '@blockfw/manifest';
import { componentNameFor, loadDefaultRegistry, type RenderContext } from '@blockfw/blocks';
import quizSample from '../src/blocks/onboarding.quiz/sample-config.json' with { type: 'json' };
import paywallSample from '../src/blocks/paywall.basic/sample-config.json' with { type: 'json' };
import homeSample from '../src/blocks/home.list/sample-config.json' with { type: 'json' };

const THEME = { primaryColor: '#6C5CE7', backgroundColor: '#FFFFFF', textColor: '#1A1A2E' };

function ctxFor(
  instanceId: string,
  variant: string,
  config: Record<string, unknown>,
): RenderContext {
  return {
    instanceId,
    componentName: componentNameFor(instanceId),
    screenId: 's1',
    variant,
    config,
    theme: THEME,
    onCompleteTarget: 's2',
  };
}

describe('default registry', () => {
  it('loads the three M0 blocks', () => {
    const registry = loadDefaultRegistry();
    expect(registry.size()).toBe(3);
    expect(registry.has('onboarding.quiz@1.0.0')).toBe(true);
    expect(registry.has('paywall.basic@1.0.0')).toBe(true);
    expect(registry.has('home.list@1.0.0')).toBe(true);
  });

  it('throws a helpful error for unknown block types', () => {
    const registry = loadDefaultRegistry();
    expect(() => registry.get('nope.nope@1.0.0')).toThrow(/Unknown block type/);
  });

  it('rejects duplicate registration', () => {
    const registry = loadDefaultRegistry();
    const quiz = registry.get('onboarding.quiz@1.0.0');
    expect(() => registry.register(quiz.manifest, quiz.render)).toThrow(/Duplicate/);
  });
});

describe('sample configs', () => {
  it('all sample configs validate against their block schemas', () => {
    const registry = loadDefaultRegistry();
    const samples: Array<[string, unknown]> = [
      ['onboarding.quiz@1.0.0', quizSample],
      ['paywall.basic@1.0.0', paywallSample],
      ['home.list@1.0.0', homeSample],
    ];
    for (const [typeRef, sample] of samples) {
      const { manifest } = registry.get(typeRef);
      const config = (sample as { config: Record<string, unknown> }).config;
      expect(validateBlockConfig(manifest, config)).toEqual([]);
    }
  });
});

describe('templates', () => {
  const cases: Array<{
    typeRef: string;
    variants: string[];
    sample: { config: Record<string, unknown> };
    markers: string[];
  }> = [
    {
      typeRef: 'onboarding.quiz@1.0.0',
      variants: ['quiz-cards', 'quiz-list'],
      sample: quizSample,
      markers: ['QuizQuestion', 'onComplete', 'theme.colors.primary'],
    },
    {
      typeRef: 'paywall.basic@1.0.0',
      variants: ['cards', 'compact'],
      sample: paywallSample,
      markers: ['purchaseProduct', 'MOCK CHECKOUT', 'Restore purchases'],
    },
    {
      typeRef: 'home.list@1.0.0',
      variants: ['list', 'grid'],
      sample: homeSample,
      markers: ['FlatList', 'CONFIG.title'],
    },
  ];

  for (const { typeRef, variants, sample, markers } of cases) {
    describe(typeRef, () => {
      for (const variant of variants) {
        it(`renders variant ${variant}`, () => {
          const registry = loadDefaultRegistry();
          const { render } = registry.get(typeRef);
          const out = render(ctxFor('b1', variant, sample.config));
          expect(out.fileName).toBe('b1.tsx');
          expect(out.content).toContain('export function B1Block');
          for (const marker of markers) {
            expect(out.content).toContain(marker);
          }
        });
      }

      it('is deterministic', () => {
        const registry = loadDefaultRegistry();
        const { render } = registry.get(typeRef);
        const firstVariant = variants[0];
        if (!firstVariant) throw new Error('test fixture broken');
        const a = render(ctxFor('b1', firstVariant, sample.config));
        const b = render(ctxFor('b1', firstVariant, sample.config));
        expect(a.content).toBe(b.content);
      });

      it('falls back to the default variant on unknown variant names', () => {
        const registry = loadDefaultRegistry();
        const { render } = registry.get(typeRef);
        const out = render(ctxFor('b1', 'not-a-variant', sample.config));
        expect(out.content.length).toBeGreaterThan(100);
      });
    });
  }

  it('sanitizes component names', () => {
    expect(componentNameFor('b1')).toBe('B1Block');
    expect(componentNameFor('my-block')).toBe('MyblockBlock');
  });
});
