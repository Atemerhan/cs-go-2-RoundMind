import {
  asOptionList,
  type BuyOptionEvaluation,
  type EconomyEngine,
  type FreezeSnapshot,
  type FreezeTimeRecommendation,
} from "./economy-engine.js";
import { ReviewError } from "./errors.js";

/**
 * Lookup double for tests and the demo CLI.
 *
 * This is a table of engine-shaped results keyed by round number. It exists
 * for ranking tests that pass a hand-built `{ buy, expectedValue }` list.
 * Blueprint fixtures do not use it. Live scores come from `evaluateBuyOptions`.
 */
export interface FixtureLookupEngine extends EconomyEngine<FreezeSnapshot> {
  evaluateBuyOptions: (input: FreezeSnapshot) => BuyOptionEvaluation[];
}

export function createFixtureLookupEngine(
  byRound: ReadonlyMap<number, readonly BuyOptionEvaluation[]>,
): FixtureLookupEngine {
  return {
    recommend(input) {
      const options = lookup(byRound, input.roundNumber);
      const best = [...options].sort((a, b) => b.expectedValue - a.expectedValue)[0];
      if (!best) {
        throw new ReviewError("empty-options", `Fixture round ${input.roundNumber} has no options.`);
      }
      const recommendation: FreezeTimeRecommendation = {
        recommendation: best.buyClass,
        reason: best.reason,
        options,
      };
      return recommendation;
    },
    evaluateBuyOptions(input) {
      return lookup(byRound, input.roundNumber);
    },
  };
}

function lookup(
  byRound: ReadonlyMap<number, readonly BuyOptionEvaluation[]>,
  roundNumber: number,
): BuyOptionEvaluation[] {
  const found = byRound.get(roundNumber);
  if (!found) {
    throw new ReviewError(
      "missing-ev",
      `Fixture lookup has no EconomyEngine table for round ${roundNumber}.`,
    );
  }
  return asOptionList(found, `fixture round ${roundNumber}`);
}

export function fixtureTable(
  rows: readonly { roundNumber: number; options: readonly BuyOptionEvaluation[] }[],
): Map<number, readonly BuyOptionEvaluation[]> {
  return new Map(rows.map((row) => [row.roundNumber, row.options]));
}
