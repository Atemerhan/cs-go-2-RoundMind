import { describe, expect, it, vi } from "vitest";
import { adaptEconomyEngine, type EconomyEngine, type FreezeTimeRecommendation } from "../src/economy-engine.js";
import { ReviewError } from "../src/errors.js";
import { createFixtureLookupEngine, fixtureTable } from "../src/fixture-engine.js";
import { blueprintMatch } from "../src/fixtures.js";
import { engineRegret, leakCost, reviewMatch, type PlayedRound } from "../src/review.js";

const sampleOptions = [
  { buy: "full" as const, expectedValue: 1 },
  { buy: "force" as const, expectedValue: 0 },
  { buy: "eco" as const, expectedValue: 4 },
  { buy: "save" as const, expectedValue: 2 },
];

describe("leak cost", () => {
  it("ranks by best minus chosen, the negation of zhasi's regret", () => {
    expect(leakCost(4, 1)).toBe(3);
    expect(engineRegret(1, 4)).toBe(-3);
    expect(engineRegret(1, 4)).toBe(-leakCost(4, 1));
  });
});

describe("reviewMatch", () => {
  it("ranks a logged table by positive cost", () => {
    const review = reviewMatch([
      {
        roundNumber: 7,
        winner: "them",
        chosenBuy: "full",
        state: blueprintMatch.find((round) => round.roundNumber === 7)!.state,
        options: sampleOptions,
      },
    ]);
    expect(review.leaks[0]?.betterBuy).toBe("eco");
    expect(review.leaks[0]?.evCost).toBe(3);
    expect(review.leaks[0]?.summary.en).toContain("4-man save");
    expect(review.source).toBe("logged");
  });

  it("breaks equal costs toward the earlier round", () => {
    const rounds: PlayedRound[] = [
      {
        roundNumber: 8,
        winner: "them",
        chosenBuy: "full",
        options: [
          { buy: "full", expectedValue: 0.25 },
          { buy: "save", expectedValue: 0.75 },
        ],
      },
      {
        roundNumber: 3,
        winner: "us",
        chosenBuy: "force",
        options: [
          { buy: "force", expectedValue: 0.25 },
          { buy: "eco", expectedValue: 0.75 },
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
    reviewMatch([
      {
        roundNumber: 2,
        winner: "them",
        chosenBuy: "full",
        options: sampleOptions,
      },
    ], engine);
    expect(engine.recommend).not.toHaveBeenCalled();
    expect(engine.evaluateBuyOptions).not.toHaveBeenCalled();
  });

  it("uses the engine's earlier option when two lines tie for best", () => {
    const review = reviewMatch([
      {
        roundNumber: 2,
        winner: "them",
        chosenBuy: "full",
        options: [
          { buy: "full", expectedValue: 0.1 },
          { buy: "eco", expectedValue: 0.4 },
          { buy: "save", expectedValue: 0.4 },
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
          { buy: "full", expectedValue: 0.2 },
          { buy: "save", expectedValue: 0.2 },
        ],
      },
    ]);
    expect(review.leaks).toEqual([]);
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
    const review = reviewMatch(
      [3, 8].map((roundNumber) => ({
        roundNumber,
        winner: "them" as const,
        chosenBuy: "full" as const,
        options: [
          { buy: "full" as const, expectedValue: 0 },
          { buy: "save" as const, expectedValue: roundNumber },
        ],
      })),
      undefined,
      { limit: 1 },
    );
    expect(review.leaks).toHaveLength(1);
    expect(review.totalLeaks).toBe(2);
    expect(review.leaks[0]?.roundNumber).toBe(8);
  });

  it("uses the generic line when a full buy's best answer is force", () => {
    const review = reviewMatch([
      {
        roundNumber: 7,
        winner: "them",
        chosenBuy: "full",
        state: blueprintMatch.find((round) => round.roundNumber === 7)!.state,
        options: [
          { buy: "full", expectedValue: 0.2, reason: { en: "full", zh: "全装" } },
          { buy: "force", expectedValue: 0.45, reason: { en: "Force together.", zh: "一起强起。" } },
        ],
      },
    ]);
    expect(review.leaks[0]?.summary.en).toBe(
      "Round 7: choosing full buy instead of force left 0.25 loss-bonus steps on the table. Force together.",
    );
    expect(review.leaks[0]?.summary.zh).toContain("强起");
    expect(review.leaks[0]?.summary.zh).toContain("$500");
  });

  it("refuses to rank a snapshot without evaluateBuyOptions", () => {
    expect(() => reviewMatch(blueprintMatch)).toThrow(/evaluateBuyOptions/);
  });

  it("refuses a played buy the engine did not score", () => {
    expect(() =>
      reviewMatch([
        {
          roundNumber: 6,
          winner: "them",
          chosenBuy: "save",
          options: [{ buy: "full", expectedValue: 0.4 }],
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
            { buy: "eco", expectedValue: 0.2 },
            { buy: "eco", expectedValue: 0.4 },
          ],
        },
      ]),
    ).toThrow(/more than once/);

    const engine: EconomyEngine = {
      recommend(): FreezeTimeRecommendation {
        return { recommendation: "eco", reason: { en: "eco", zh: "ECO" } };
      },
    };
    expect(() => reviewMatch([blueprintMatch[0]!], engine)).toThrow(/evaluateBuyOptions/);
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

  function freezeOnly(seen: unknown[]) {
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
    const engine = freezeOnly(seen);
    const snapshot = blueprintMatch[0]!.state;
    const recommendation = engine.recommend(snapshot);

    expect(recommendation.recommendation).toBe("eco");
    expect(recommendation.reasonCode).toBe("eco_bank");
    expect(recommendation.lossBonus).toBe(2400);
    expect(recommendation.enemyBand).toEqual(band);
    expect(recommendation.options).toBeUndefined();
    expect(Object.keys(seen[0] as object).sort()).toEqual(
      ["history", "ourPlayers", "ourSide", "overtimeLimit", "roundNumber"].sort(),
    );
  });

  it("accepts the GSI handoff and the round-end reason enum", () => {
    const engine = freezeOnly([]);
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
    const engine = freezeOnly([]);
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

  it("does not rank from evaluateFreeze alone", () => {
    const engine = freezeOnly([]);
    expect(() => reviewMatch([blueprintMatch[0]!], engine)).toThrow(/evaluateBuyOptions/);
  });

  it("ranks from evaluateBuyOptions using the buy field", () => {
    const engine = adaptEconomyEngine({
      evaluateFreeze() {
        return {
          buy: "eco",
          reason: { code: "eco_bank", lossBonus: 1900 },
          enemy: { band },
        };
      },
      evaluateBuyOptions() {
        return sampleOptions;
      },
    });
    const review = reviewMatch([blueprintMatch.find((round) => round.roundNumber === 7)!], engine);
    expect(review.source).toBe("engine");
    expect(review.leaks[0]?.chosenBuy).toBe("full");
    expect(review.leaks[0]?.betterBuy).toBe("eco");
    expect(review.leaks[0]?.evCost).toBe(leakCost(4, 1));
    expect(engineRegret(1, 4)).toBe(-review.leaks[0]!.evCost);
  });
});

describe("fixture lookup", () => {
  it("reports the best buy from a hand-built table", () => {
    const table = fixtureTable([
      {
        roundNumber: 7,
        options: sampleOptions.map((row) => ({
          buy: row.buy,
          buyClass: row.buy,
          expectedValue: row.expectedValue,
          reason: { en: "", zh: "" },
        })),
      },
    ]);
    const engine = createFixtureLookupEngine(table);
    const round7 = blueprintMatch.find((round) => round.roundNumber === 7)!;
    expect(engine.recommend(round7.state).recommendation).toBe("eco");
    expect(() => engine.evaluateBuyOptions({ ...round7.state, roundNumber: 99 })).toThrow(/round 99/);
  });
});
