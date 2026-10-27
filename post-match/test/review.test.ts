import { describe, expect, it, vi } from "vitest";
import { adaptKohiEngine, type EconomyEngine, type FreezeTimeRecommendation } from "../src/economy-engine.js";
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
          { buyClass: "full", expectedValue: 0.2, reason: { en: "full", zh: "全装" } },
          { buyClass: "save", expectedValue: 0.5, reason: { en: "save", zh: "存枪" } },
        ],
      },
      {
        roundNumber: 3,
        winner: "us",
        chosenBuy: "force",
        options: [
          { buyClass: "force", expectedValue: 0.1, reason: { en: "force", zh: "强起" } },
          { buyClass: "eco", expectedValue: 0.4, reason: { en: "eco", zh: "ECO" } },
        ],
      },
    ];
    const review = reviewMatch(rounds);
    expect(review.leaks.map((leak) => leak.roundNumber)).toEqual([3, 8]);
    expect(review.leaks.every((leak) => leak.evCost === 0.3)).toBe(true);
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
        state: { ...blueprintMatch[0]!.state, saveEligibleCount: 4 },
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

describe("adaptKohiEngine", () => {
  it("accepts kohi's buyClass field and koki's recommendation field", () => {
    const kohi = adaptKohiEngine({
      recommend() {
        return {
          buyClass: "save",
          reason: { en: "Save the rifles.", zh: "把步枪存下来。" },
          enemyEconomyBand: { min: 2000, max: 4500 },
          buyingPower: 18400,
          options: [
            { buyClass: "full", expectedValue: 0.12, reason: "Too expensive." },
            { buyClass: "save", expectedValue: 0.64, reason: { en: "Save the rifles.", zh: "把步枪存下来。" } },
          ],
        };
      },
    });
    const recommendation = kohi.recommend(blueprintMatch[1]!.state);
    expect(recommendation.recommendation).toBe("save");
    expect(recommendation.buyingPower).toBe(18400);
    expect(recommendation.enemyEconomyBand).toEqual({ min: 2000, max: 4500 });
    expect(recommendation.options?.[0]?.reason).toEqual({ en: "Too expensive.", zh: "Too expensive." });

    const koki = adaptKohiEngine({
      recommend() {
        return {
          recommendation: "eco",
          reason: "engine not wired",
          enemyEconomyBand: { min: 0, max: 0 },
        };
      },
    });
    expect(koki.recommend(blueprintMatch[0]!.state).recommendation).toBe("eco");
    expect(() => reviewMatch(blueprintRoundsForEngine().slice(0, 1), koki)).toThrow(ReviewError);
  });

  it("ranks a match through evaluateBuyOptions on the adapted engine", () => {
    const engine = adaptKohiEngine({
      recommend() {
        return { recommendation: "eco" as const, reason: "unused" };
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
