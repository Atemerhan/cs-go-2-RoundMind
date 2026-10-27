import {
  CASH_FLOOR,
  CT_KILL_TEAM_AWARD,
  DEFUSE_PLAYER_AWARD,
  HALF_START_LOSS_COUNT,
  KILL_REWARDS,
  LOSS_BONUS_BASE,
  LOSS_BONUS_STEP,
  LOSS_COUNT_STORAGE_CAPPED,
  LOSS_PAYOUT_CAP,
  MAX_MONEY,
  OVERTIME_LIMIT_PREMIER,
  OVERTIME_ROUNDS_PER_HALF,
  OVERTIME_START_MONEY,
  OVERTIME_WINS_TO_CLOSE,
  PLANT_PLAYER_AWARD,
  PLANT_TEAM_AWARD,
  POLICY,
  REGULATION_ROUNDS_PER_HALF,
  REGULATION_WIN_TARGET,
  START_MONEY,
  TEAM_SIZE,
  WIN_BOMB_DEFUSE,
  WIN_BOMB_EXPLODE,
  WIN_ELIMINATION,
  WIN_TIME,
  type WeaponId,
} from "./rules.js";
import type {
  CompletedRound,
  KillTally,
  RoundContext,
  RoundEndReason,
  Score,
  Side,
} from "./types.js";

export function teamSize(): number {
  return TEAM_SIZE.value;
}

export function clampCash(cash: number): number {
  if (!Number.isFinite(cash)) return CASH_FLOOR.value;
  return Math.min(MAX_MONEY.value, Math.max(CASH_FLOOR.value, Math.trunc(cash)));
}

/** Loss bonus paid for a loss when `lossCount` is the count entering the round. */
export function lossBonusForCount(lossCount: number): number {
  const stored = Math.max(0, Math.trunc(lossCount));
  const tier = Math.min(LOSS_PAYOUT_CAP.value, stored);
  return LOSS_BONUS_BASE.value + tier * LOSS_BONUS_STEP.value;
}

/**
 * Win: count = max(0, count - 1). Loss: count += 1.
 * The payout cap is applied in `lossBonusForCount`, not here, unless
 * `LOSS_COUNT_STORAGE_CAPPED` is turned on.
 */
export function nextLossCount(lossCount: number, won: boolean): number {
  const current = Math.max(0, Math.trunc(lossCount));
  if (won) return Math.max(0, current - 1);
  const next = current + 1;
  return LOSS_COUNT_STORAGE_CAPPED.value ? Math.min(LOSS_PAYOUT_CAP.value, next) : next;
}

export function killReward(weapon: WeaponId): number {
  return KILL_REWARDS[weapon].value;
}

export function sumKillReward(kills: readonly KillTally[]): number {
  return kills.reduce((total, tally) => {
    const count = Math.max(0, Math.trunc(tally.count));
    return total + killReward(tally.weapon) * count;
  }, 0);
}

