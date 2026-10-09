import React from 'react';

export interface HeroConfig {
  eyebrow?: string;
  title?: string;
  body?: string;
  ctaText?: string;
}

export function Hero({
  config,
  variant,
  emit,
  decorate,
}: {
  config: HeroConfig;
  variant?: string;
  emit: (event: string, payload?: unknown) => boolean | void;
  decorate?: (tree: React.ReactElement) => React.ReactNode;
}) {
  const tree = (
    <section className={'block-surface hero ' + (variant === 'compact' ? 'compact-hero' : '')}>
      <span className="eyebrow">{config.eyebrow}</span>
      <h1>{config.title}</h1>
      <p className="lead">{config.body}</p>
      <button className="primary" onClick={() => emit('action.pressed', {})}>
        {config.ctaText} <span>→</span>
      </button>
      <div className="hero-orbit" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>✧</span>
      </div>
    </section>
  );
  return decorate ? decorate(tree) : tree;
}
