import { type Card, type CardRank, type CardSuit } from "./hand";

/**
 * A persistent multi-deck shoe: cards are shuffled once, then drawn in
 * order and never revisited. Designed to later support decks-remaining /
 * penetration / true-count / deviation features without changing this
 * shape — only draw() and the read-only getters are needed for those.
 */

const RANKS: CardRank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: CardSuit[] = ["♠", "♥", "♦", "♣"];
const CARDS_PER_DECK = RANKS.length * SUITS.length;

export interface Shoe {
  /** Deals the next card, permanently removing it from the shoe. Throws if the shoe is empty. */
  draw: () => Card;
  cardsRemaining: () => number;
  /** Fixed for the life of the shoe (deckCount * 52) — the denominator for cardsRemaining. */
  totalCards: () => number;
  decksRemaining: () => number;
  /** Fraction of the shoe already dealt, 0 (fresh) to 1 (empty). */
  penetration: () => number;
}

function buildDeck(deckIndex: number): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${rank}-${suit}-shoe${deckIndex}`, rank, suit });
    }
  }
  return cards;
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Builds and shuffles a fresh shoe of `deckCount` standard 52-card decks. */
export function createShoe(deckCount: number): Shoe {
  const totalCards = deckCount * CARDS_PER_DECK;
  const cards = shuffle(Array.from({ length: deckCount }, (_, i) => buildDeck(i)).flat());
  let dealtCount = 0;

  const draw = (): Card => {
    if (dealtCount >= cards.length) {
      throw new Error("Shoe is empty");
    }
    const card = cards[dealtCount];
    dealtCount += 1;
    return card;
  };

  const cardsRemaining = () => totalCards - dealtCount;
  const decksRemaining = () => cardsRemaining() / CARDS_PER_DECK;
  const penetration = () => dealtCount / totalCards;

  return { draw, cardsRemaining, totalCards: () => totalCards, decksRemaining, penetration };
}
