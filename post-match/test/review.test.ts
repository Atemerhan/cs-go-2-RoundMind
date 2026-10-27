import { describe, expect, it, vi } from "vitest";
import { adaptEconomyEngine, type EconomyEngine, type FreezeTimeRecommendation } from "../src/economy-engine.js";
import { ReviewError } from "../src/errors.js";
import { createFixtureLookupEngine } from "../src/fixture-engine.js";
import { blueprintEngineTable, blueprintMatch, blueprintRoundsForEngine } from "../src/fixtures.js";
import { reviewMatch, type PlayedRound } from "../src/review.js";

const BLUEPRINT_ROUND_7 =
  "Round 7: full-buying into a 4-man save cost you the round and your next-round economy. A light buy or save wins the series of rounds.";

describe("blueprint match", () => {
  it("names the three largest leaks and the 4-man save line", () => {
    const review = reviewMatch(blueprintMatch);

    expect(review.roundsConsidered).toBe(5);
    expect(review.totalLeaks).toBe(4);
    expect(review.source).toBe("logged");
    expect(review.leaks.map((leak) => leak.roundNumber)).toEqual([7, 14, 9]);
    expect(review.leaks.map((leak) => leak.betterBuy)).toEqual(["save", "full", "save"]);
    expect(review.leaks.map((leak) => leak.chosenBuy)).toEqual(["full", "save", "force"]);
    expect(review.leaks[0]?.summary.en).toBe(BLUEPRINT_ROUND_7);
    expect(review.leaks[0]?.summary.zh).toContain("4");
    expect(review.leaks[0]?.summary.zh).toContain("存枪");
    expect(review.leaks[0]?.evCost).toBeCloseTo(0.52, 10);
    expect(review.leaks[0]?.saveEligibleCount).toBe(4);
  });

  it("keeps a correct eco against a 2-loss bonus out of the leak list", () => {
    const review = reviewMatch(blueprintMatch);
    expect(review.leaks.some((leak) => leak.roundNumber === 5)).toBe(false);
    const round5 = blueprintMatch.find((round) => round.roundNumber === 5);
    const eco = round5?.options.find((option) => option.buyClass === "eco");
    expect(eco?.reason.en).toContain("2-loss bonus");
    expect(eco?.reason.en).toContain("coordinated round 5");
  });

  it("ranks by expected-value gap when the worse buy still won the round", () => {
    const review = reviewMatch(blueprintMatch);
    const round9 = review.leaks.find((leak) => leak.roundNumber === 9);
    expect(round9?.winner).toBe("us");
    expect(round9 && review.leaks[0] && round9.evCost < review.leaks[0].evCost).toBe(true);
  });

  it("lets the lookup double report the best buy for a round", () => {
    const engine = createFixtureLookupEngine(blueprintEngineTable);
    const round7 = blueprintMatch.find((round) => round.roundNumber === 7)!;
    expect(engine.recommend(round7.state).recommendation).toBe("save");
    expect(() => engine.evaluateBuyOptions({ ...round7.state, roundNumber: 99 })).toThrow(/round 99/);
  });

  it("asks the fixture lookup for the same top three", () => {
    const engine = createFixtureLookupEngine(blueprintEngineTable);
    const evaluate = vi.spyOn(engine, "evaluateBuyOptions");
    const review = reviewMatch(blueprintRoundsForEngine(), engine);

    expect(evaluate).toHaveBeenCalledTimes(5);
    expect(review.source).toBe("engine");
    expect(review.leaks.map((leak) => [leak.roundNumber, leak.betterBuy, leak.evCost])).toEqual(
      reviewMatch(blueprintMatch).leaks.map((leak) => [leak.roundNumber, leak.betterBuy, leak.evCost]),
    );
    expect(review.leaks[0]?.summary.en).toBe(BLUEPRINT_ROUND_7);
  });
});

