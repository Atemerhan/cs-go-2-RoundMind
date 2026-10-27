import { describe, expect, it } from "vitest";
import {
  CASH_FLOOR,
  KILL_REWARDS,
  LOSS_COUNT_STORAGE_CAPPED,
  MAX_MONEY,
  PLANT_TEAM_AWARD,
  PRICES,
  RULE_CATALOG,
  START_MONEY,
  TIMEOUT_SURVIVOR_FORFEIT_IS_FACT,
  WIN_BOMB_EXPLODE,
  evaluateFreeze,
  lossBonusForCount,
  matchState,
  nextLossCount,
  projectEconomy,
  rulesByVerification,
} from "./index.js";
import { ecoSnapshot, forceSnapshot, fullSnapshot, overtimeSnapshot, pistolSnapshot, saveSnapshot } from "./presets.js";
import { rosterOf } from "./recommend.js";

describe("loss bonus", () => {
  it("pays the count on the way in, then steps it", () => {
    expect(lossBonusForCount(0)).toBe(1400);
    expect(lossBonusForCount(1)).toBe(1900);
    expect(lossBonusForCount(2)).toBe(2400);
    expect(lossBonusForCount(3)).toBe(2900);
    expect(lossBonusForCount(4)).toBe(3400);
    expect(lossBonusForCount(9)).toBe(3400);
  });

  it("does not reset to the floor after a win", () => {
    expect(nextLossCount(4, true)).toBe(3);
    expect(lossBonusForCount(nextLossCount(4, true))).toBe(2900);
  });

  it("does not drop a deep streak by $500 after one win", () => {
    expect(LOSS_COUNT_STORAGE_CAPPED.value).toBe(false);
    let count = 1;
    for (let loss = 0; loss < 6; loss += 1) count = nextLossCount(count, false);
    expect(count).toBe(7);
    expect(lossBonusForCount(count)).toBe(3400);
    count = nextLossCount(count, true);
    expect(count).toBe(6);
    expect(lossBonusForCount(count)).toBe(3400);
  });

  it("pays $1900 for the pistol loss", () => {
    const projected = projectEconomy(
      [{ winner: "CT", reason: "elimination" }],
      2,
    );
    expect(projected.T.lossCount).toBe(2);
    expect(projected.T.low[0]).toBe(1900);
    expect(lossBonusForCount(1)).toBe(1900);
  });
});

describe("round awards", () => {
  it("pays detonation $3500 plus $300 to the planter and no $600", () => {
    const projected = projectEconomy(
      [{ winner: "T", reason: "bomb_explode", bombPlanted: true, killRewardTotal: { T: 0, CT: 0 } }],
      2,
    );
    const team = projected.T.low.reduce((sum, cash) => sum + cash, 0);
    expect(team).toBe(WIN_BOMB_EXPLODE.value * 5 + 300);
    expect(team).not.toBe(WIN_BOMB_EXPLODE.value * 5 + PLANT_TEAM_AWARD.value * 5 + 300);
    expect(Math.max(...projected.T.low) - Math.min(...projected.T.low)).toBe(300);
  });

  it("pays each Terrorist $600 when the plant is defused, and $300 to the defuser", () => {
    const projected = projectEconomy(
      [{ winner: "CT", reason: "bomb_defuse", killRewardTotal: { T: 0, CT: 0 } }],
      2,
    );
    const terrorists = projected.T.low.reduce((sum, cash) => sum + cash, 0);
    expect(terrorists).toBe(1900 * 5 + 600 * 5 + 300);
    const cts = projected.CT.low;
    expect(Math.max(...cts) - Math.min(...cts)).toBe(300);
    expect(Math.min(...cts)).toBe(3500);
  });

  it("pays each CT $50 per dead T and does not pay Terrorists the same", () => {
    const projected = projectEconomy(
      [{ winner: "CT", reason: "elimination", killRewardTotal: { T: 0, CT: 0 } }],
      2,
    );
    expect(projected.CT.low[1]).toBe(3250 + 250);
    expect(projected.T.low[0]).toBe(1900);
  });

  it("caps a player at $16000 and floors penalties at $0", () => {
    const projected = projectEconomy(
      [{ winner: "T", reason: "elimination", killRewardTotal: { T: 100_000, CT: 0 } }],
      2,
    );
    expect(Math.max(...projected.T.low)).toBe(MAX_MONEY.value);
    expect(CASH_FLOOR.value).toBe(0);
    const penalized = projectEconomy(
      [{ winner: "T", reason: "elimination", teamKills: { T: 8 }, killRewardTotal: { T: 0, CT: 0 } }],
      2,
    );
    expect(Math.min(...penalized.T.low)).toBeGreaterThanOrEqual(0);
  });
});

