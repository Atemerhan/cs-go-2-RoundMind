import {
  KILL_REWARDS,
  LOSS_BONUS_STEP,
  type BuyClass,
  type CompletedRound,
  type FreezeSnapshot,
  type PlayerSnapshot,
  type RoundEndReason,
  type Side,
  type WeaponId,
} from "@roundmind/engine";
import { ReviewError } from "./errors.js";

export type { BuyClass, CompletedRound, FreezeSnapshot, KillTally, PlayerSnapshot, RoundEndReason, Side } from "@roundmind/engine";

/**
 * Consumer view of zhasi's `@roundmind/engine` (`packages/engine`, PR #3).
 *
 * The public call is `evaluateFreeze(snapshot)`, not `recommend` /
 * `evaluateBuyOptions`. This file does not copy the rule math.
 *
 * ```ts
 * evaluateFreeze({
 *   roundNumber,     // 1-based round about to be played
 *   ourSide,         // "T" | "CT"
 *   overtimeLimit,   // 1 Premier, 0 repeated OT
 *   ourPlayers,      // { cash, hasPrimary }[]
 *   history,         // completed rounds, oldest first
 * })
 * ```
 *
 * Enemy cash is not an input. `enemy.band` is derived from `history`.
 * Round end `reason` is `elimination | bomb_explode | bomb_defuse | time`.
 * Koki's GSI feed emits the same shape: `roundNumber`, `ourSide`,
 * `ourPlayers`, `history`.
 *
 * `evaluateFreeze` is the one freeze-time recommendation. `evaluateBuyOptions`
 * scores every class on the same snapshot. `expectedValue` is a relative
 * policy score in loss-bonus steps: 1 point = $500 (`LOSS_BONUS_STEP`),
 * not estimated round-win dollars.
 *
 * zhasi's regret is `chosen.expectedValue - best.expectedValue` (0 when the
 * team matched, otherwise negative). This review ranks by the positive cost
 * `best.expectedValue - chosen.expectedValue`, which is the negation of that
 * regret. A larger cost is a larger leak.
 */

export const BUY_CLASSES = ["full", "force", "eco", "save"] as const;

export const ROUND_END_REASONS = ["elimination", "bomb_explode", "bomb_defuse", "time"] as const;

export const REASON_CODES = [
  "pistol_full",
  "overtime_full",
  "full_buy",
  "eco_bank",
  "force_punish",
  "force_default",
  "save_hold",
  "match_over",
  "match_draw",
  "empty_roster",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * Why `reviewMatch` still needs a logged option table.
 * `evaluateFreeze` does not currently expose per-buy expected value.
 */
/** Dollars represented by one `expectedValue` point. Not a win-rate dollar. */
export const EV_POINT_DOLLARS = LOSS_BONUS_STEP.value;

export const PER_OPTION_EV_GAP =
  "evaluateBuyOptions is required to rank leaks. evaluateFreeze returns one buy and does not score the other classes.";

/** Fields koki emits. Same object `evaluateFreeze` accepts. */
export type GsiFreezeHandoff = Pick<FreezeSnapshot, "roundNumber" | "ourSide" | "ourPlayers" | "history">;

export interface CashBand {
  minPerPlayer: number;
  maxPerPlayer: number;
  minTeam: number;
  maxTeam: number;
  averageLow: number;
  averageHigh: number;
}

export interface BilingualText {
  en: string;
  zh: string;
}

/** Wire shape of `evaluateBuyOptions`: `{ buy, expectedValue }`. */
export interface EngineBuyOption {
  buy: BuyClass;
  expectedValue: number;
  reason?: BilingualText | string;
}

/**
 * Normalized `BuyOption` from `evaluateBuyOptions`.
 * The engine field is `buy`. `buyClass` is the same value after mapping.
 */
export interface BuyOptionEvaluation {
  buy: BuyClass;
  buyClass: BuyClass;
  /**
   * Loss-bonus steps. 1 point = $500. Higher is better.
   * Not estimated round-win dollars.
   */
  expectedValue: number;
  reason: BilingualText;
}

export interface FreezeTimeRecommendation {
  recommendation: BuyClass;
  /** `reason.code` from `evaluateFreeze`, when the line came from that call. */
  reasonCode?: string;
  /** Code echoed in both languages. The engine does not return a sentence. */
  reason: BilingualText;
  lossBonus?: number;
  enemyBand?: CashBand;
  ourAverageCash?: number;
  /**
   * Present only when a caller supplied an option table.
   * `evaluateFreeze` leaves this unset.
   */
  options?: readonly BuyOptionEvaluation[];
}

export interface EconomyEngine<TState = FreezeSnapshot> {
  recommend(input: TState): FreezeTimeRecommendation;
  /**
   * Optional for callers who supply a logged option table with each round.
   */
  evaluateBuyOptions?(input: TState): readonly BuyOptionEvaluation[];
}

export interface EconomyEngineLike<TState = FreezeSnapshot> {
  evaluateFreeze?: (input: TState) => unknown;
  evaluateBuyOptions?: (input: TState) => unknown;
}

const ENEMY_CASH_KEYS = ["knownEnemyMoney", "enemyEconomyBand", "enemyCash", "enemyPlayers", "theirMoney", "enemy"] as const;

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
    if (typeof record.code === "string" && record.code.trim()) {
      const code = record.code.trim();
      return { en: code, zh: code };
    }
  }
  throw new ReviewError("invalid-reason", `${where} is missing a reason string.`);
}

