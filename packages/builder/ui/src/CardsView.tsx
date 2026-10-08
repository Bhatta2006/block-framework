import { useEffect, useState } from 'react';
import { api, type BlockCard } from './api';

/** Block cards: the ≤300-token summaries, as the M3 agent will see them. */
export function CardsView() {
  const [cards, setCards] = useState<BlockCard[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api.getCards().then(setCards).catch(console.error);
  }, []);

  return (
    <div className="cards-view">
      <h2>Block cards</h2>
      <p className="hint">
        Explore each block’s configuration, event ports, variants, and editable fields. Token counts
        are compact-summary estimates (characters ÷ 4).
      </p>
      <div className="card-grid">
        {cards.map((c) => (
          <div key={c.block} className="block-card">
            <button
              type="button"
              className="block-card-head"
              onClick={() => setOpen(open === c.block ? null : c.block)}
            >
              <code>{c.block}</code>
              <span className="token-badge">~{c.estimatedTokens} tokens</span>
            </button>
            {open === c.block && <pre className="block-card-body">{c.markdown}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}
