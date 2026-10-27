import type { CompletedRound, FreezeSnapshot } from "./types.js";
import { rosterOf } from "./recommend.js";

function elimination(winner: CompletedRound["winner"]): CompletedRound {
  return { winner, reason: "elimination", bombPlanted: false };
}

/** Round 1, $800, no guns. */
export function pistolSnapshot(ourSide: FreezeSnapshot["ourSide"] = "T"): FreezeSnapshot {
  return {
    roundNumber: 1,
    ourSide,
    ourPlayers: rosterOf(800, false),
    history: [],
  };
}

/**
 * Two straight losses. Cash is an input ($1600, no primaries), so the
 * call is eco even though the loss bonus would be large.
 */
export function ecoSnapshot(): FreezeSnapshot {
  return {
    roundNumber: 3,
    ourSide: "CT",
    ourPlayers: rosterOf(1600, false),
    history: [elimination("T"), elimination("T")],
  };
}

/** Won pistol, sitting on a rifle buy. */
export function fullSnapshot(): FreezeSnapshot {
  return {
    roundNumber: 2,
    ourSide: "T",
    ourPlayers: rosterOf(5000, false),
    history: [elimination("T")],
  };
}

/** Mid cash, enemy just lost pistol, so they are not on a full buy. */
export function forceSnapshot(): FreezeSnapshot {
  return {
    roundNumber: 2,
    ourSide: "T",
    ourPlayers: rosterOf(2500, false),
    history: [elimination("T")],
  };
}

/** Already holding rifles after a deep loss streak. The call stays save. */
export function saveSnapshot(): FreezeSnapshot {
  return {
    roundNumber: 5,
    ourSide: "T",
    ourPlayers: rosterOf(2000, true),
    history: [elimination("CT"), elimination("CT"), elimination("CT"), elimination("CT")],
  };
}

/** 12–12, first freeze of overtime. Money is the verified $10000 reset. */
export function overtimeSnapshot(): FreezeSnapshot {
  const history: CompletedRound[] = [
    ...Array.from({ length: 12 }, () => elimination("T")),
    ...Array.from({ length: 12 }, () => elimination("CT")),
  ];
  return {
    roundNumber: 25,
    ourSide: "T",
    ourPlayers: rosterOf(10_000, false),
    history,
    score: { T: 12, CT: 12 },
  };
}
