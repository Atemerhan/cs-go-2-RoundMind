import { describe, expect, it } from "vitest";
import { GSI_PROXY_PATH, GSI_STATE_URL, fetchLiveBody, gameStateToFreeze } from "./gsi";

function response(body: unknown, ok = true) {
  return { ok, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) };
}

describe("live listener body", () => {
  it("reads the documented loopback /state URL when the dev proxy misses", async () => {
    const calls: string[] = [];
    const result = await fetchLiveBody(undefined, async (url) => {
      calls.push(url);
      if (url === GSI_PROXY_PATH) return response("nope", false);
      if (url === GSI_STATE_URL) return response(null);
      throw new Error(url);
    });
    expect(calls).toEqual([GSI_PROXY_PATH, GSI_STATE_URL]);
    expect(result).toEqual({ state: "payload", body: null });
  });

  it("stops at the same-origin proxy when that returns JSON", async () => {
    const calls: string[] = [];
    const result = await fetchLiveBody(undefined, async (url) => {
      calls.push(url);
      return response({ ok: true });
    });
    expect(calls).toEqual([GSI_PROXY_PATH]);
    expect(result.state).toBe("payload");
  });
});

describe("game state to freeze snapshot", () => {
  it("drops enemy cash and treats a pistol as not a primary", () => {
    const parsed = gameStateToFreeze({
      match: { round: 3 },
      round: { phase: "freezetime" },
      score: { ct: 0, t: 2, ctConsecutiveLosses: 2 },
      playerSide: "CT",
      economies: {
        CT: {
          players: [
            { steamId: "ct1", team: "CT", money: 1600, weapons: [{ name: "weapon_usp_silencer", type: "Pistol" }] },
            { steamId: "ct2", team: "CT", money: 1600, weapons: [{ name: "weapon_ak47", type: "Rifle" }] },
          ],
        },
        T: {
          players: [{ steamId: "t1", team: "T", money: 99999, weapons: [{ name: "weapon_ak47", type: "Rifle" }] }],
        },
      },
      recentRoundOutcomes: [
        { winner: "T", reason: "elimination" },
        { winner: "CT" },
        { winner: "T", reason: "time" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.ourSide).toBe("CT");
    expect(parsed.snapshot.ourPlayers).toEqual([
      { id: "ct1", cash: 1600, hasPrimary: false },
      { id: "ct2", cash: 1600, hasPrimary: true },
    ]);
    expect(JSON.stringify(parsed.snapshot)).not.toContain("99999");
    expect(parsed.snapshot.history).toEqual([{ winner: "T", reason: "elimination" }]);
    expect(parsed.snapshot.lossCount).toEqual({ CT: 2 });
    expect(parsed.snapshot.roundNumber).toBe(3);
  });

  it("prices the next round after the round ends", () => {
    const parsed = gameStateToFreeze({
      match: { round: 2 },
      round: { phase: "over" },
      score: { ct: 1, t: 1 },
      playerSide: "T",
      recentRoundOutcomes: [],
      economies: { T: { players: [{ money: 800, weapons: [] }] } },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.snapshot.roundNumber).toBe(3);
  });

  it("uses the manual side only when the payload has none", () => {
    const body = {
      match: { round: 1 },
      round: { phase: "freezetime" },
      score: { ct: 0, t: 0 },
      recentRoundOutcomes: [],
    };
    expect(gameStateToFreeze(body).ok).toBe(false);
    const parsed = gameStateToFreeze(body, { fallbackSide: "CT" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.usedFallbackSide).toBe(true);
    expect(parsed.snapshot.ourSide).toBe("CT");
  });

  it("treats null as a listener with no match yet", () => {
    expect(gameStateToFreeze(null)).toEqual({ ok: false, reason: "waiting" });
    expect(gameStateToFreeze({ provider: { name: "Counter-Strike 2" } })).toEqual({ ok: false, reason: "invalid" });
  });
});
