import { asOptionList, isBuyClass, toFreezeSnapshot, type EngineBuyOption, type FreezeSnapshot } from "./economy-engine.js";
import type { PlayedRound } from "./review.js";

/**
 * Match file schema version 1.
 *
 * This is the document a GSI recording converter should emit, and the
 * document the review page parses. The post-match CLI also accepts the
 * older bare array of rounds. See MATCH_SCHEMA.md.
 *
 * Scoring reads `rounds` only. `label` and `map` are display metadata.
 * Unknown keys are ignored so a later field can be added without a version bump.
 */
export const MATCH_SCHEMA_VERSION = 1;

export type MatchFileErrorCode = "invalid-json" | "unsupported-schema" | "invalid-match";

export class MatchFileError extends Error {
  readonly code: MatchFileErrorCode;

  constructor(code: MatchFileErrorCode, message: string) {
    super(message);
    this.name = "MatchFileError";
    this.code = code;
  }
}

export interface MatchDocument {
  schemaVersion: typeof MATCH_SCHEMA_VERSION;
  /** Optional title. Not used when ranking buys. */
  label?: string;
  /** Optional map name, for example `de_mirage`. Not used when ranking buys. */
  map?: string;
  rounds: PlayedRound[];
}

export interface ParsedMatch {
  document: MatchDocument;
  /**
   * `document` is schema version 1.
   * `array` is the legacy list of rounds the CLI already accepted.
   */
  shape: "document" | "array";
  rounds: PlayedRound[];
}

/** Parse a match file from JSON text. Strips a leading BOM. */
export function parseMatchJson(text: string): ParsedMatch {
  const source = text.replace(/^\uFEFF/, "").trim();
  if (!source) {
    throw new MatchFileError("invalid-json", "Match file is empty.");
  }
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    throw new MatchFileError("invalid-json", "Match file is not valid JSON.");
  }
  return parseMatchFile(data);
}

/**
 * Parse a match file from already-decoded JSON.
 * Accepts a version 1 document or a legacy array of rounds.
 */
export function parseMatchFile(value: unknown): ParsedMatch {
  if (Array.isArray(value)) {
    const rounds = parseRounds(value);
    return {
      shape: "array",
      rounds,
      document: { schemaVersion: MATCH_SCHEMA_VERSION, rounds },
    };
  }
  if (!value || typeof value !== "object") {
    throw new MatchFileError(
      "invalid-match",
      "A match file is a versioned document or an array of rounds.",
    );
  }

  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== MATCH_SCHEMA_VERSION) {
    throw new MatchFileError(
      "unsupported-schema",
      `schemaVersion must be ${MATCH_SCHEMA_VERSION}. Got ${JSON.stringify(record.schemaVersion)}.`,
    );
  }
  if (!Array.isArray(record.rounds)) {
    throw new MatchFileError("invalid-match", "rounds must be an array.");
  }

  const rounds = parseRounds(record.rounds);
  const document: MatchDocument = { schemaVersion: MATCH_SCHEMA_VERSION, rounds };
  if (record.label !== undefined) document.label = requiredText(record.label, "label");
  if (record.map !== undefined) document.map = requiredText(record.map, "map");
  return { shape: "document", rounds, document };
}

function parseRounds(value: readonly unknown[]): PlayedRound[] {
  const rounds = value.map((entry, index) => parseRound(entry, index));
  const seen = new Set<number>();
  for (const round of rounds) {
    if (seen.has(round.roundNumber)) {
      throw new MatchFileError("invalid-match", `Round ${round.roundNumber} is listed more than once.`);
    }
    seen.add(round.roundNumber);
  }
  return rounds;
}

function parseRound(value: unknown, index: number): PlayedRound {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MatchFileError("invalid-match", `rounds[${index}] must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const where = `rounds[${index}]`;
  if (!Number.isInteger(record.roundNumber) || (record.roundNumber as number) < 1) {
    throw new MatchFileError("invalid-match", `${where}.roundNumber must be a positive integer.`);
  }
  if (record.winner !== "us" && record.winner !== "them") {
    throw new MatchFileError("invalid-match", `${where}.winner must be "us" or "them".`);
  }
  if (!isBuyClass(record.chosenBuy)) {
    throw new MatchFileError("invalid-match", `${where}.chosenBuy must be full, force, eco, or save.`);
  }

  const round: PlayedRound = {
    roundNumber: record.roundNumber as number,
    winner: record.winner,
    chosenBuy: record.chosenBuy,
  };

  if (record.state !== undefined) {
    const state = parseState(record.state, index);
    if (state.roundNumber !== round.roundNumber) {
      throw new MatchFileError(
        "invalid-match",
        `${where}.state.roundNumber must match roundNumber ${round.roundNumber}.`,
      );
    }
    round.state = state;
  }
  if (record.options !== undefined) {
    round.options = parseOptions(record.options, index, round.chosenBuy);
  }
  if (!round.state && !round.options) {
    throw new MatchFileError(
      "invalid-match",
      `${where} needs a freeze state or a logged options table.`,
    );
  }
  return round;
}

function parseState(value: unknown, index: number): FreezeSnapshot {
  try {
    return toFreezeSnapshot(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MatchFileError("invalid-match", `rounds[${index}].state: ${message}`);
  }
}

function parseOptions(
  value: unknown,
  index: number,
  chosenBuy: PlayedRound["chosenBuy"],
): EngineBuyOption[] {
  let options;
  try {
    options = asOptionList(value, `rounds[${index}].options`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MatchFileError("invalid-match", message);
  }
  if (!options.some((option) => option.buy === chosenBuy)) {
    throw new MatchFileError(
      "invalid-match",
      `rounds[${index}].options must include the played buy ${chosenBuy}.`,
    );
  }
  return options.map((option) => ({ buy: option.buy, expectedValue: option.expectedValue }));
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new MatchFileError("invalid-match", `${field} must be a non-empty string when present.`);
  }
  return value.trim();
}
