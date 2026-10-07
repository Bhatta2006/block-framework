import { validateManifest, type BlockManifest } from '@blockfw/manifest';
import type { BlockTemplate } from './types.js';
import quizManifestJson from './blocks/onboarding.quiz/manifest.json' with { type: 'json' };
import { render as renderQuiz } from './blocks/onboarding.quiz/template.js';
import paywallManifestJson from './blocks/paywall.basic/manifest.json' with { type: 'json' };
import { render as renderPaywall } from './blocks/paywall.basic/template.js';
import homeManifestJson from './blocks/home.list/manifest.json' with { type: 'json' };
import { render as renderHome } from './blocks/home.list/template.js';

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
}

/** The M0 library: the three hand-written blocks. */
export function loadDefaultRegistry(): BlockRegistry {
  const registry = new BlockRegistry();
  registry.register(quizManifestJson, renderQuiz);
  registry.register(paywallManifestJson, renderPaywall);
  registry.register(homeManifestJson, renderHome);
  return registry;
}
