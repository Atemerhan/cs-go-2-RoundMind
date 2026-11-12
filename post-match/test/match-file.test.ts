import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateBuyOptions, evaluateFreeze } from "@roundmind/engine";
import { adaptEconomyEngine } from "../src/economy-engine.js";
import { blueprintMatch } from "../src/fixtures.js";
import { MATCH_SCHEMA_VERSION, MatchFileError, parseMatchFile, parseMatchJson } from "../src/match-file.js";
import { reviewMatch } from "../src/review.js";

const samplePath = new URL("../examples/match.json", import.meta.url);

function state(roundNumber = 1) {
  return {
    roundNumber,
    ourSide: "CT" as const,
    ourPlayers: [{ cash: 800, hasPrimary: false }],
    history: [],
  };
}

function round(overrides: Record<string, unknown> = {}) {
  return {
    roundNumber: 1,
    winner: "us",
    chosenBuy: "eco",
    state: state(),
    ...overrides,
  };
}

describe("parseMatchFile", () => {
  it("parses a version 1 document and ignores unknown keys", () => {
    const parsed = parseMatchFile({
      schemaVersion: 1,
      label: "  Mirage  ",
      map: "de_mirage",
      note: "ignored",
      rounds: [round()],
    });
    expect(parsed.shape).toBe("document");
    expect(parsed.document.schemaVersion).toBe(MATCH_SCHEMA_VERSION);
    expect(parsed.document.label).toBe("Mirage");
    expect(parsed.document.map).toBe("de_mirage");
    expect(parsed.rounds).toHaveLength(1);
    expect(parsed.rounds[0]?.state?.ourSide).toBe("CT");
  });

  it("parses the legacy bare array", () => {
    const parsed = parseMatchFile([round({ roundNumber: 2, state: state(2) })]);
    expect(parsed.shape).toBe("array");
    expect(parsed.document.schemaVersion).toBe(1);
    expect(parsed.rounds[0]?.roundNumber).toBe(2);
  });

  it("accepts a logged option table without a freeze snapshot", () => {
    const parsed = parseMatchFile({
      schemaVersion: 1,
      rounds: [
        {
          roundNumber: 4,
          winner: "them",
          chosenBuy: "full",
          options: [
            { buy: "full", expectedValue: 1 },
            { buy: "eco", expectedValue: 4 },
          ],
        },
      ],
    });
    expect(parsed.rounds[0]?.state).toBeUndefined();
    expect(parsed.rounds[0]?.options?.map((option) => option.buy)).toEqual(["full", "eco"]);
  });

  it("strips a BOM and parses the bundled sample against the blueprint", () => {
    const text = `\uFEFF${readFileSync(samplePath, "utf8")}`;
    const parsed = parseMatchJson(text);
    expect(parsed.shape).toBe("document");
    expect(parsed.document.label).toBe("Sample match");
    expect(parsed.rounds.map((round) => [round.roundNumber, round.chosenBuy, round.winner])).toEqual(
      blueprintMatch.map((round) => [round.roundNumber, round.chosenBuy, round.winner]),
    );
    expect(parsed.rounds.map((round) => round.state)).toEqual(blueprintMatch.map((round) => round.state));
  });

  it("rejects a newer schema version", () => {
    expect(() => parseMatchFile({ schemaVersion: 2, rounds: [] })).toThrow(MatchFileError);
    try {
      parseMatchFile({ schemaVersion: 2, rounds: [] });
    } catch (error) {
      expect(error).toBeInstanceOf(MatchFileError);
      expect((error as MatchFileError).code).toBe("unsupported-schema");
    }
  });

  it("rejects invalid JSON, empty input, and a missing version on an object", () => {
    expect(() => parseMatchJson("{")).toThrow(expect.objectContaining({ code: "invalid-json" }));
    expect(() => parseMatchJson("   ")).toThrow(expect.objectContaining({ code: "invalid-json" }));
    expect(() => parseMatchFile({ rounds: [] })).toThrow(expect.objectContaining({ code: "unsupported-schema" }));
    expect(() => parseMatchFile(null)).toThrow(expect.objectContaining({ code: "invalid-match" }));
  });

  it("rejects a round the engine cannot score", () => {
    expect(() => parseMatchFile({ schemaVersion: 1, rounds: [{ roundNumber: 1, winner: "us", chosenBuy: "eco" }] })).toThrow(
      /freeze state or a logged options/,
    );
    expect(() => parseMatchFile({ schemaVersion: 1, rounds: [round({ winner: "CT" })] })).toThrow(/winner/);
    expect(() => parseMatchFile({ schemaVersion: 1, rounds: [round({ chosenBuy: "awp" })] })).toThrow(/chosenBuy/);
    expect(() =>
      parseMatchFile({
        schemaVersion: 1,
        rounds: [round(), round({ roundNumber: 1 })],
      }),
    ).toThrow(/more than once/);
    expect(() => parseMatchFile({ schemaVersion: 1, label: "  ", rounds: [round()] })).toThrow(/label/);
  });

  it("rejects enemy cash and a snapshot whose round number disagrees", () => {
    expect(() =>
      parseMatchFile({
        schemaVersion: 1,
        rounds: [round({ state: { ...state(), enemyCash: 5000 } })],
      }),
    ).toThrow(/enemyCash/);
    expect(() =>
      parseMatchFile({
        schemaVersion: 1,
        rounds: [round({ state: state(3) })],
      }),
    ).toThrow(/state.roundNumber/);
  });

  it("rejects a logged table that omits the played buy", () => {
    expect(() =>
      parseMatchFile({
        schemaVersion: 1,
        rounds: [
          {
            roundNumber: 2,
            winner: "us",
            chosenBuy: "save",
            options: [{ buy: "eco", expectedValue: 1 }],
          },
        ],
      }),
    ).toThrow(/played buy save/);
  });

  it("reviews the sample through the existing leak ranker", () => {
    const parsed = parseMatchJson(readFileSync(samplePath, "utf8"));
    const engine = adaptEconomyEngine({ evaluateFreeze, evaluateBuyOptions });
    const review = reviewMatch(parsed.rounds, engine, { limit: parsed.rounds.length });
    const leaked = new Set(review.leaks.map((leak) => leak.roundNumber));
    expect(review.roundsConsidered).toBe(5);
    expect(leaked.has(5)).toBe(false);
    expect(leaked.has(7)).toBe(true);
    expect(review.leaks.find((leak) => leak.roundNumber === 7)?.betterBuy).toBe("save");
    expect(review.leaks[0]?.evCost).toBeGreaterThan(0);
  });
});
