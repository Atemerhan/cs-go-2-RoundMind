import { OVERTIME_LIMIT_PREMIER, OVERTIME_START_MONEY, POLICY, START_MONEY, TEAM_SIZE } from "./rules.js";

const OVERTIME_START_CASH = OVERTIME_START_MONEY.value;
import type {
  BuyClass,
  CompletedRound,
  FreezeAdvice,
  FreezeSnapshot,
  PlayerSnapshot,
  Reason,
  Score,
  Side,
  WarningCode,
} from "./types.js";
import {
  clampCash,
  forceBuyCash,
  fullBuyCash,
  lossBonusForCount,
  matchState,
  opposite,
  roundContext,
  scoreFromHistory,
  utilityBuyCash,
} from "./money.js";
import { buyClassForCash, cashBand, projectEconomy, readConfidence } from "./project.js";

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function cleanPlayers(players: readonly PlayerSnapshot[], warnings: WarningCode[]): PlayerSnapshot[] {
  return players.map((player) => {
    const truncated = Math.trunc(player.cash);
    if (!Number.isFinite(player.cash) || truncated !== player.cash) warnings.push("non_integer_cash");
    const cash = clampCash(player.cash);
    if (cash !== Math.max(0, truncated)) warnings.push("cash_clamped");
    return { ...player, cash };
  });
}

function reason(code: Reason["code"], fields: Omit<Reason, "code">): Reason {
  return { code, ...fields };
}

/**
 * Freeze-time buy call. Own cash comes from the snapshot. Enemy cash is
 * a band projected from the public round list. Nothing here reads memory
 * or sends input.
 */
export function evaluateFreeze(input: FreezeSnapshot): FreezeAdvice {
  const warnings: WarningCode[] = [];
  const overtimeLimit = input.overtimeLimit ?? (OVERTIME_LIMIT_PREMIER.value as 0 | 1);
  const context = roundContext(input.roundNumber);
  const played = Math.max(0, input.roundNumber - 1);
  const history: CompletedRound[] =
    input.history.length > played ? input.history.slice(0, played) : input.history.slice();
  if (input.history.length > played) warnings.push("history_ignored");
  if (history.length < played && !(context.economyReset && context.phase === "regulation" && history.length === 0)) {
    warnings.push("missing_history");
  }

  const projection = projectEconomy(history, input.roundNumber);
  if (projection.warnings.includes("alive_clamped")) warnings.push("alive_clamped");

  const derived = scoreFromHistory(history);
  let score: Score = input.score ?? derived;
  if (input.score && (input.score.T !== derived.T || input.score.CT !== derived.CT) && history.length === played) {
    warnings.push("score_mismatch");
    score = input.score;
  }

  const state = matchState(score, overtimeLimit);
  const enemySide: Side = opposite(input.ourSide);
  const ourLedger = projection[input.ourSide];
  const enemyLedger = projection[enemySide];
  const ourLossCount = input.lossCount?.[input.ourSide] ?? ourLedger.lossCount;
  const enemyLossCount = input.lossCount?.[enemySide] ?? enemyLedger.lossCount;

  if (context.phase === "overtime" && context.economyReset) {
    warnings.push("overtime_loss_count_unverified");
  }

  const roster = cleanPlayers(input.ourPlayers, warnings);
  const cash = roster.map((player) => player.cash);
  const averageCash = average(cash);
  const enemy = cashBand(enemyLedger.low, enemyLedger.high);
  const fields = {
    lossBonus: lossBonusForCount(ourLossCount),
    averageCash,
    enemyMin: enemy.averageLow,
    enemyMax: enemy.averageHigh,
    ourLossCount,
    enemyLossCount,
  };

  if (context.phase === "overtime" && context.economyReset && roster.length > 0) {
    if (roster.some((player) => player.cash !== OVERTIME_START_CASH)) {
      warnings.push("ot_cash_differs_from_reset");
    }
  }
  if (context.pistol && roster.length > 0) {
    if (roster.some((player) => player.cash !== START_MONEY.value)) {
      warnings.push("half_cash_differs_from_reset");
    }
  }

  const assumptions = [...projection.assumptions];
  if (roster.length > 0) assumptions.push("our_cash_from_input");

  let buy: BuyClass | null = null;
  let code: Reason["code"] = "empty_roster";
  if (roster.length === 0) {
    warnings.push("empty_roster");
    code = "empty_roster";
  } else if (state === "draw") {
    code = "match_draw";
  } else if (state !== "live") {
    code = "match_over";
  } else if (context.pistol) {
    buy = "full";
    code = "pistol_full";
  } else if (context.phase === "overtime" && context.economyReset && averageCash >= POLICY.otFullCash.value) {
    buy = "full";
    code = "overtime_full";
  } else {
    const decided = chooseBuy(input.ourSide, roster, averageCash, fields.lossBonus, enemy.averageLow, enemy.averageHigh);
    buy = decided.buy;
    code = decided.code;
  }

  const poorerBuy = context.pistol ? "full" : buyClassForCash(enemy.averageLow, enemySide);
  const richerBuy = context.pistol ? "full" : buyClassForCash(enemy.averageHigh, enemySide);
  const confidence = context.pistol ? "high" : poorerBuy === richerBuy ? readConfidence(enemy) : "low";

  return {
    buy,
    reason: reason(code, fields),
    our: {
      side: input.ourSide,
      lossCount: ourLossCount,
      lossBonusIfLose: fields.lossBonus,
      cash,
      averageCash,
      minCash: cash.length ? Math.min(...cash) : 0,
      maxCash: cash.length ? Math.max(...cash) : 0,
      playersWithPrimary: roster.filter((player) => player.hasPrimary).length,
      timeoutIncome: input.ourSide === "T" ? "unverified" : "not_applicable",
    },
    enemy: {
      side: enemySide,
      lossCount: enemyLossCount,
      lossBonusIfLose: lossBonusForCount(enemyLossCount),
      band: enemy,
      poorerBuy,
      richerBuy,
      readConfidence: confidence,
      assumptions: [...new Set(assumptions)],
    },
    round: context,
    live: state === "live",
    score,
    warnings: [...new Set(warnings)],
  };
}

function chooseBuy(
  side: Side,
  roster: readonly PlayerSnapshot[],
  averageCash: number,
  lossBonus: number,
  enemyAverageLow: number,
  enemyAverageHigh: number,
): { buy: BuyClass; code: Reason["code"] } {
  const primaryRatio = roster.filter((player) => player.hasPrimary).length / roster.length;
  const holding = primaryRatio >= POLICY.savePrimaryRatio.value && averageCash < utilityBuyCash(side);
  if (holding) return { buy: "save", code: "save_hold" };

  if (averageCash >= fullBuyCash(side)) return { buy: "full", code: "full_buy" };

  const enemyFullLine = fullBuyCash(opposite(side));
  const enemyStrong = enemyAverageLow >= enemyFullLine;
  const enemyNotFull = enemyAverageHigh < enemyFullLine;
  const nextBuy = averageCash + lossBonus;

  if (averageCash >= forceBuyCash(side)) {
    if (enemyStrong && nextBuy >= fullBuyCash(side)) return { buy: "eco", code: "eco_bank" };
    if (enemyNotFull) return { buy: "force", code: "force_punish" };
    if (nextBuy >= fullBuyCash(side)) return { buy: "eco", code: "eco_bank" };
    return { buy: "force", code: "force_default" };
  }

  return { buy: "eco", code: "eco_bank" };
}

export function rosterOf(cash: number, hasPrimary: boolean, count = TEAM_SIZE.value): PlayerSnapshot[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    cash,
    hasPrimary,
  }));
}
