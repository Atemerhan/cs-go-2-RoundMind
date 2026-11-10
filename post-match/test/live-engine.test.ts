import { evaluateBuyOptions, evaluateFreeze } from "@roundmind/engine";
import { describe, expect, it } from "vitest";
import { adaptEconomyEngine, EV_POINT_DOLLARS } from "../src/economy-engine.js";
import { blueprintMatch } from "../src/fixtures.js";
import { engineRegret, leakCost, reviewMatch } from "../src/review.js";

describe("zhasi evaluateBuyOptions", () => {
  const engine = adaptEconomyEngine({ evaluateFreeze, evaluateBuyOptions });

  it("ranks fixture inputs by best minus chosen", () => {
    const review = reviewMatch(blueprintMatch, engine);
    const costs = blueprintMatch.map((round) => {
      const rows = evaluateBuyOptions(round.state);
      expect(rows.map((row) => row.buy)).toEqual(["full", "force", "eco", "save"]);
      const best = Math.max(...rows.map((row) => row.expectedValue));
      const chosen = rows.find((row) => row.buy === round.chosenBuy);
      expect(chosen).toBeDefined();
      const freeze = evaluateFreeze(round.state);
      if (freeze.buy !== null) {
        const winners = rows.filter((row) => row.expectedValue === best);
        expect(winners).toHaveLength(1);
        expect(winners[0]?.buy).toBe(freeze.buy);
      }
      return {
        roundNumber: round.roundNumber,
        cost: leakCost(best, chosen!.expectedValue),
        regret: engineRegret(chosen!.expectedValue, best),
      };
    });

    for (const row of costs) {
      expect(row.regret).toBeCloseTo(-row.cost, 10);
    }

    const expected = costs
      .filter((row) => row.cost > 1e-9)
      .sort((a, b) => b.cost - a.cost || a.roundNumber - b.roundNumber)
      .slice(0, 3);

    expect(review.leaks.map((leak) => leak.roundNumber)).toEqual(expected.map((row) => row.roundNumber));
    expect(review.leaks.map((leak) => leak.evCost)).toEqual(expected.map((row) => row.cost));
    expect(review.source).toBe("engine");
    expect(EV_POINT_DOLLARS).toBe(500);
  });

  it("keeps evaluateFreeze as the recommendation, separate from the option table", () => {
    const round = blueprintMatch[0]!;
    const advice = engine.recommend(round.state);
    const freeze = evaluateFreeze(round.state);
    expect(advice.recommendation).toBe(freeze.buy);
    expect(advice.options).toBeUndefined();
  });
});
