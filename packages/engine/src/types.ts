import type { WeaponId } from "./rules.js";

/** Bomb-defusal competitive / Premier side. */
export type Side = "T" | "CT";

/**
 * How a bomb-defusal round ended.
 * Hostage maps are not modeled.
 */
export type RoundEndReason =
  | "elimination"
  | "bomb_explode"
  | "bomb_defuse"
  | "time";

export type BuyClass = "full" | "force" | "eco" | "save";

export interface Score {
  T: number;
  CT: number;
}

export interface KillTally {
  weapon: WeaponId;
  /** Team-wide kills with this weapon during the round. */
  count: number;
}

/**
 * One completed bomb-defusal round. Public information only.
 * A future official GSI adapter fills this from the round log it stores.
 * Do not put enemy positions, view angles, or memory-read fields here.
 */
export interface CompletedRound {
  winner: Side;
  reason: RoundEndReason;
  /** Ignored when `reason` already implies a plant (explode / defuse). */
  bombPlanted?: boolean;
  /**
   * Players alive on each side when the round ended.
   * Omit a side when the count is unknown. The T time-loss save rule
   * needs `alive.T` to collapse the enemy cash band.
   */
  alive?: Partial<Record<Side, number>>;
  /** Per-weapon kill totals. Omit the side when kills are unknown. */
  kills?: Partial<Record<Side, KillTally[]>>;
  /**
   * Pre-summed kill-reward dollars for a side.
   * When set, replaces `kills` for that side.
   */
  killRewardTotal?: Partial<Record<Side, number>>;
  /** Team-kill events committed by that side. Each costs the killer. */
  teamKills?: Partial<Record<Side, number>>;
}

/** One of our players at freeze time. Own-team cash is visible to GSI. */
export interface PlayerSnapshot {
  /** Stable id from a future GSI adapter (for example a Steam id). */
  id?: string;
  /** Cash the player is holding right now, before this freeze's purchases. */
  cash: number;
  /** Already holding a primary worth saving (rifle, SMG, shotgun, or sniper). */
  hasPrimary: boolean;
  /** Equipment value in dollars, when the adapter knows it. Not required. */
  equipmentValue?: number;
}

/**
 * Freeze-time input. This is the contract a later official GSI ingest
 * should produce. The engine does not open a socket and does not read
 * the game process.
 */
export interface FreezeSnapshot {
  /** 1-based round that is about to be played. */
  roundNumber: number;
  ourSide: Side;
  /** 1 to 5 players. Cash is ours; enemy cash is never an input. */
  ourPlayers: PlayerSnapshot[];
  /** Completed rounds, oldest first. May be shorter than `roundNumber - 1`. */
  history: CompletedRound[];
  /**
   * Optional GSI score. When omitted, the score is the win counts in
   * `history`. When both exist and disagree, match status uses this score
   * and a warning is returned. Money still follows `history`.
   */
  score?: Score;
  /** Optional override when the adapter already tracked the loss counter. */
  lossCount?: Partial<Record<Side, number>>;
  /**
   * `1` (default) is Premier: one overtime block, then a 15–15 draw.
   * `0` repeats overtime until a team wins four rounds in a block (Major).
   */
  overtimeLimit?: 0 | 1;
}

export type WarningCode =
  | "missing_history"
  | "history_ignored"
  | "cash_clamped"
  | "score_mismatch"
  | "alive_clamped"
  | "empty_roster"
  | "non_integer_cash"
  | "overtime_loss_count_unverified"
  | "ot_cash_differs_from_reset"
  | "half_cash_differs_from_reset";

export type Assumption =
  | "buy_spend_model"
  | "unknown_kills"
  | "unknown_survivors"
  | "ct_kill_award_span"
  | "even_team"
  | "unverified_timeout_income"
  | "our_cash_from_input";

export type RoundPhase = "regulation" | "overtime";

export interface RoundContext {
  roundNumber: number;
  phase: RoundPhase;
  /** Regulation half, or which half inside the current overtime period. */
  half: 1 | 2;
  /** 1-based overtime period. `null` in regulation. */
  overtimePeriod: number | null;
  /** Round 1 and round 13. Overtime resets are not pistol rounds. */
  pistol: boolean;
  /** Money and the loss counter reset at the start of this round. */
  economyReset: boolean;
  /** Dollars each player is set to when `economyReset` is true. */
  resetCash: number;
}

export interface CashBand {
  /** Poorest plausible player on the poor path. */
  minPerPlayer: number;
  /** Richest plausible player on the rich path. */
  maxPerPlayer: number;
  minTeam: number;
  maxTeam: number;
  /** Even-split team average on each path. Buy reads use these. */
  averageLow: number;
  averageHigh: number;
}

export type ReadConfidence = "low" | "medium" | "high";

export interface EnemyRead {
  side: Side;
  lossCount: number;
  /** Loss bonus they receive if they lose this round. */
  lossBonusIfLose: number;
  band: CashBand;
  /** Buy class each edge of the band can afford. */
  poorerBuy: BuyClass;
  richerBuy: BuyClass;
  readConfidence: ReadConfidence;
  assumptions: Assumption[];
}

export type ReasonCode =
  | "pistol_full"
  | "overtime_full"
  | "full_buy"
  | "eco_bank"
  | "force_punish"
  | "force_default"
  | "save_hold"
  | "match_over"
  | "match_draw"
  | "empty_roster";

export interface Reason {
  code: ReasonCode;
  lossBonus: number;
  averageCash: number;
  enemyMin: number;
  enemyMax: number;
  ourLossCount: number;
  enemyLossCount: number;
}

export interface OurEconomy {
  side: Side;
  lossCount: number;
  lossBonusIfLose: number;
  cash: number[];
  averageCash: number;
  minCash: number;
  maxCash: number;
  playersWithPrimary: number;
  /**
   * `unverified` on T: the game has a +$0 timeout line, but who loses
   * round-end income is not confirmed. The buy call does not assume a forfeit.
   * `not_applicable` on CT, because only the clock-loss side is in question.
   */
  timeoutIncome: "unverified" | "not_applicable";
}

export interface FreezeAdvice {
  /** `null` when the match is over or no roster was provided. */
  buy: BuyClass | null;
  reason: Reason;
  our: OurEconomy;
  enemy: EnemyRead;
  round: RoundContext;
  /** False when a team has already clinched regulation or the current overtime. */
  live: boolean;
  score: Score;
  warnings: WarningCode[];
}
