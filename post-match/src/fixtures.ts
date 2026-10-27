import type { BuyOptionEvaluation, CompletedRound, FreezeSnapshot, PlayerSnapshot, Side } from "./economy-engine.js";
import type { PlayedRound } from "./review.js";
import { fixtureTable } from "./fixture-engine.js";

/**
 * Blueprint-shaped match (Master Blueprint v1.0, Part 3.3).
 *
 * Each `state` is an `evaluateFreeze` snapshot: own roster, side, and public
 * `history`. Enemy cash is not on the snapshot. `enemy.band` would come back
 * from zhasi's engine. Round `reason` values are elimination, bomb_explode,
 * bomb_defuse, or time.
 *
 * The option tables are canned expected values for the lookup double.
 * `evaluateFreeze` does not return per-class EV yet, so these tables stay
 * until it does. They are not a second loss-bonus ladder.
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

function option(
  buyClass: BuyOptionEvaluation["buyClass"],
  expectedValue: number,
  en: string,
  zh: string,
): BuyOptionEvaluation {
  return { buyClass, expectedValue, reason: { en, zh } };
}

const round5Options: BuyOptionEvaluation[] = [
  option(
    "full",
    0.2,
    "A full buy into their rifle round spends the money round 5 needs.",
    "在对方步枪局全装，会花掉第 5 回合需要的钱。",
  ),
  option("force", 0.28, "A force still donates the next rifle round.", "强起仍会送掉下一把步枪局。"),
  option(
    "eco",
    0.74,
    "They're on a 2-loss bonus and likely forced last round — expect a full buy. Save for a coordinated round 5.",
    "对方处于两连败奖励，上一分很可能强起——准备面对全装。把钱留到第 5 回合一起打。",
  ),
  option("save", 0.6, "Saving is close, and an eco still contests the round.", "存枪也接近，ECO 仍能争夺这一分。"),
];

const round7Options: BuyOptionEvaluation[] = [
  option(
    "full",
    0.12,
    "Four saved rifles are worth more than this buy.",
    "四把能存下来的步枪比这一分的购买更值钱。",
  ),
  option("force", 0.3, "A force still breaks the save.", "强起同样会打断存枪。"),
  option(
    "eco",
    0.55,
    "A light buy keeps the series alive if the save is awkward.",
    "不好存的时候，轻装仍能把这一串回合留下来。",
  ),
  option(
    "save",
    0.64,
    "A light buy or save wins the series of rounds.",
    "轻装或存枪才能赢下这一串回合。",
  ),
];

const round9Options: BuyOptionEvaluation[] = [
  option("full", 0.22, "The team cannot full-buy together.", "队伍凑不齐全装。"),
  option("force", 0.31, "Forcing cashes in a round the loss bonus was holding.", "强起花掉了连败奖励留着的钱。"),
  option("eco", 0.4, "An eco is safer and still short of the save.", "ECO 更稳，但仍不如存枪。"),
  option("save", 0.52, "Saving the rifles keeps the next buy intact.", "把步枪存下来，下一分的购买还在。"),
];

const round11Options: BuyOptionEvaluation[] = [
  option("full", 0.18, "Rifles into a round the team cannot close.", "步枪买进了一个拿不下来的回合。"),
  option("force", 0.22, "A smaller force loses less of the next round.", "少买一点，下一分损失更小。"),
  option("eco", 0.26, "Eco and take the full buy on the following round.", "这分 ECO，下一分再全装。"),
  option("save", 0.2, "A save is fine, and the eco keeps a pistol contest.", "存枪可以，ECO 还能用手枪争这一分。"),
];

const round14Options: BuyOptionEvaluation[] = [
  option("full", 0.71, "The other side is broke. A full buy takes the round and the economy.", "对方没钱。全装能拿下这一分和经济。"),
  option("force", 0.44, "A force wins less cleanly than buying together.", "强起不如一起全装干净。"),
  option("eco", 0.2, "Eco gives a broke team a free round.", "ECO 等于送给没钱的队伍一轮。"),
  option("save", 0.38, "Saving donates the round the team came to win.", "存枪把这分白送给了对方。"),
];

export interface FixtureRound extends PlayedRound<FreezeSnapshot> {
  options: readonly BuyOptionEvaluation[];
  state: FreezeSnapshot;
}

function played(
  roundNumber: number,
  winner: "us" | "them",
  chosenBuy: FixtureRound["chosenBuy"],
  cash: readonly number[],
  primaries: number,
  closing: readonly CompletedRound[],
  options: readonly BuyOptionEvaluation[],
): FixtureRound {
  return {
    roundNumber,
    winner,
    chosenBuy,
    options,
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
  ], round5Options),
  played(7, "them", "full", [4200, 4600, 3900, 4400, 800], 4, [
    { winner: "T", reason: "bomb_explode" },
    { winner: "CT", reason: "elimination" },
  ], round7Options),
  played(9, "us", "force", [2300, 2100, 2500, 800, 1900], 2, [
    { winner: "T", reason: "elimination" },
    { winner: "CT", reason: "time", alive: { T: 2 } },
  ], round9Options),
  played(11, "them", "full", [3600, 1500, 1400, 2800, 1200], 1, [
    { winner: "T", reason: "elimination" },
    { winner: "CT", reason: "bomb_defuse" },
  ], round11Options),
  played(14, "them", "save", [4700, 4500, 4300, 4100, 3900], 0, [
    { winner: "T", reason: "bomb_explode" },
    { winner: "CT", reason: "elimination" },
  ], round14Options),
];

export const blueprintEngineTable = fixtureTable(
  blueprintMatch.map((round) => ({ roundNumber: round.roundNumber, options: round.options })),
);

/** Same rounds with the option table removed, so the lookup engine must answer. */
export function blueprintRoundsForEngine(): PlayedRound<FreezeSnapshot>[] {
  return blueprintMatch.map((round) => ({
    roundNumber: round.roundNumber,
    winner: round.winner,
    chosenBuy: round.chosenBuy,
    state: round.state,
  }));
}