export function asBuyOption(value: unknown, where: string): BuyOptionEvaluation {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", `${where} is not a buy option.`);
  }
  const record = value as Record<string, unknown>;
  const named = record.buy ?? record.buyClass;
  if (!isBuyClass(named)) {
    throw new ReviewError(
      "unknown-buy",
      `${where} has buy ${JSON.stringify(named)}. Expected full, force, eco, or save.`,
    );
  }
  if (typeof record.expectedValue !== "number" || !Number.isFinite(record.expectedValue)) {
    throw new ReviewError(
      "invalid-option",
      `${where} (${named}) needs a finite expectedValue from evaluateBuyOptions.`,
    );
  }
  const reason = readableReason(record.reason)
    ? asBilingual(record.reason, `${where} (${named}) reason`)
    : { en: "", zh: "" };
  return {
    buy: named,
    buyClass: named,
    expectedValue: record.expectedValue,
    reason,
  };
}

/**
 * Copy the freeze-time fields `evaluateFreeze` accepts.
 * Enemy cash keys are rejected. They are not part of the call.
 */
export function toFreezeSnapshot(value: unknown): FreezeSnapshot {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", "evaluateFreeze expects a freeze snapshot.");
  }
  const record = value as Record<string, unknown>;
  for (const key of ENEMY_CASH_KEYS) {
    if (key in record && record[key] !== undefined) {
      throw new ReviewError(
        "enemy-cash",
        `evaluateFreeze does not take ${key}. enemy.band is derived from history.`,
      );
    }
  }
  if ("ourMoney" in record) {
    throw new ReviewError(
      "invalid-option",
      "Pass ourPlayers[].cash. evaluateFreeze does not take ourMoney.",
    );
  }
  if (!Number.isInteger(record.roundNumber) || (record.roundNumber as number) < 1) {
    throw new ReviewError("invalid-round", "roundNumber must be a positive integer.");
  }
  if (record.ourSide !== "T" && record.ourSide !== "CT") {
    throw new ReviewError("invalid-option", 'ourSide must be "T" or "CT".');
  }
  if (!Array.isArray(record.ourPlayers)) {
    throw new ReviewError("invalid-option", "ourPlayers must be the roster GSI can see.");
  }
  if (!Array.isArray(record.history)) {
    throw new ReviewError("invalid-option", "history must be the completed public rounds, oldest first.");
  }

  const snapshot: FreezeSnapshot = {
    roundNumber: record.roundNumber as number,
    ourSide: record.ourSide,
    ourPlayers: record.ourPlayers.map((player, index) => asPlayer(player, index)),
    history: record.history.map((round, index) => asCompletedRound(round, index)),
  };
  if (record.overtimeLimit !== undefined) {
    if (record.overtimeLimit !== 0 && record.overtimeLimit !== 1) {
      throw new ReviewError("invalid-option", "overtimeLimit must be 0 or 1.");
    }
    snapshot.overtimeLimit = record.overtimeLimit;
  }
  if (record.score !== undefined) snapshot.score = asScore(record.score);
  if (record.lossCount !== undefined) snapshot.lossCount = asLossCount(record.lossCount);
  return snapshot;
}

