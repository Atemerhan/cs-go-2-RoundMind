import {
  asOptionList,
  type BuyClass,
  type BuyOptionEvaluation,
  type EconomyEngine,
  type EconomyEvaluationInput,
} from "./economy-engine.js";
import { ReviewError } from "./errors.js";
import { narrateLeak } from "./narrate.js";

/** Gaps at or below this are the same decision for ranking purposes. */
export const EV_LEAK_EPSILON = 1e-9;

export type RoundWinner = "us" | "them";

export interface PlayedRound<TState = EconomyEvaluationInput> {
  roundNumber: number;
  winner: RoundWinner;
  chosenBuy: BuyClass;
  /**
   * Passed through to zhasi's EconomyEngine when this round has no logged
   * option table. The review does not read money rules out of it.
   */
  state?: TState;
  /** Engine-computed EV captured at freeze time, when the log already has it. */
  options?: readonly BuyOptionEvaluation[];
}

export interface DecisionLeak {
  roundNumber: number;
  winner: RoundWinner;
  chosenBuy: BuyClass;
  betterBuy: BuyClass;
  /** best.expectedValue - chosen.expectedValue, in the engine's units. */
  evCost: number;
  chosenExpectedValue: number;
  betterExpectedValue: number;
  chosenReason: BuyOptionEvaluation["reason"];
  betterReason: BuyOptionEvaluation["reason"];
  summary: { en: string; zh: string };
  saveEligibleCount?: number;
}

export interface MatchReview {
  /** The leaks that cost the most expected value, best-first. */
  leaks: DecisionLeak[];
  totalLeaks: number;
  roundsConsidered: number;
  source: "logged" | "engine" | "mixed" | "none";
}

export interface ReviewOptions {
  /** How many leaks to return. The blueprint asks for three. */
  limit?: number;
}

interface ResolvedRound {
  leak: DecisionLeak | null;
  source: "logged" | "engine";
}

/**
 * Rank a match by expected-value gap.
 *
 * For each round, take the option table already stored on the round or ask
 * `engine.evaluateBuyOptions` / `engine.recommend().options`. The leak size
 * is the best line's EV minus the line that was played. Round winners are
 * reported and are not used as the ranking key: a won round can still be a
 * leak, and a correct save can still lose the round.
 *
 * Logged `options` are the record of what the engine said at freeze time,
 * so they are used as-is and the engine is not called again for that round.
 */
export function reviewMatch<TState = EconomyEvaluationInput>(
  rounds: readonly PlayedRound<TState>[],
  engine?: EconomyEngine<TState>,
  options: ReviewOptions = {},
): MatchReview {
  const limit = options.limit ?? 3;
  if (!Number.isInteger(limit) || limit < 0) {
    throw new ReviewError("invalid-round", "Review limit must be a non-negative integer.");
  }

  const resolved = rounds.map((round) => resolveRound(round, engine));
  const leaks = resolved
    .map((entry) => entry.leak)
    .filter((leak): leak is DecisionLeak => leak !== null)
    .sort((a, b) => b.evCost - a.evCost || a.roundNumber - b.roundNumber);

  const sources = new Set(resolved.map((entry) => entry.source));
  let source: MatchReview["source"] = "none";
  if (sources.size === 1) source = [...sources][0] ?? "none";
  else if (sources.size > 1) source = "mixed";

  return {
    leaks: leaks.slice(0, limit),
    totalLeaks: leaks.length,
    roundsConsidered: rounds.length,
    source: rounds.length === 0 ? "none" : source,
  };
}

function resolveRound<TState>(
  round: PlayedRound<TState>,
  engine: EconomyEngine<TState> | undefined,
): ResolvedRound {
  assertRound(round);
  if (round.options) {
    return {
      leak: leakFromOptions(round, asOptionList(round.options, `round ${round.roundNumber} options`)),
      source: "logged",
    };
  }

  if (!round.state) {
    throw new ReviewError(
      "missing-ev",
      `Round ${round.roundNumber} has no logged options and no state to send to zhasi's EconomyEngine.`,
    );
  }
  if (!engine) {
    throw new ReviewError(
      "missing-ev",
      `Round ${round.roundNumber} needs zhasi's EconomyEngine. Pass engine options on the round, or inject EconomyEngine.`,
    );
  }

  const table = optionsFromEngine(engine, round.state, round.roundNumber);
  return { leak: leakFromOptions(round, table), source: "engine" };
}

