import {
  asOptionList,
  PER_OPTION_EV_GAP,
  type BuyClass,
  type BuyOptionEvaluation,
  type EngineBuyOption,
  type EconomyEngine,
  type FreezeSnapshot,
} from "./economy-engine.js";
import { ReviewError } from "./errors.js";
import { narrateLeak } from "./narrate.js";

/** Gaps at or below this are the same decision for ranking purposes. */
export const EV_LEAK_EPSILON = 1e-9;

/**
 * How much worse the played buy is than the best class, in loss-bonus steps.
 * Positive cost ranks first. zhasi's regret is the negation (`chosen - best`).
 */
export function leakCost(bestExpectedValue: number, chosenExpectedValue: number): number {
  return bestExpectedValue - chosenExpectedValue;
}

/** The regret published on `evaluateBuyOptions`: `chosen.expectedValue - best`. */
export function engineRegret(chosenExpectedValue: number, bestExpectedValue: number): number {
  return chosenExpectedValue - bestExpectedValue;
}

export type RoundWinner = "us" | "them";

export interface PlayedRound<TState = FreezeSnapshot> {
  roundNumber: number;
  winner: RoundWinner;
  chosenBuy: BuyClass;
  /**
   * Freeze snapshot for `evaluateFreeze` when this round has no logged
   * option table. Enemy cash is not a field. `winner` is the post-match
   * result of this round and is not part of the snapshot's history.
   */
  state?: TState;
  /** `evaluateBuyOptions` rows already captured at freeze time, when the log has them. */
  options?: readonly EngineBuyOption[];
}

export interface DecisionLeak {
  roundNumber: number;
  winner: RoundWinner;
  chosenBuy: BuyClass;
  betterBuy: BuyClass;
  /**
   * `best.expectedValue - chosen.expectedValue`, in loss-bonus steps
   * (1 point = $500). Positive means the played buy was worse.
   * zhasi's regret is `-evCost`.
   */
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
 * For each round, ask `evaluateBuyOptions` unless the round already logged
 * that table. Leak cost is `best.expectedValue - chosen.expectedValue`
 * (positive). zhasi's regret is `chosen - best`. Round winners are reported
 * and are not the ranking key.
 *
 * `evaluateFreeze` stays the freeze-time recommendation. It is not what
 * ranks the match.
 */
export function reviewMatch<TState = FreezeSnapshot>(
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
      `Round ${round.roundNumber} has no logged options and no freeze snapshot to send to evaluateFreeze.`,
    );
  }
  if (!engine) {
    throw new ReviewError(
      "missing-ev",
      `Round ${round.roundNumber} needs a logged option table or zhasi's evaluateFreeze. ${PER_OPTION_EV_GAP}`,
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
    `Round ${roundNumber}: ${PER_OPTION_EV_GAP} Returned buy ${recommendation.recommendation}. Pass a logged options table to rank this leak.`,
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
  const evCost = leakCost(best.expectedValue, chosen.expectedValue);
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
  const players = (state as { ourPlayers?: unknown }).ourPlayers;
  if (!Array.isArray(players)) return undefined;
  return players.filter((player) => {
    return Boolean(player) && typeof player === "object" && (player as { hasPrimary?: unknown }).hasPrimary === true;
  }).length;
}