export function winReward(reason: RoundEndReason): number {
  switch (reason) {
    case "elimination":
      return WIN_ELIMINATION.value;
    case "time":
      return WIN_TIME.value;
    case "bomb_explode":
      return WIN_BOMB_EXPLODE.value;
    case "bomb_defuse":
      return WIN_BOMB_DEFUSE.value;
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

export function opposite(side: Side): Side {
  return side === "T" ? "CT" : "T";
}

export function roundContext(roundNumber: number): RoundContext {
  const round = Math.max(1, Math.trunc(roundNumber));
  const regulationRounds = REGULATION_ROUNDS_PER_HALF.value * 2;
  if (round <= regulationRounds) {
    const half: 1 | 2 = round <= REGULATION_ROUNDS_PER_HALF.value ? 1 : 2;
    const pistol =
      round === 1 || round === REGULATION_ROUNDS_PER_HALF.value + 1;
    return {
      roundNumber: round,
      phase: "regulation",
      half,
      overtimePeriod: null,
      pistol,
      economyReset: pistol,
      resetCash: START_MONEY.value,
    };
  }

  const overtimeRound = round - regulationRounds;
  const periodLength = OVERTIME_ROUNDS_PER_HALF.value * 2;
  const overtimePeriod = Math.floor((overtimeRound - 1) / periodLength) + 1;
  const indexInPeriod = (overtimeRound - 1) % periodLength;
  const half: 1 | 2 = indexInPeriod < OVERTIME_ROUNDS_PER_HALF.value ? 1 : 2;
  const economyReset =
    indexInPeriod === 0 || indexInPeriod === OVERTIME_ROUNDS_PER_HALF.value;
  return {
    roundNumber: round,
    phase: "overtime",
    half,
    overtimePeriod,
    pistol: false,
    economyReset,
    resetCash: OVERTIME_START_MONEY.value,
  };
}

export function isPistolRound(roundNumber: number): boolean {
  return roundContext(roundNumber).pistol;
}

export function isEconomyResetRound(roundNumber: number): boolean {
  return roundContext(roundNumber).economyReset;
}

/**
 * A match is live when neither side has clinched.
 * Regulation: first to 13. Overtime: first to 4 wins inside the current
 * six-round period. A 3–3 period stays live and starts another period.
 */
export type MatchState = "live" | "regulation_win" | "overtime_win" | "draw";

/**
 * Premier (`overtimeLimit` 1) draws at 15–15. Major (`0`) plays another block.
 */
export function matchState(score: Score, overtimeLimit: 0 | 1 = OVERTIME_LIMIT_PREMIER.value as 0 | 1): MatchState {
  if (score.T >= REGULATION_WIN_TARGET.value && score.CT <= REGULATION_ROUNDS_PER_HALF.value - 1) {
    return "regulation_win";
  }
  if (score.CT >= REGULATION_WIN_TARGET.value && score.T <= REGULATION_ROUNDS_PER_HALF.value - 1) {
    return "regulation_win";
  }

  const total = score.T + score.CT;
  const regulationRounds = REGULATION_ROUNDS_PER_HALF.value * 2;
  if (total < regulationRounds) return "live";

  const otRounds = total - regulationRounds;
  if (otRounds === 0) return "live";

  const periodLength = OVERTIME_ROUNDS_PER_HALF.value * 2;
  const completedPeriods = Math.floor(otRounds / periodLength);
  const roundsIntoPeriod = otRounds % periodLength;
  if (roundsIntoPeriod === 0 && completedPeriods > 0) {
    if (overtimeLimit !== 0 && completedPeriods >= overtimeLimit) return "draw";
    return "live";
  }

  const base = REGULATION_ROUNDS_PER_HALF.value + completedPeriods * OVERTIME_ROUNDS_PER_HALF.value;
  if (score.T - base >= OVERTIME_WINS_TO_CLOSE.value || score.CT - base >= OVERTIME_WINS_TO_CLOSE.value) {
    return "overtime_win";
  }
  return "live";
}

export function isMatchLive(score: Score, overtimeLimit: 0 | 1 = OVERTIME_LIMIT_PREMIER.value as 0 | 1): boolean {
  return matchState(score, overtimeLimit) === "live";
}

export function scoreFromHistory(history: readonly CompletedRound[]): Score {
  const score: Score = { T: 0, CT: 0 };
  for (const round of history) score[round.winner] += 1;
  return score;
}

export function freshLossCount(): number {
  return HALF_START_LOSS_COUNT.value;
}

export function freshCash(): number {
  return START_MONEY.value;
}

export interface NormalizedRound {
  winner: Side;
  reason: RoundEndReason;
  bombPlanted: boolean;
  alive?: Partial<Record<Side, number>>;
  /** null when that side's kill rewards are unknown. */
  killReward: Record<Side, number | null>;
  teamKills: Record<Side, number>;
  warnings: Array<"alive_clamped" | "time_plant_ignored">;
}

function clampAlive(value: number | undefined, warnings: NormalizedRound["warnings"]): number | undefined {
  if (value === undefined) return undefined;
  const truncated = Math.trunc(value);
  if (truncated !== value || truncated < 0 || truncated > TEAM_SIZE.value) {
    warnings.push("alive_clamped");
  }
  return Math.min(TEAM_SIZE.value, Math.max(0, truncated));
}

export function normalizeRound(round: CompletedRound): NormalizedRound {
  const warnings: NormalizedRound["warnings"] = [];
  let reason = round.reason;
  let bombPlanted =
    round.bombPlanted === true ||
    reason === "bomb_explode" ||
    reason === "bomb_defuse";
  if (reason === "time" && bombPlanted) {
    bombPlanted = false;
    warnings.push("time_plant_ignored");
  }
  if (reason === "bomb_explode" || reason === "bomb_defuse") bombPlanted = true;

  const alive: Partial<Record<Side, number>> = {};
  const aliveT = clampAlive(round.alive?.T, warnings);
  const aliveCT = clampAlive(round.alive?.CT, warnings);
  if (aliveT !== undefined) alive.T = aliveT;
  if (aliveCT !== undefined) alive.CT = aliveCT;

  return {
    winner: round.winner,
    reason,
    bombPlanted,
    alive: alive.T !== undefined || alive.CT !== undefined ? alive : undefined,
    killReward: {
      T: knownKillReward(round, "T"),
      CT: knownKillReward(round, "CT"),
    },
    teamKills: {
      T: Math.max(0, Math.trunc(round.teamKills?.T ?? 0)),
      CT: Math.max(0, Math.trunc(round.teamKills?.CT ?? 0)),
    },
    warnings,
  };
}

function knownKillReward(round: CompletedRound, side: Side): number | null {
  const direct = round.killRewardTotal?.[side];
  if (direct !== undefined) return Math.max(0, Math.trunc(direct));
  const tallies = round.kills?.[side];
  if (tallies) return sumKillReward(tallies);
  return null;
}

export function fullBuyCash(side: Side): number {
  return side === "T" ? POLICY.tFullCash.value : POLICY.ctFullCash.value;
}

export function forceBuyCash(side: Side): number {
  return side === "T" ? POLICY.tForceCash.value : POLICY.ctForceCash.value;
}

export function utilityBuyCash(side: Side): number {
  return side === "T" ? POLICY.tFullUtility.value : POLICY.ctFullUtility.value;
}

export function spendAmount(
  cash: number,
  scenario: "low" | "high",
  pistol: boolean,
  side: Side,
): number {
  if (pistol) {
    const cap = scenario === "low" ? POLICY.pistolSpendLow.value : POLICY.pistolSpendHigh.value;
    return Math.min(cash, cap);
  }
  if (cash >= fullBuyCash(side)) {
    const cap =
      side === "T"
        ? scenario === "low"
          ? POLICY.tFullSpendLow.value
          : POLICY.tFullSpendHigh.value
        : scenario === "low"
          ? POLICY.ctFullSpendLow.value
          : POLICY.ctFullSpendHigh.value;
    return Math.min(cash, cap);
  }
  if (cash >= forceBuyCash(side)) {
    const cap =
      side === "T"
        ? scenario === "low"
          ? POLICY.tForceSpendLow.value
          : POLICY.tForceSpendHigh.value
        : scenario === "low"
          ? POLICY.ctForceSpendLow.value
          : POLICY.ctForceSpendHigh.value;
    return Math.min(cash, cap);
  }
  const cap = scenario === "low" ? POLICY.ecoSpendLow.value : POLICY.ecoSpendHigh.value;
  return Math.min(cash, cap);
}

/**
 * Per-player round-end income for one scenario, before the cash cap.
 * Index 0 absorbs one-player awards (plant, defuse) and team-kill penalties
 * are applied separately.
 */
export function incomeByPlayer(input: {
  side: Side;
  round: NormalizedRound;
  lossCountEntering: number;
  scenario: "low" | "high";
}): number[] {
  const size = TEAM_SIZE.value;
  const income = Array.from({ length: size }, () => 0);
  const { side, round, scenario } = input;
  const won = round.winner === side;

  if (won) {
    const reward = winReward(round.reason);
    for (let i = 0; i < size; i += 1) income[i] = reward;
  } else if (side === "T" && round.reason === "time" && !round.bombPlanted) {
    // The +$0 timeout line is verified. Who it hits is not.
    // Low path: living Ts get $0 (community reading). High path: full loss bonus.
    const alive = round.alive?.T;
    const bonus = lossBonusForCount(input.lossCountEntering);
    if (scenario === "high") {
      for (let i = 0; i < size; i += 1) income[i] = bonus;
    } else if (alive === undefined) {
      for (let i = 0; i < size; i += 1) income[i] = 0;
    } else {
      const dead = size - alive;
      for (let i = 0; i < dead; i += 1) income[i] = bonus;
    }
  } else {
    const bonus = lossBonusForCount(input.lossCountEntering);
    for (let i = 0; i < size; i += 1) income[i] = bonus;
    if (side === "T" && round.bombPlanted && round.reason === "bomb_defuse") {
      for (let i = 0; i < size; i += 1) income[i] += PLANT_TEAM_AWARD.value;
    }
  }

  if (side === "T" && round.bombPlanted) income[0] += PLANT_PLAYER_AWARD.value;
  if (side === "CT" && round.reason === "bomb_defuse") income[0] += DEFUSE_PLAYER_AWARD.value;

  if (side === "CT") {
    const dead = deadTerrorists(round, scenario);
    for (let i = 0; i < size; i += 1) income[i] += CT_KILL_TEAM_AWARD.value * dead;
  }

  const kills = round.killReward[side];
  if (kills === null) {
    if (scenario === "high") {
      for (let i = 0; i < size; i += 1) income[i] += POLICY.unknownKillReward.value;
    }
  } else {
    let remaining = kills;
    let index = 0;
    while (remaining > 0) {
      income[index % size] += 1;
      remaining -= 1;
      index += 1;
    }
  }

  return income;
}

function deadTerrorists(round: NormalizedRound, scenario: "low" | "high"): number {
  if (round.alive?.T !== undefined) return TEAM_SIZE.value - round.alive.T;
  if (round.winner === "CT" && round.reason === "elimination") return TEAM_SIZE.value;
  if (round.reason === "time") return scenario === "low" ? 0 : TEAM_SIZE.value - 1;
  if (round.winner === "T" && round.reason === "elimination") {
    return scenario === "low" ? 0 : TEAM_SIZE.value - 1;
  }
  return scenario === "low" ? 0 : TEAM_SIZE.value;
}

export function emptyPlayers(cash: number): number[] {
  return Array.from({ length: TEAM_SIZE.value }, () => cash);
}

export function sumPlayers(players: readonly number[]): number {
  return players.reduce((total, cash) => total + cash, 0);
}
