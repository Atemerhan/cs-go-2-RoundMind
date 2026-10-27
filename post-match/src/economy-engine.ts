import { ReviewError } from "./errors.js";

/**
 * Consumer protocol for zhasi's forthcoming EconomyEngine
 * (`packages/engine`). Zhasi owns the implementation and every CS2 rule
 * number. Kohi polishes the calculator UI after that engine PR merges.
 *
 * This module only describes the call the post-match review will use,
 * plus a thin adapter for the two names already present in teammate
 * briefs: `recommendation` (koki's GSI stub) and `buyClass` (freeze-time
 * output).
 *
 * Assumed signatures once `packages/engine` lands:
 *
 * ```ts
 * export type BuyClass = "full" | "force" | "eco" | "save";
 *
 * export interface EconomyEngine {
 *   recommend(input: EconomyEvaluationInput): {
 *     recommendation: BuyClass; // `buyClass` is also accepted by adaptEconomyEngine
 *     reason: string | { en: string; zh: string };
 *     enemyEconomyBand?: { min: number; max: number };
 *     buyingPower?: number;
 *     options?: BuyOptionEvaluation[];
 *   };
 *   // Required to rank decision leaks when `recommend` omits `options`.
 *   evaluateBuyOptions?(input: EconomyEvaluationInput): BuyOptionEvaluation[];
 * }
 *
 * export interface BuyOptionEvaluation {
 *   buyClass: BuyClass;
 *   expectedValue: number; // horizon EV in the engine's own units; higher is better
 *   reason: string | { en: string; zh: string };
 * }
 * ```
 *
 * Koki's GSI stub (`src/gsi/`) is expected to return only
 * `{ recommendation, reason: string, enemyEconomyBand?: { min, max } }`
 * from a normalized `GameState`. That object adapts, but `reviewMatch`
 * cannot rank leaks until per-class `expectedValue` is present. Map a
 * `GameState` onto `EconomyEvaluationInput` in the GSI package; this
 * module does not parse raw GSI payloads.
 *
 * `EconomyEvaluationInput` is the freeze-time record the review passes
 * through. Zhasi may narrow or rename the engine's real parameter. When
 * that type lands, change `adaptEconomyEngine` — leave the rule math in
 * `packages/engine`.
 */

export const BUY_CLASSES = ["full", "force", "eco", "save"] as const;

export type BuyClass = (typeof BUY_CLASSES)[number];

export interface MoneyBand {
  min: number;
  max: number;
}

export interface BilingualText {
  en: string;
  zh: string;
}

/** Freeze-time facts the player is already entitled to know. */
export interface EconomyEvaluationInput {
  roundNumber: number;
  score: { us: number; them: number };
  /** Exact own-team money from manual entry or the player's own GSI state. */
  ourMoney: number | readonly number[];
  ourLossStreak: number;
  theirLossStreak: number;
  enemyEconomyBand?: MoneyBand;
  /** Optional figure supplied by the user. A public input, not a hidden read. */
  knownEnemyMoney?: number | readonly number[] | null;
  /** Teammates who can carry a weapon into the next round. */
  saveEligibleCount?: number;
}

export interface BuyOptionEvaluation {
  buyClass: BuyClass;
  /** Horizon expected value in the engine's units. The review does not rescale it. */
  expectedValue: number;
  reason: BilingualText;
}

export interface FreezeTimeRecommendation {
  recommendation: BuyClass;
  reason: BilingualText;
  enemyEconomyBand?: MoneyBand;
  buyingPower?: number;
  options?: readonly BuyOptionEvaluation[];
}

export interface EconomyEngine<TState = EconomyEvaluationInput> {
  recommend(input: TState): FreezeTimeRecommendation;
  evaluateBuyOptions?(input: TState): readonly BuyOptionEvaluation[];
}

/**
 * Loose object zhasi or koki can already return. Canonical fields win;
 * the listed aliases cover the names in the current briefs.
 */
export interface EconomyEngineLike<TState = EconomyEvaluationInput> {
  recommend?: (input: TState) => unknown;
  evaluateBuyOptions?: (input: TState) => unknown;
}

export function isBuyClass(value: unknown): value is BuyClass {
  return typeof value === "string" && (BUY_CLASSES as readonly string[]).includes(value);
}

