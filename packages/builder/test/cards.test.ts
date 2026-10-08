import { describe, expect, it } from 'vitest';
import { assertCardsWithinBudget, estimateTokens, generateAllCards } from '@blockfw/builder';

describe('block cards', () => {
  it('generates a card for every registered block', () => {
    const cards = generateAllCards();
    expect(cards).toHaveLength(11);
    const ids = cards.map((c) => c.block);
    expect(new Set(ids).size).toBe(11);
  });

  it('every card is within the 300-token budget (estimate)', () => {
    const cards = generateAllCards();
    expect(() => assertCardsWithinBudget(cards, 300)).not.toThrow();
    for (const c of cards) {
      expect(c.estimatedTokens).toBeLessThanOrEqual(300);
    }
  });

  it('cards are deterministic', () => {
    const a = generateAllCards().map((c) => c.markdown);
    const b = generateAllCards().map((c) => c.markdown);
    expect(a).toEqual(b);
  });

  it('cards carry the fields an agent needs', () => {
    const cards = generateAllCards();
    const quiz = cards.find((c) => c.block.startsWith('onboarding.quiz'));
    expect(quiz).toBeDefined();
    expect(quiz!.markdown).toMatch(/Variants:/);
    expect(quiz!.markdown).toMatch(/Config:/);
    expect(quiz!.markdown).toMatch(/Emits:/);
    expect(quiz!.markdown).toMatch(/Consumes:/);
    expect(quiz!.markdown).toMatch(/Edit surface:/);
    // Semantic payload survives the summary.
    const home = cards.find((c) => c.block.startsWith('home.list'));
    expect(home!.markdown).toMatch(/home\.itemSelected/);
  });

  it('estimateTokens is chars/4 rounded up', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
