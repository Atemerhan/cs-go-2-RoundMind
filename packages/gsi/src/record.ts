import { appendFileSync } from 'node:fs';

/**
 * JSONL recording of accepted GSI posts.
 *
 * Version 1. One object per line:
 * `{ "v": 1, "receivedAt": "<ISO-8601 UTC>", "payload": { ... } }`.
 * `payload` is the body CS2 posted after auth succeeded and normalize
 * accepted it, minus the fields this listener never keeps.
 */

const DROPPED_KEYS = new Set([
  'auth',
  'previously',
  'position',
  'forward',
  'allgrenades',
  'grenades',
  'player_position',
  'allplayers_position',
]);

export class RecordingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingError';
  }
}

export interface GsiRecordingLine {
  /** Format version. Readers reject any value other than `1`. */
  v: 1;
  /** When the listener accepted the POST. Not `provider.timestamp`. */
  receivedAt: string;
  /** Sanitized GSI object. */
  payload: Record<string, unknown>;
}

/**
 * Copy a GSI body without the auth token, previous-state deltas, world
 * positions, facing vectors, or grenade feeds. Other fields are kept as
 * received, including money, weapons, scores, and `map.round_wins`.
 */
export function sanitizeRecordedPayload(payload: unknown): unknown {
  return stripValue(payload);
}

/** Append one accepted payload. Creates the file. Does not rewrite earlier lines. */
export function appendRecordingLine(file: string, payload: unknown, receivedAt: Date): void {
  if (Number.isNaN(receivedAt.getTime())) {
    throw new RecordingError('receivedAt must be a valid time.');
  }
  const sanitized = sanitizeRecordedPayload(payload);
  if (!isRecord(sanitized)) {
    throw new RecordingError('GSI payload must be a JSON object.');
  }
  const line: GsiRecordingLine = {
    v: 1,
    receivedAt: receivedAt.toISOString(),
    payload: sanitized,
  };
  appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8');
}

/** Parse a version-1 JSONL recording. Blank lines are ignored. */
export function readRecording(text: string): GsiRecordingLine[] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = source.split(/\r?\n/);
  const entries: GsiRecordingLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]?.trim() ?? '';
    if (raw.length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new RecordingError(`Line ${index + 1} is not valid JSON.`);
    }
    entries.push(asRecordingLine(parsed, index + 1));
  }

  return entries;
}

function asRecordingLine(value: unknown, line: number): GsiRecordingLine {
  if (!isRecord(value)) {
    throw new RecordingError(`Line ${line} must be a JSON object.`);
  }
  if (value.v !== 1) {
    throw new RecordingError(`Line ${line} has recording version ${String(value.v)}. Only version 1 is supported.`);
  }
  if (typeof value.receivedAt !== 'string' || !Number.isFinite(Date.parse(value.receivedAt))) {
    throw new RecordingError(`Line ${line} needs an ISO-8601 receivedAt timestamp.`);
  }
  if (!isRecord(value.payload)) {
    throw new RecordingError(`Line ${line} payload must be a JSON object.`);
  }
  return {
    v: 1,
    receivedAt: value.receivedAt,
    payload: value.payload,
  };
}

function stripValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripValue(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (DROPPED_KEYS.has(key.toLowerCase())) {
      continue;
    }
    copy[key] = stripValue(child);
  }
  return copy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
