import {
  asOptionList,
  type BuyOptionEvaluation,
  type EconomyEngine,
  type EconomyEvaluationInput,
  type FreezeTimeRecommendation,
} from "./economy-engine.js";
import { ReviewError } from "./errors.js";

/**
 * Lookup double for tests and the demo CLI.
 *
 * This is a table of engine-shaped results keyed by round number. It exists
 * so the review can run before kohi's `packages/economy` is on main. It has
 * no loss-bonus ladder, kill rewards, or other CS2 rule numbers — those stay
 * in kohi's EconomyEngine. Unknown rounds throw rather than invent an EV.
 */
export function createFixtureLookupEngine(
  byRound: ReadonlyMap<number, readonly BuyOptionEvaluation[]>,
): EconomyEngine<EconomyEvaluationInput> {
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
        enemyEconomyBand: input.enemyEconomyBand,
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
