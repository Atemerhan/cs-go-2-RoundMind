import { forceBuyCash, fullBuyCash, type CompletedRound, type RoundEndReason, type Side } from "@roundmind/engine";

export interface EditorPlayer {
  id: string;
  cash: number;
  hasPrimary: boolean;
}

export interface Draft {
  winner: Side;
  reason: RoundEndReason;
  aliveT: string;
  aliveCT: string;
  killT: string;
  killCT: string;
}

export const emptyDraft: Draft = {
  winner: "T",
  reason: "elimination",
  aliveT: "",
  aliveCT: "",
  killT: "",
  killCT: "",
};

export function blankPlayers(cash = 800, hasPrimary = false): EditorPlayer[] {
  return Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1), cash, hasPrimary }));
}

export type Affordance = "full" | "force" | "short";

export function affordance(cash: number, side: Side): Affordance {
  if (cash >= fullBuyCash(side)) return "full";
  if (cash >= forceBuyCash(side)) return "force";
  return "short";
}

export function draftToRound(draft: Draft): CompletedRound {
  let round = applyReason({ winner: draft.winner, reason: draft.reason }, draft.reason);
  round = applyAlive(round, "T", draft.aliveT);
  round = applyAlive(round, "CT", draft.aliveCT);
  round = applyKillReward(round, "T", draft.killT);
  round = applyKillReward(round, "CT", draft.killCT);
  return round;
}

export function applyWinner(round: CompletedRound, winner: Side): CompletedRound {
  return { ...round, winner };
}

export function applyReason(round: CompletedRound, reason: RoundEndReason): CompletedRound {
  const next: CompletedRound = { ...round, reason };
  if (reason === "bomb_explode" || reason === "bomb_defuse") next.bombPlanted = true;
  else delete next.bombPlanted;
  return next;
}

export function applyAlive(round: CompletedRound, side: Side, raw: string): CompletedRound {
  return applyPair(round, "alive", side, raw);
}

export function applyKillReward(round: CompletedRound, side: Side, raw: string): CompletedRound {
  return applyPair(round, "killRewardTotal", side, raw);
}

function applyPair(round: CompletedRound, key: "alive" | "killRewardTotal", side: Side, raw: string): CompletedRound {
  const parsed = parseOptionalInt(raw);
  if (parsed === null) return round;
  const next: CompletedRound = { ...round, [key]: { ...round[key] } };
  const bag = { ...(next[key] ?? {}) };
  if (parsed === undefined) delete bag[side];
  else bag[side] = parsed;
  if (bag.T === undefined && bag.CT === undefined) delete next[key];
  else next[key] = bag;
  return next;
}

function parseOptionalInt(raw: string): number | undefined | null {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
