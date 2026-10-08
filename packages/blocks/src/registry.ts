import { validateManifest, type BlockManifest } from '@blockfw/manifest';
import type { BlockTemplate } from './types.js';
import quizManifestJson from './blocks/onboarding.quiz/manifest.json' with { type: 'json' };
import { render as renderQuiz } from './blocks/onboarding.quiz/template.js';
import paywallManifestJson from './blocks/paywall.basic/manifest.json' with { type: 'json' };
import { render as renderPaywall } from './blocks/paywall.basic/template.js';
import homeManifestJson from './blocks/home.list/manifest.json' with { type: 'json' };
import { render as renderHome } from './blocks/home.list/template.js';
import settingsManifestJson from './blocks/settings.list/manifest.json' with { type: 'json' };
import { render as renderSettings } from './blocks/settings.list/template.js';
import profileManifestJson from './blocks/profile.card/manifest.json' with { type: 'json' };
import { render as renderProfile } from './blocks/profile.card/template.js';
import authManifestJson from './blocks/auth.email/manifest.json' with { type: 'json' };
import { render as renderAuth } from './blocks/auth.email/template.js';
import detailManifestJson from './blocks/content.detail/manifest.json' with { type: 'json' };
import { render as renderDetail } from './blocks/content.detail/template.js';
import statsManifestJson from './blocks/stats.overview/manifest.json' with { type: 'json' };
import { render as renderStats } from './blocks/stats.overview/template.js';

import heroManifest from './blocks/content.hero/manifest.json' with { type: 'json' };
import textManifest from './blocks/content.text/manifest.json' with { type: 'json' };
import buttonManifest from './blocks/action.button/manifest.json' with { type: 'json' };
import { renderHero, renderText, renderButton } from './primitives.js';

export interface RegisteredBlock {
  manifest: BlockManifest;
  render: BlockTemplate;
}

export class BlockRegistry {
  private readonly blocks = new Map<string, RegisteredBlock>();

  register(manifestJson: unknown, render: BlockTemplate): void {
    validateManifest(manifestJson);
    const manifest = manifestJson as BlockManifest;
    const key = `${manifest.id}@${manifest.version}`;
    if (this.blocks.has(key)) {
      throw new Error(`Duplicate block registration: ${key}`);
    }
    this.blocks.set(key, { manifest, render });
  }

  /** Look up a block by `id@semver` type reference. Throws on unknown types. */
  get(typeRef: string): RegisteredBlock {
    const block = this.blocks.get(typeRef);
    if (!block) {
      const known = [...this.blocks.keys()].join(', ');
      throw new Error(`Unknown block type: ${typeRef}. Known blocks: ${known}`);
    }
    return block;
  }

  has(typeRef: string): boolean {
    return this.blocks.has(typeRef);
  }

  keys(): string[] {
    return [...this.blocks.keys()];
  }

  size(): number {
    return this.blocks.size;
  }

  /** All registered blocks, for SDK validation. */
  entries(): RegisteredBlock[] {
    return [...this.blocks.values()];
  }
}

/** The built-in library: eleven block contracts and native renderers. */
export function loadDefaultRegistry(): BlockRegistry {
  const registry = new BlockRegistry();
  registry.register(quizManifestJson, renderQuiz);
  registry.register(paywallManifestJson, renderPaywall);
  registry.register(homeManifestJson, renderHome);
  registry.register(settingsManifestJson, renderSettings);
  registry.register(profileManifestJson, renderProfile);
  registry.register(authManifestJson, renderAuth);
  registry.register(detailManifestJson, renderDetail);
  registry.register(statsManifestJson, renderStats);
  registry.register(heroManifest, renderHero);
  registry.register(textManifest, renderText);
  registry.register(buttonManifest, renderButton);
  return registry;
}