describe("reviewMatch", () => {
  it("returns fewer than three leaks when the match has fewer mistakes", () => {
    const review = reviewMatch(blueprintMatch.filter((round) => round.roundNumber === 7 || round.roundNumber === 5));
    expect(review.leaks).toHaveLength(1);
    expect(review.totalLeaks).toBe(1);
    expect(review.leaks[0]?.roundNumber).toBe(7);
  });

  it("breaks equal EV costs toward the earlier round", () => {
    const rounds: PlayedRound[] = [
      {
        roundNumber: 8,
        winner: "them",
        chosenBuy: "full",
        options: [
          { buyClass: "full", expectedValue: 0.25, reason: { en: "full", zh: "全装" } },
          { buyClass: "save", expectedValue: 0.75, reason: { en: "save", zh: "存枪" } },
        ],
      },
      {
        roundNumber: 3,
        winner: "us",
        chosenBuy: "force",
        options: [
          { buyClass: "force", expectedValue: 0.25, reason: { en: "force", zh: "强起" } },
          { buyClass: "eco", expectedValue: 0.75, reason: { en: "eco", zh: "ECO" } },
        ],
      },
    ];
    const review = reviewMatch(rounds);
    expect(review.leaks.map((leak) => leak.roundNumber)).toEqual([3, 8]);
    expect(review.leaks.every((leak) => leak.evCost === 0.5)).toBe(true);
  });

  it("does not call the engine when the round already logged its options", () => {
    const engine: EconomyEngine = {
      recommend: vi.fn(),
      evaluateBuyOptions: vi.fn(),
    };
    reviewMatch([blueprintMatch[1]!], engine);
    expect(engine.recommend).not.toHaveBeenCalled();
    expect(engine.evaluateBuyOptions).not.toHaveBeenCalled();
  });

  it("reads recommend().options when evaluateBuyOptions is absent", () => {
    const round = blueprintRoundsForEngine().find((entry) => entry.roundNumber === 7)!;
    const engine: EconomyEngine = {
      recommend() {
        return {
          recommendation: "save",
          reason: { en: "save", zh: "存枪" },
          options: blueprintMatch.find((entry) => entry.roundNumber === 7)!.options,
        };
      },
    };
    const review = reviewMatch([round], engine);
    expect(review.leaks[0]?.betterBuy).toBe("save");
    expect(review.leaks[0]?.summary.en).toBe(BLUEPRINT_ROUND_7);
  });

  it("uses the engine's earlier option when two lines tie for best", () => {
    const review = reviewMatch([
      {
        roundNumber: 2,
        winner: "them",
        chosenBuy: "full",
        options: [
          { buyClass: "full", expectedValue: 0.1, reason: { en: "full", zh: "全装" } },
          { buyClass: "eco", expectedValue: 0.4, reason: { en: "eco first", zh: "先 ECO" } },
          { buyClass: "save", expectedValue: 0.4, reason: { en: "save second", zh: "后存枪" } },
        ],
      },
    ]);
    expect(review.leaks[0]?.betterBuy).toBe("eco");
  });

  it("treats a tie with the best line as no leak", () => {
    const review = reviewMatch([
      {
        roundNumber: 1,
        winner: "us",
        chosenBuy: "save",
        state: blueprintMatch[0]!.state,
        options: [
          { buyClass: "full", expectedValue: 0.2, reason: { en: "full", zh: "全装" } },
          { buyClass: "save", expectedValue: 0.2, reason: { en: "save", zh: "存枪" } },
        ],
      },
    ]);
    expect(review.leaks).toEqual([]);
    expect(review.totalLeaks).toBe(0);
  });

  it("returns an empty review for an empty log", () => {
    expect(reviewMatch([])).toEqual({
      leaks: [],
      totalLeaks: 0,
      roundsConsidered: 0,
      source: "none",
    });
  });

  it("honors an explicit limit", () => {
    const review = reviewMatch(blueprintMatch, undefined, { limit: 1 });
    expect(review.leaks).toHaveLength(1);
    expect(review.totalLeaks).toBe(4);
    expect(review.leaks[0]?.roundNumber).toBe(7);
  });

  it("uses the generic line when a full buy's best answer is force", () => {
    const review = reviewMatch([
      {
        roundNumber: 7,
        winner: "them",
        chosenBuy: "full",
        state: blueprintMatch.find((round) => round.roundNumber === 7)!.state,
        options: [
          { buyClass: "full", expectedValue: 0.2, reason: { en: "full", zh: "全装" } },
          { buyClass: "force", expectedValue: 0.45, reason: { en: "Force together.", zh: "一起强起。" } },
        ],
      },
    ]);
    expect(review.leaks[0]?.summary.en).toBe(
      "Round 7: choosing full buy instead of force left 0.25 expected value on the table. Force together.",
    );
    expect(review.leaks[0]?.summary.zh).toContain("强起");
  });

  it("refuses to rank a round that has no engine table", () => {
    expect(() => reviewMatch([{ roundNumber: 4, winner: "us", chosenBuy: "eco" }])).toThrow(ReviewError);
    try {
      reviewMatch([{ roundNumber: 4, winner: "us", chosenBuy: "eco" }]);
    } catch (error) {
      expect(error).toMatchObject({ code: "missing-ev" });
    }
  });

  it("refuses a played buy the engine did not score", () => {
    expect(() =>
      reviewMatch([
        {
          roundNumber: 6,
          winner: "them",
          chosenBuy: "save",
          options: [{ buyClass: "full", expectedValue: 0.4, reason: { en: "full", zh: "全装" } }],
        },
      ]),
    ).toThrow(/absent from the engine option table/);
  });

  it("refuses duplicate classes and a recommendation without values", () => {
    expect(() =>
      reviewMatch([
        {
          roundNumber: 6,
          winner: "us",
          chosenBuy: "eco",
          options: [
            { buyClass: "eco", expectedValue: 0.2, reason: { en: "a", zh: "甲" } },
            { buyClass: "eco", expectedValue: 0.4, reason: { en: "b", zh: "乙" } },
          ],
        },
      ]),
    ).toThrow(/more than once/);

    const round = blueprintRoundsForEngine()[0]!;
    const engine: EconomyEngine = {
      recommend(): FreezeTimeRecommendation {
        return { recommendation: "eco", reason: { en: "eco", zh: "ECO" } };
      },
    };
    expect(() => reviewMatch([round], engine)).toThrow(/per-class expectedValue/);
  });
});

