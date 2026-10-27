import type { BuyOptionEvaluation, EconomyEvaluationInput } from "./economy-engine.js";
import type { PlayedRound } from "./review.js";
import { fixtureTable } from "./fixture-engine.js";

/**
 * Blueprint-shaped match (Master Blueprint v1.0, Part 3.3).
 *
 * Expected values are a canned option table for the lookup double. They are
 * not CS2 rule outputs. Replace the table with kohi's `evaluateBuyOptions`
 * when `packages/economy` lands; keep the played buys.
 *
 * Round 5 is the freeze-time example played correctly: eco against a 2-loss
 * opponent, so it is not a leak.
 * Round 7 is the post-match example: full-buying into a 4-man save.
 */

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

export interface FixtureRound extends PlayedRound<EconomyEvaluationInput> {
  options: readonly BuyOptionEvaluation[];
  state: EconomyEvaluationInput;
}

function played(
  roundNumber: number,
  winner: "us" | "them",
  chosenBuy: FixtureRound["chosenBuy"],
  state: EconomyEvaluationInput,
  options: readonly BuyOptionEvaluation[],
): FixtureRound {
  return { roundNumber, winner, chosenBuy, state, options };
}

export const blueprintMatch: readonly FixtureRound[] = [
  played(5, "us", "eco", {
    roundNumber: 5,
    score: { us: 2, them: 2 },
    ourMoney: [1800, 1700, 2100, 1600, 1900],
    ourLossStreak: 0,
    theirLossStreak: 2,
    enemyEconomyBand: { min: 3500, max: 5000 },
  }, round5Options),
  played(7, "them", "full", {
    roundNumber: 7,
    score: { us: 3, them: 3 },
    ourMoney: [4200, 4600, 3900, 4400, 800],
    ourLossStreak: 1,
    theirLossStreak: 0,
    saveEligibleCount: 4,
    enemyEconomyBand: { min: 3000, max: 4700 },
  }, round7Options),
  played(9, "us", "force", {
    roundNumber: 9,
    score: { us: 4, them: 4 },
    ourMoney: [2300, 2100, 2500, 800, 1900],
    ourLossStreak: 1,
    theirLossStreak: 1,
    saveEligibleCount: 2,
  }, round9Options),
  played(11, "them", "full", {
    roundNumber: 11,
    score: { us: 5, them: 5 },
    ourMoney: [3600, 1500, 1400, 2800, 1200],
    ourLossStreak: 2,
    theirLossStreak: 0,
    saveEligibleCount: 1,
  }, round11Options),
  played(14, "them", "save", {
    roundNumber: 14,
    score: { us: 6, them: 7 },
    ourMoney: [4700, 4500, 4300, 4100, 3900],
    ourLossStreak: 0,
    theirLossStreak: 3,
    enemyEconomyBand: { min: 800, max: 1800 },
    saveEligibleCount: 0,
  }, round14Options),
];

export const blueprintEngineTable = fixtureTable(
  blueprintMatch.map((round) => ({ roundNumber: round.roundNumber, options: round.options })),
);

/** Same rounds with the option table removed, so the lookup engine must answer. */
export function blueprintRoundsForEngine(): PlayedRound<EconomyEvaluationInput>[] {
  return blueprintMatch.map((round) => ({
    roundNumber: round.roundNumber,
    winner: round.winner,
    chosenBuy: round.chosenBuy,
    state: round.state,
  }));
}
