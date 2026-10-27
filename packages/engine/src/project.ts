import {
  OVERTIME_LOSS_COUNT_RESET,
  OVERTIME_START_MONEY,
  POLICY,
  START_MONEY,
  TEAMKILL_PENALTY,
  TEAM_SIZE,
} from "./rules.js";
import type { Assumption, BuyClass, CashBand, CompletedRound, Side } from "./types.js";
import {
  clampCash,
  emptyPlayers,
  forceBuyCash,
  freshLossCount,
  fullBuyCash,
  incomeByPlayer,
  isPistolRound,
  nextLossCount,
  normalizeRound,
  roundContext,
  spendAmount,
  sumPlayers,
  type NormalizedRound,
} from "./money.js";

export interface SideLedger {
  lossCount: number;
  low: number[];
  high: number[];
}

export interface Projection {
  T: SideLedger;
  CT: SideLedger;
  assumptions: Assumption[];
  warnings: Array<"alive_clamped" | "time_plant_ignored">;
}

function freshSide(cash: number): SideLedger {
  return {
    lossCount: freshLossCount(),
    low: emptyPlayers(cash),
    high: emptyPlayers(cash),
  };
}

function resetLedger(previous: SideLedger, roundNumber: number): SideLedger {
  const context = roundContext(roundNumber);
  if (context.phase === "overtime") {
    const cash = OVERTIME_START_MONEY.value;
    const lossCount = OVERTIME_LOSS_COUNT_RESET.value ? freshLossCount() : previous.lossCount;
    return { lossCount, low: emptyPlayers(cash), high: emptyPlayers(cash) };
  }
  return freshSide(START_MONEY.value);
}

function applyPlayers(
  players: readonly number[],
  side: Side,
  round: NormalizedRound,
  roundNumber: number,
  lossCountEntering: number,
  scenario: "low" | "high",
): number[] {
  const pistol = isPistolRound(roundNumber);
  const afterBuy = players.map((cash) => Math.max(0, cash - spendAmount(cash, scenario, pistol, side)));
  const penalized = afterBuy.slice();
  const teamKills = round.teamKills[side];
  for (let kill = 0; kill < teamKills; kill += 1) {
    const index = kill % TEAM_SIZE.value;
    penalized[index] = Math.max(0, (penalized[index] ?? 0) - TEAMKILL_PENALTY.value);
  }
  const income = incomeByPlayer({
    side,
    round,
    lossCountEntering,
    scenario,
  });
  return penalized.map((cash, index) => clampCash(cash + (income[index] ?? 0)));
}

function applySide(ledger: SideLedger, side: Side, round: NormalizedRound, roundNumber: number): SideLedger {
  const lossCount = nextLossCount(ledger.lossCount, round.winner === side);
  let low = applyPlayers(ledger.low, side, round, roundNumber, ledger.lossCount, "low");
  let high = applyPlayers(ledger.high, side, round, roundNumber, ledger.lossCount, "high");
  if (sumPlayers(low) > sumPlayers(high)) {
    const swap = low;
    low = high;
    high = swap;
  }
  return { lossCount, low, high };
}

/**
 * Walk public history and return both teams' ledgers at the freeze of
 * `upcomingRound`. Economy resets replace cash and the loss counter
 * before that round is played.
 */
export function projectEconomy(
  history: readonly CompletedRound[],
  upcomingRound: number,
): Projection {
  const upcoming = Math.max(1, Math.trunc(upcomingRound));
  const played = Math.min(history.length, upcoming - 1);
  let state: Projection = {
    T: freshSide(START_MONEY.value),
    CT: freshSide(START_MONEY.value),
    assumptions: [],
    warnings: [],
  };

  for (let index = 0; index < played; index += 1) {
    const roundNumber = index + 1;
    const source = history[index];
    if (!source) continue;
    if (roundNumber !== 1 && roundContext(roundNumber).economyReset) {
      state = {
        ...state,
        T: resetLedger(state.T, roundNumber),
        CT: resetLedger(state.CT, roundNumber),
      };
    }
    const round = normalizeRound(source);
    state = {
      ...state,
      T: applySide(state.T, "T", round, roundNumber),
      CT: applySide(state.CT, "CT", round, roundNumber),
      warnings: state.warnings.concat(round.warnings),
      assumptions: state.assumptions.concat(assumptionsFor(round)),
    };
  }

  if (upcoming !== 1 && roundContext(upcoming).economyReset) {
    state = {
      ...state,
      T: resetLedger(state.T, upcoming),
      CT: resetLedger(state.CT, upcoming),
    };
  }

  if (played > 0) state.assumptions.push("buy_spend_model", "even_team");
  return {
    ...state,
    assumptions: unique(state.assumptions),
    warnings: unique(state.warnings),
  };
}

function assumptionsFor(round: NormalizedRound): Assumption[] {
  const found: Assumption[] = [];
  if (round.killReward.T === null || round.killReward.CT === null) found.push("unknown_kills");
  if (round.reason === "time") {
    found.push("unverified_timeout_income");
    if (round.alive?.T === undefined) found.push("unknown_survivors");
  }
  if (round.alive?.T === undefined && !(round.winner === "CT" && round.reason === "elimination")) {
    found.push("ct_kill_award_span");
  }
  return found;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function cashBand(playersLow: readonly number[], playersHigh: readonly number[]): CashBand {
  const minTeam = sumPlayers(playersLow);
  const maxTeam = sumPlayers(playersHigh);
  const size = TEAM_SIZE.value;
  return {
    minTeam,
    maxTeam,
    minPerPlayer: Math.min(...playersLow),
    maxPerPlayer: Math.max(...playersHigh),
    averageLow: minTeam / size,
    averageHigh: maxTeam / size,
  };
}

export function buyClassForCash(averageCash: number, side: Side): BuyClass {
  if (averageCash >= fullBuyCash(side)) return "full";
  if (averageCash >= forceBuyCash(side)) return "force";
  return "eco";
}

export function readConfidence(band: CashBand): "low" | "medium" | "high" {
  const width = band.averageHigh - band.averageLow;
  if (width <= POLICY.bandTight.value) return "high";
  if (width <= POLICY.bandMedium.value) return "medium";
  return "low";
}