export function adaptEconomyEngine(
  impl: EconomyEngineLike<FreezeSnapshot>,
): EconomyEngine<FreezeSnapshot> {
  const engine: EconomyEngine<FreezeSnapshot> = {
    recommend(input) {
      if (!impl.evaluateFreeze) {
        throw new ReviewError(
          "missing-ev",
          "Wire zhasi's evaluateFreeze from @roundmind/engine. The review does not call recommend().",
        );
      }
      const snapshot = toFreezeSnapshot(input);
      return adviceToRecommendation(impl.evaluateFreeze(snapshot));
    },
  };
  if (impl.evaluateBuyOptions) {
    const evaluate = impl.evaluateBuyOptions;
    engine.evaluateBuyOptions = (input) =>
      asOptionList(evaluate(toFreezeSnapshot(input)), "evaluateBuyOptions");
  }
  return engine;
}

export function adviceToRecommendation(value: unknown): FreezeTimeRecommendation {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", "evaluateFreeze returned an empty result.");
  }
  const record = value as Record<string, unknown>;
  const named = record.buy ?? record.recommendation ?? record.buyClass;
  if (named === null) {
    const code = reasonCode(record.reason);
    throw new ReviewError(
      "invalid-option",
      `evaluateFreeze returned buy null (${code ?? "no reason code"}). There is no line to compare.`,
    );
  }
  if (!isBuyClass(named)) {
    throw new ReviewError(
      "unknown-buy",
      `evaluateFreeze buy ${JSON.stringify(named)} is outside full, force, eco, save.`,
    );
  }
  const parsed = parseReason(record.reason);
  const our = record.our && typeof record.our === "object" ? (record.our as Record<string, unknown>) : undefined;
  const enemy = record.enemy && typeof record.enemy === "object" ? (record.enemy as Record<string, unknown>) : undefined;
  return {
    recommendation: named,
    reasonCode: parsed.code,
    reason: { en: parsed.code, zh: parsed.code },
    lossBonus: parsed.lossBonus ?? finiteNumber(our?.lossBonusIfLose),
    enemyBand: enemy ? asCashBand(enemy.band) : undefined,
    ourAverageCash: finiteNumber(our?.averageCash),
  };
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

function asPlayer(value: unknown, index: number): PlayerSnapshot {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", `ourPlayers[${index}] is missing.`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.cash !== "number" || !Number.isFinite(record.cash)) {
    throw new ReviewError("invalid-option", `ourPlayers[${index}].cash must be a finite number.`);
  }
  if (typeof record.hasPrimary !== "boolean") {
    throw new ReviewError("invalid-option", `ourPlayers[${index}].hasPrimary must be a boolean.`);
  }
  const player: PlayerSnapshot = { cash: record.cash, hasPrimary: record.hasPrimary };
  if (typeof record.id === "string" && record.id) player.id = record.id;
  if (typeof record.equipmentValue === "number" && Number.isFinite(record.equipmentValue)) {
    player.equipmentValue = record.equipmentValue;
  }
  return player;
}

function asCompletedRound(value: unknown, index: number): CompletedRound {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", `history[${index}] is missing.`);
  }
  const record = value as Record<string, unknown>;
  if (record.winner !== "T" && record.winner !== "CT") {
    throw new ReviewError("invalid-option", `history[${index}].winner must be "T" or "CT".`);
  }
  if (!isRoundEndReason(record.reason)) {
    throw new ReviewError(
      "invalid-reason",
      `history[${index}].reason must be elimination, bomb_explode, bomb_defuse, or time.`,
    );
  }
  const round: CompletedRound = { winner: record.winner, reason: record.reason };
  if (typeof record.bombPlanted === "boolean") round.bombPlanted = record.bombPlanted;
  if (record.alive !== undefined) round.alive = asSideNumbers(record.alive, `history[${index}].alive`);
  if (record.killRewardTotal !== undefined) {
    round.killRewardTotal = asSideNumbers(record.killRewardTotal, `history[${index}].killRewardTotal`);
  }
  if (record.teamKills !== undefined) {
    round.teamKills = asSideNumbers(record.teamKills, `history[${index}].teamKills`);
  }
  if (record.kills !== undefined) round.kills = asKills(record.kills, index);
  return round;
}

