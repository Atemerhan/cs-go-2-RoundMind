import type { CompletedRound, FreezeSnapshot, PlayerSnapshot, Side } from "./economy-engine.js";
import type { PlayedRound } from "./review.js";

/**
 * Blueprint-shaped match (Master Blueprint v1.0, Part 3.3).
 *
 * Each `state` is an `evaluateFreeze` snapshot: own roster, side, and public
 * `history`. Enemy cash is not on the snapshot. `enemy.band` would come back
 * from zhasi's engine. Round `reason` values are elimination, bomb_explode,
 * bomb_defuse, or time.
 *
 * These are inputs only. `evaluateBuyOptions` scores them. There is no
 * canned expected-value table in this file.
 *
 * Dollar amounts, once a fixture states a payout, stay consistent with
 * docs/economy-rules.json (PR #2: 32 VERIFIED / 7 UNVERIFIED): planter $300;
 * each T receives $600 when a plant is defused, not $800; a win steps the
 * loss bonus down one tier and does not reset it to $1400; a half starts at
 * loss count 1, so a pistol loss pays $1900. Leave the 7 UNVERIFIED rows out.
 *
 * Round 5 is the freeze-time example played correctly: eco against a side
 * that just lost, so it is not a leak.
 * Round 7 is the post-match example: full-buying into a 4-man save.
 */

function players(cash: readonly number[], primaries: number): PlayerSnapshot[] {
  return cash.map((amount, index) => ({
    id: `p${index + 1}`,
    cash: amount,
    hasPrimary: index < primaries,
  }));
}

function historyBefore(roundNumber: number, closing: readonly CompletedRound[]): CompletedRound[] {
  const needed = roundNumber - 1;
  const opening: CompletedRound[] = Array.from({ length: Math.max(0, needed - closing.length) }, (_, index) => ({
    winner: (index % 2 === 0 ? "T" : "CT") as Side,
    reason: "elimination",
  }));
  return [...opening, ...closing].slice(-needed);
}

export interface FixtureRound extends PlayedRound<FreezeSnapshot> {
  state: FreezeSnapshot;
}

function played(
  roundNumber: number,
  winner: "us" | "them",
  chosenBuy: FixtureRound["chosenBuy"],
  cash: readonly number[],
  primaries: number,
  closing: readonly CompletedRound[],
): FixtureRound {
  return {
    roundNumber,
    winner,
    chosenBuy,
    state: {
      roundNumber,
      ourSide: "CT",
      overtimeLimit: 1,
      ourPlayers: players(cash, primaries),
      history: historyBefore(roundNumber, closing),
    },
  };
}

const ctClosed: CompletedRound[] = [
  { winner: "CT", reason: "bomb_defuse" },
  { winner: "CT", reason: "time", alive: { T: 0 } },
];

export const blueprintMatch: readonly FixtureRound[] = [
  played(5, "us", "eco", [1800, 1700, 2100, 1600, 1900], 0, [
    { winner: "T", reason: "elimination" },
    { winner: "CT", reason: "elimination" },
    ...ctClosed,
  ]),
  played(7, "them", "full", [4200, 4600, 3900, 4400, 800], 4, [
    { winner: "T", reason: "bomb_explode" },
    { winner: "CT", reason: "elimination" },
  ]),
  played(9, "us", "force", [2300, 2100, 2500, 800, 1900], 2, [
    { winner: "T", reason: "elimination" },
    { winner: "CT", reason: "time", alive: { T: 2 } },
  ]),
  played(11, "them", "full", [3600, 1500, 1400, 2800, 1200], 1, [
    { winner: "T", reason: "elimination" },
    { winner: "CT", reason: "bomb_defuse" },
  ]),
  played(14, "them", "save", [4700, 4500, 4300, 4100, 3900], 0, [
    { winner: "T", reason: "bomb_explode" },
    { winner: "CT", reason: "elimination" },
  ]),
];

/** Snapshots passed to `evaluateFreeze` / `evaluateBuyOptions`. No cached scores. */
export function blueprintRoundsForEngine(): PlayedRound<FreezeSnapshot>[] {
  return blueprintMatch.map((round) => ({
    roundNumber: round.roundNumber,
    winner: round.winner,
    chosenBuy: round.chosenBuy,
    state: round.state,
  }));
}