describe("match structure", () => {
  it("resets money and the loss count at the regulation half", () => {
    const history = Array.from({ length: 12 }, () => ({
      winner: "CT" as const,
      reason: "elimination" as const,
    }));
    const projected = projectEconomy(history, 13);
    expect(projected.T.low.every((cash) => cash === START_MONEY.value)).toBe(true);
    expect(projected.T.lossCount).toBe(1);
    expect(projected.CT.lossCount).toBe(1);
  });

  it("replaces overtime cash with $10000 and keeps the loss count", () => {
    const advice = evaluateFreeze(overtimeSnapshot());
    const projected = projectEconomy(overtimeSnapshot().history, 25);
    expect(projected.T.low.every((cash) => cash === 10_000)).toBe(true);
    expect(projected.CT.low.every((cash) => cash === 10_000)).toBe(true);
    expect(projected.T.lossCount).toBe(13);
    expect(projected.CT.lossCount).toBe(0);
    expect(advice.buy).toBe("full");
    expect(advice.reason.code).toBe("overtime_full");
    expect(advice.warnings).toContain("overtime_loss_count_unverified");
  });

  it("draws Premier 15-15 and keeps a Major overtime alive", () => {
    expect(matchState({ T: 13, CT: 0 })).toBe("regulation_win");
    expect(matchState({ T: 12, CT: 11 })).toBe("live");
    expect(matchState({ T: 13, CT: 11 })).toBe("regulation_win");
    expect(matchState({ T: 12, CT: 12 })).toBe("live");
    expect(matchState({ T: 16, CT: 12 })).toBe("overtime_win");
    expect(matchState({ T: 15, CT: 14 })).toBe("live");
    expect(matchState({ T: 15, CT: 15 }, 1)).toBe("draw");
    expect(matchState({ T: 15, CT: 15 }, 0)).toBe("live");
  });
});

describe("save and enemy band", () => {
  it("does not treat the timeout forfeit as a fact", () => {
    expect(TIMEOUT_SURVIVOR_FORFEIT_IS_FACT.value).toBe(false);
    const time = projectEconomy(
      [{ winner: "CT", reason: "time", killRewardTotal: { T: 0, CT: 0 } }],
      2,
    );
    const eliminated = projectEconomy(
      [{ winner: "CT", reason: "elimination", killRewardTotal: { T: 0, CT: 0 } }],
      2,
    );
    const timeGap = Math.max(...time.T.high) - Math.min(...time.T.low);
    const elimGap = Math.max(...eliminated.T.high) - Math.min(...eliminated.T.low);
    expect(Math.min(...time.T.low)).toBe(0);
    expect(Math.max(...time.T.high)).toBeGreaterThan(1900);
    expect(timeGap).toBeGreaterThan(elimGap);
    expect(time.assumptions).toContain("unverified_timeout_income");
  });

  it("saves a held rifle instead of forcing for an unverified bonus", () => {
    const advice = evaluateFreeze(saveSnapshot());
    expect(advice.buy).toBe("save");
    expect(advice.reason.code).toBe("save_hold");
    expect(advice.our.timeoutIncome).toBe("unverified");
    expect(advice.our.lossBonusIfLose).toBeGreaterThan(PRICES.ak47);
  });
});

describe("buy calls", () => {
  it("recommends the four classes on the presets", () => {
    const pistol = evaluateFreeze(pistolSnapshot());
    expect(pistol.buy).toBe("full");
    expect(pistol.reason.code).toBe("pistol_full");
    expect(pistol.enemy.poorerBuy).toBe("full");
    expect(pistol.enemy.richerBuy).toBe("full");
    expect(evaluateFreeze(ecoSnapshot()).buy).toBe("eco");
    expect(evaluateFreeze(fullSnapshot()).buy).toBe("full");
    expect(evaluateFreeze(forceSnapshot()).buy).toBe("force");
    expect(evaluateFreeze(saveSnapshot()).buy).toBe("save");
  });

  it("ends the call when the match is over", () => {
    const advice = evaluateFreeze({
      roundNumber: 14,
      ourSide: "T",
      ourPlayers: rosterOf(5000, false),
      history: Array.from({ length: 13 }, () => ({ winner: "T" as const, reason: "elimination" as const })),
    });
    expect(advice.live).toBe(false);
    expect(advice.buy).toBeNull();
    expect(advice.reason.code).toBe("match_over");
  });
});

describe("rule catalog", () => {
  it("marks plant, detonation, and kill awards verified, and leaves the open questions unverified", () => {
    const byId = new Map(RULE_CATALOG.map((entry) => [entry.id, entry]));
    expect(byId.get("objective.plant_personal")).toMatchObject({ value: 300, verification: "verified" });
    expect(byId.get("objective.plant_team_if_defused")).toMatchObject({ value: 600, verification: "verified" });
    expect(byId.get("round_win.bomb_detonation")).toMatchObject({ value: 3500, verification: "verified" });
    expect(byId.get("money.start")).toMatchObject({ value: 800, verification: "verified" });
    expect(byId.get("money.cap")).toMatchObject({ value: 16000, verification: "verified" });
    expect(byId.get("kill.awp")).toMatchObject({ value: 100, verification: "verified" });
    expect(byId.get("kill.xm1014")).toMatchObject({ value: 600, verification: "verified" });
    expect(byId.get("kill.cz75")).toMatchObject({ value: 300, verification: "verified" });
    expect(byId.get("kill.zeus")).toMatchObject({ value: 100, verification: "verified" });
    expect(byId.get("kill.p90")).toMatchObject({ value: 300, verification: "verified" });
    expect(KILL_REWARDS.grenade.value).toBe(300);
    for (const id of [
      "loss_bonus.deep_streak_cap",
      "overtime.loss_count_reset",
      "save.who_loses_income_on_timeout",
      "kill.t_team_award_per_dead_ct",
      "money.floor",
      "objective.plant_award_timing",
    ]) {
      expect(byId.get(id)?.verification, id).toBe("unverified");
    }
    expect(rulesByVerification("unverified").length).toBeGreaterThan(0);
    expect(PRICES.ak47).toBe(2700);
    expect(PRICES.m4a4).toBe(2900);
    expect(PRICES.helmet).toBe(1000);
  });
});