export function asBilingual(reason: unknown, where: string): BilingualText {
  if (typeof reason === "string" && reason.trim()) {
    return { en: reason.trim(), zh: reason.trim() };
  }
  if (reason && typeof reason === "object") {
    const record = reason as Record<string, unknown>;
    const en = typeof record.en === "string" ? record.en.trim() : "";
    const zh = typeof record.zh === "string" ? record.zh.trim() : "";
    if (en || zh) {
      return { en: en || zh, zh: zh || en };
    }
  }
  throw new ReviewError("invalid-reason", `${where} is missing a reason string.`);
}

export function asBuyOption(value: unknown, where: string): BuyOptionEvaluation {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", `${where} is not a buy option.`);
  }
  const record = value as Record<string, unknown>;
  const buyClass = record.buyClass;
  if (!isBuyClass(buyClass)) {
    throw new ReviewError(
      "unknown-buy",
      `${where} has buy class ${JSON.stringify(buyClass)}. Expected full, force, eco, or save.`,
    );
  }
  if (typeof record.expectedValue !== "number" || !Number.isFinite(record.expectedValue)) {
    throw new ReviewError(
      "invalid-option",
      `${where} (${buyClass}) needs a finite expectedValue from zhasi's EconomyEngine.`,
    );
  }
  return {
    buyClass,
    expectedValue: record.expectedValue,
    reason: asBilingual(record.reason, `${where} (${buyClass}) reason`),
  };
}

export function asRecommendation(value: unknown): FreezeTimeRecommendation {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", "EconomyEngine.recommend returned an empty result.");
  }
  const record = value as Record<string, unknown>;
  const named = record.recommendation ?? record.buyClass;
  if (!isBuyClass(named)) {
    throw new ReviewError(
      "unknown-buy",
      `EconomyEngine recommendation ${JSON.stringify(named)} is outside full, force, eco, save.`,
    );
  }
  const band = asMoneyBand(record.enemyEconomyBand);
  const buyingPower =
    typeof record.buyingPower === "number" && Number.isFinite(record.buyingPower)
      ? record.buyingPower
      : undefined;
  const options = record.options === undefined ? undefined : asOptionList(record.options, "recommend.options");
  return {
    recommendation: named,
    reason: asBilingual(record.reason, "recommendation reason"),
    enemyEconomyBand: band,
    buyingPower,
    options,
  };
}

export function adaptEconomyEngine<TState = EconomyEvaluationInput>(
  impl: EconomyEngineLike<TState>,
): EconomyEngine<TState> {
  const engine: EconomyEngine<TState> = {
    recommend(input) {
      if (!impl.recommend) {
        throw new ReviewError(
          "missing-ev",
          "Zhasi's EconomyEngine has no recommend(). Wire packages/engine before ranking leaks.",
        );
      }
      return asRecommendation(impl.recommend(input));
    },
  };
  if (impl.evaluateBuyOptions) {
    const evaluate = impl.evaluateBuyOptions;
    engine.evaluateBuyOptions = (input) => asOptionList(evaluate(input), "evaluateBuyOptions");
  }
  return engine;
}

function asMoneyBand(value: unknown): MoneyBand | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", "enemyEconomyBand must be { min, max }.");
  }
  const record = value as Record<string, unknown>;
  const min = record.min;
  const max = record.max;
  if (typeof min !== "number" || typeof max !== "number" || !Number.isFinite(min) || !Number.isFinite(max)) {
    throw new ReviewError(
      "invalid-option",
      "enemyEconomyBand uses { min, max } numbers, matching koki's GSI stub.",
    );
  }
  return { min, max };
}

export function asOptionList(value: unknown, where: string): BuyOptionEvaluation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ReviewError("empty-options", `${where} must list at least one buy class.`);
  }
  const options = value.map((entry, index) => asBuyOption(entry, `${where}[${index}]`));
  const seen = new Set<BuyClass>();
  for (const option of options) {
    if (seen.has(option.buyClass)) {
      throw new ReviewError("duplicate-buy", `${where} lists ${option.buyClass} more than once.`);
    }
    seen.add(option.buyClass);
  }
  return options;
}