describe("adaptEconomyEngine", () => {
  const band = {
    minPerPlayer: 3000,
    maxPerPlayer: 5000,
    minTeam: 15000,
    maxTeam: 25000,
    averageLow: 3700,
    averageHigh: 4500,
  };

  function freezeEngine(seen: unknown[]) {
    return adaptEconomyEngine({
      evaluateFreeze(input) {
        seen.push(input);
        return {
          buy: "eco",
          reason: {
            code: "eco_bank",
            lossBonus: 2400,
            averageCash: 1820,
            enemyMin: 3700,
            enemyMax: 4500,
            ourLossCount: 0,
            enemyLossCount: 2,
          },
          our: { averageCash: 1820, lossBonusIfLose: 1900, cash: [1800] },
          enemy: { band },
        };
      },
    });
  }

  it("maps evaluateFreeze and withholds enemy cash from the call", () => {
    const seen: unknown[] = [];
    const engine = freezeEngine(seen);
    const snapshot = blueprintMatch[0]!.state;
    const recommendation = engine.recommend(snapshot);

    expect(recommendation.recommendation).toBe("eco");
    expect(recommendation.reasonCode).toBe("eco_bank");
    expect(recommendation.lossBonus).toBe(2400);
    expect(recommendation.ourAverageCash).toBe(1820);
    expect(recommendation.enemyBand).toEqual(band);
    expect(recommendation.options).toBeUndefined();
    expect(seen).toEqual([snapshot]);
    expect(seen[0]).not.toHaveProperty("enemyEconomyBand");
    expect(seen[0]).not.toHaveProperty("knownEnemyMoney");
    expect(Object.keys(seen[0] as object).sort()).toEqual(
      ["history", "ourPlayers", "ourSide", "overtimeLimit", "roundNumber"].sort(),
    );
  });

  it("accepts the GSI handoff and the round-end reason enum", () => {
    const seen: unknown[] = [];
    const engine = freezeEngine(seen);
    const handoff = {
      roundNumber: 5,
      ourSide: "CT" as const,
      ourPlayers: [{ id: "p1", cash: 1600, hasPrimary: false }],
      history: [
        { winner: "T" as const, reason: "elimination" as const },
        { winner: "T" as const, reason: "bomb_explode" as const },
        { winner: "CT" as const, reason: "bomb_defuse" as const },
        { winner: "CT" as const, reason: "time" as const, alive: { T: 2 } },
      ],
    };
    expect(engine.recommend(handoff).recommendation).toBe("eco");
    expect(() =>
      engine.recommend({
        ...handoff,
        history: [{ winner: "T", reason: "defuse" }],
      } as unknown as typeof handoff),
    ).toThrow(/bomb_explode/);
  });

  it("refuses enemy cash on the snapshot", () => {
    const engine = freezeEngine([]);
    expect(() =>
      engine.recommend({
        ...blueprintMatch[0]!.state,
        knownEnemyMoney: 4000,
      } as unknown as typeof blueprintMatch[0]["state"]),
    ).toThrow(ReviewError);
    try {
      engine.recommend({
        ...blueprintMatch[0]!.state,
        enemyEconomyBand: { min: 1, max: 2 },
      } as unknown as typeof blueprintMatch[0]["state"]);
    } catch (error) {
      expect(error).toMatchObject({ code: "enemy-cash" });
    }
  });

  it("does not invent per-buy EV from evaluateFreeze", () => {
    const engine = freezeEngine([]);
    expect(() => reviewMatch(blueprintRoundsForEngine().slice(0, 1), engine)).toThrow(/per-class expectedValue/);
  });

  it("ranks a match when a future option table is also supplied", () => {
    const engine = adaptEconomyEngine({
      evaluateFreeze() {
        return {
          buy: "eco",
          reason: { code: "eco_bank", lossBonus: 1900 },
          enemy: {
            band: {
              minPerPlayer: 0,
              maxPerPlayer: 0,
              minTeam: 0,
              maxTeam: 0,
              averageLow: 0,
              averageHigh: 0,
            },
          },
        };
      },
      evaluateBuyOptions(state: { roundNumber: number }) {
        return blueprintEngineTable.get(state.roundNumber);
      },
    });
    const review = reviewMatch(blueprintRoundsForEngine(), engine);
    expect(review.leaks[0]?.summary.en).toBe(BLUEPRINT_ROUND_7);
    expect(review.source).toBe("engine");
  });
});