function asKills(value: unknown, index: number): CompletedRound["kills"] {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", `history[${index}].kills must be per-side tallies.`);
  }
  const record = value as Record<string, unknown>;
  const kills: NonNullable<CompletedRound["kills"]> = {};
  for (const side of ["T", "CT"] as const) {
    if (record[side] === undefined) continue;
    if (!Array.isArray(record[side])) {
      throw new ReviewError("invalid-option", `history[${index}].kills.${side} must be a list.`);
    }
    kills[side] = (record[side] as unknown[]).map((entry, tallyIndex) => {
      if (!entry || typeof entry !== "object") {
        throw new ReviewError("invalid-option", `history[${index}].kills.${side}[${tallyIndex}] is missing.`);
      }
      const tally = entry as Record<string, unknown>;
      if (typeof tally.weapon !== "string" || !Object.hasOwn(KILL_REWARDS, tally.weapon)) {
        throw new ReviewError("invalid-option", `history[${index}] kill tally needs a supported weapon id.`);
      }
      if (typeof tally.count !== "number" || !Number.isFinite(tally.count)) {
        throw new ReviewError("invalid-option", `history[${index}] kill tally needs a count.`);
      }
      return { weapon: tally.weapon as WeaponId, count: tally.count };
    });
  }
  return kills;
}

function asSideNumbers(value: unknown, where: string): Partial<Record<Side, number>> {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", `${where} must be side counts.`);
  }
  const record = value as Record<string, unknown>;
  const counts: Partial<Record<Side, number>> = {};
  for (const side of ["T", "CT"] as const) {
    if (record[side] === undefined) continue;
    if (typeof record[side] !== "number" || !Number.isFinite(record[side] as number)) {
      throw new ReviewError("invalid-option", `${where}.${side} must be a number.`);
    }
    counts[side] = record[side] as number;
  }
  return counts;
}

function asScore(value: unknown): { T: number; CT: number } {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", "score must be { T, CT }.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.T !== "number" || typeof record.CT !== "number") {
    throw new ReviewError("invalid-option", "score must be { T, CT } numbers.");
  }
  return { T: record.T, CT: record.CT };
}

function asLossCount(value: unknown): Partial<Record<Side, number>> {
  return asSideNumbers(value, "lossCount");
}

function asCashBand(value: unknown): CashBand | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-option", "enemy.band must be the cash band from evaluateFreeze.");
  }
  const record = value as Record<string, unknown>;
  const keys = ["minPerPlayer", "maxPerPlayer", "minTeam", "maxTeam", "averageLow", "averageHigh"] as const;
  const band = {} as CashBand;
  for (const key of keys) {
    if (typeof record[key] !== "number" || !Number.isFinite(record[key])) {
      throw new ReviewError("invalid-option", `enemy.band.${key} must be a finite number.`);
    }
    band[key] = record[key] as number;
  }
  return band;
}

function parseReason(value: unknown): { code: string; lossBonus?: number } {
  if (!value || typeof value !== "object") {
    throw new ReviewError("invalid-reason", "evaluateFreeze reason must include code.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || !record.code.trim()) {
    throw new ReviewError("invalid-reason", "evaluateFreeze reason.code is missing.");
  }
  return { code: record.code.trim(), lossBonus: finiteNumber(record.lossBonus) };
}

function reasonCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function readableReason(reason: unknown): boolean {
  if (typeof reason === "string") return reason.trim().length > 0;
  if (!reason || typeof reason !== "object") return false;
  const record = reason as Record<string, unknown>;
  return [record.en, record.zh, record.code].some((part) => typeof part === "string" && part.trim().length > 0);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRoundEndReason(value: unknown): value is RoundEndReason {
  return typeof value === "string" && (ROUND_END_REASONS as readonly string[]).includes(value);
}
