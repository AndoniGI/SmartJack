import { type CardRank } from "./hand";

/**
 * Hi-Lo card-counting value for a single card:
 * 2-6 = +1, 7-9 = 0, 10/J/Q/K/A = -1.
 */
export function hiLoValue(rank: CardRank): number {
  switch (rank) {
    case "2":
    case "3":
    case "4":
    case "5":
    case "6":
      return 1;
    case "7":
    case "8":
    case "9":
      return 0;
    default:
      return -1; // 10, J, Q, K, A
  }
}