function optionsFromEngine<TState>(
  engine: EconomyEngine<TState>,
  state: TState,
  roundNumber: number,
): BuyOptionEvaluation[] {
  if (engine.evaluateBuyOptions) {
    return asOptionList(
      engine.evaluateBuyOptions(state),
      `EconomyEngine.evaluateBuyOptions(round ${roundNumber})`,
    );
  }
  const recommendation = engine.recommend(state);
  if (recommendation.options && recommendation.options.length > 0) {
    return asOptionList(
      recommendation.options,
      `EconomyEngine.recommend(round ${roundNumber}).options`,
    );
  }
  throw new ReviewError(
    "missing-ev",
    `Round ${roundNumber}: zhasi's recommend() returned ${recommendation.recommendation} without a per-class expectedValue table. evaluateBuyOptions() or recommend().options is required to rank leaks.`,
  );
}

function leakFromOptions<TState>(
  round: PlayedRound<TState>,
  options: readonly BuyOptionEvaluation[],
): DecisionLeak | null {
  const chosen = options.find((option) => option.buyClass === round.chosenBuy);
  if (!chosen) {
    throw new ReviewError(
      "unknown-buy",
      `Round ${round.roundNumber} played ${round.chosenBuy}, which is absent from the engine option table.`,
    );
  }

  const best = bestOption(options);
  const evCost = best.expectedValue - chosen.expectedValue;
  if (best.buyClass === chosen.buyClass || evCost <= EV_LEAK_EPSILON) {
    return null;
  }

  const saveEligibleCount = saveEligibleCountOf(round.state);
  const summary = narrateLeak({
    roundNumber: round.roundNumber,
    chosenBuy: chosen.buyClass,
    betterBuy: best.buyClass,
    evCost,
    betterReason: best.reason,
    saveEligibleCount,
  });

  return {
    roundNumber: round.roundNumber,
    winner: round.winner,
    chosenBuy: chosen.buyClass,
    betterBuy: best.buyClass,
    evCost,
    chosenExpectedValue: chosen.expectedValue,
    betterExpectedValue: best.expectedValue,
    chosenReason: chosen.reason,
    betterReason: best.reason,
    summary,
    saveEligibleCount,
  };
}

function bestOption(options: readonly BuyOptionEvaluation[]): BuyOptionEvaluation {
  const ranked = options.map((option, index) => ({ option, index }));
  ranked.sort((a, b) => b.option.expectedValue - a.option.expectedValue || a.index - b.index);
  const best = ranked[0]?.option;
  if (!best) {
    throw new ReviewError("empty-options", "Buy option table is empty.");
  }
  return best;
}

function assertRound(round: PlayedRound<unknown>): void {
  if (!Number.isInteger(round.roundNumber) || round.roundNumber < 1) {
    throw new ReviewError("invalid-round", "Round number must be a positive integer.");
  }
  if (round.winner !== "us" && round.winner !== "them") {
    throw new ReviewError("invalid-round", `Round ${round.roundNumber} winner must be "us" or "them".`);
  }
  if (round.chosenBuy !== "full" && round.chosenBuy !== "force" && round.chosenBuy !== "eco" && round.chosenBuy !== "save") {
    throw new ReviewError(
      "unknown-buy",
      `Round ${round.roundNumber} chosen buy must be full, force, eco, or save.`,
    );
  }
}

function saveEligibleCountOf(state: unknown): number | undefined {
  if (!state || typeof state !== "object") return undefined;
  const value = (state as { saveEligibleCount?: unknown }).saveEligibleCount;
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ReviewError("invalid-round", "saveEligibleCount must be a non-negative integer.");
  }
  return value;
}
