import {
  evaluateBuyOptions,
  evaluateFreeze,
  type BuyClass,
  type BuyOption,
  type FreezeAdvice,
  type Side,
} from "@roundmind/engine";
import {
  adaptEconomyEngine,
  reviewMatch,
  type DecisionLeak,
  type PlayedRound,
} from "@roundmind/post-match";

const engine = adaptEconomyEngine({ evaluateFreeze, evaluateBuyOptions });

export interface RoundReview {
  roundNumber: number;
  winner: "us" | "them";
  chosenBuy: BuyClass;
  /** Freeze call when a snapshot was scored. Otherwise the highest logged score. */
  recommendedBuy: BuyClass | null;
  matched: boolean;
  evCost: number;
  chosenExpectedValue: number | null;
  bestExpectedValue: number | null;
  options: BuyOption[];
  /** `logged` means the file already stored `evaluateBuyOptions` rows. */
  scoreSource: "logged" | "engine";
  saveEligibleCount?: number;
  economy: FreezeAdvice | null;
  ourSide: Side | null;
}

export interface BuiltReview {
  rounds: RoundReview[];
  roundsConsidered: number;
  totalLeaks: number;
  aligned: number;
  totalEvCost: number;
  highlights: DecisionLeak[];
  source: "logged" | "engine" | "mixed" | "none";
}

/** Rank a parsed match with the post-match review, then describe every round. */
export function buildMatchReview(rounds: readonly PlayedRound[]): BuiltReview {
  const full = reviewMatch(rounds, engine, { limit: rounds.length });
  const leaks = new Map(full.leaks.map((leak) => [leak.roundNumber, leak]));
  const described = [...rounds]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((round) => describeRound(round, leaks.get(round.roundNumber)));
  return {
    rounds: described,
    roundsConsidered: full.roundsConsidered,
    totalLeaks: full.totalLeaks,
    aligned: full.roundsConsidered - full.totalLeaks,
    totalEvCost: full.leaks.reduce((sum, leak) => sum + leak.evCost, 0),
    highlights: full.leaks.slice(0, 3),
    source: full.source,
  };
}

function describeRound(round: PlayedRound, leak: DecisionLeak | undefined): RoundReview {
  const logged = round.options !== undefined && round.options.length > 0;
  const economy = round.state ? evaluateFreeze(round.state) : null;
  const options: BuyOption[] = logged
    ? round.options!.map((option) => ({ buy: option.buy, expectedValue: option.expectedValue }))
    : round.state
      ? evaluateBuyOptions(round.state)
      : [];
  const best = highest(options);
  const chosen = options.find((option) => option.buy === round.chosenBuy) ?? null;
  const recommendedBuy = logged ? (best?.buy ?? null) : (economy?.buy ?? best?.buy ?? null);
  const matched = !leak && recommendedBuy !== null && recommendedBuy === round.chosenBuy;
  return {
    roundNumber: round.roundNumber,
    winner: round.winner,
    chosenBuy: round.chosenBuy,
    recommendedBuy,
    matched,
    evCost: leak?.evCost ?? 0,
    chosenExpectedValue: chosen?.expectedValue ?? leak?.chosenExpectedValue ?? null,
    bestExpectedValue: best?.expectedValue ?? leak?.betterExpectedValue ?? null,
    options,
    scoreSource: logged ? "logged" : "engine",
    saveEligibleCount: leak?.saveEligibleCount,
    economy,
    ourSide: round.state?.ourSide ?? null,
  };
}

function highest(options: readonly BuyOption[]): BuyOption | null {
  return options.reduce<BuyOption | null>((best, option) => {
    if (!best || option.expectedValue > best.expectedValue) return option;
    return best;
  }, null);
}
