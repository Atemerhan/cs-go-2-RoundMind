import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGsiPayload } from './normalize.js';
import { ScoreHistory } from './score-history.js';
import type { GameState } from './types.js';

export interface MockGsiFeedOptions {
  /** Directory of recorded payloads. Defaults to this package's `fixtures/`. */
  fixturesDir?: string;
  /**
   * Skip payloads that are not freeze time. Default `true`, so UI and engine
   * work can replay buy-phase snapshots only.
   */
  freezeTimeOnly?: boolean;
}

/**
 * Replays recorded GSI JSON in filename order, sharing one {@link ScoreHistory}
 * so round outcomes accumulate the same way they would on the live listener.
 */
export class MockGsiFeed {
  readonly history = new ScoreHistory();
  private payloads: unknown[] = [];
  private index = 0;

  constructor(private readonly options: MockGsiFeedOptions = {}) {}

  /** Load fixtures from disk. Returns how many snapshots will be replayed. */
  async load(): Promise<number> {
    const dir = this.options.fixturesDir ?? defaultFixturesDir();
    const freezeOnly = this.options.freezeTimeOnly !== false;
    const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
    const payloads: unknown[] = [];

    for (const name of names) {
      const text = await readFile(path.join(dir, name), 'utf8');
      const payload: unknown = JSON.parse(text);
      if (freezeOnly && !isFreezeTimePayload(payload)) {
        continue;
      }
      payloads.push(payload);
    }

    this.payloads = payloads;
    this.index = 0;
    this.history.reset();
    return payloads.length;
  }

  /** Next snapshot, or `null` at the end. Call {@link load} first. */
  next(): GameState | null {
    const payload = this.payloads[this.index];
    if (payload === undefined) {
      return null;
    }
    this.index += 1;
    return normalizeGsiPayload(payload, this.history);
  }

  /** Replay every loaded snapshot from the start. */
  replay(): GameState[] {
    this.index = 0;
    this.history.reset();
    const states: GameState[] = [];
    for (;;) {
      const state = this.next();
      if (!state) {
        break;
      }
      states.push(state);
    }
    return states;
  }

  /**
   * Load (if needed) and walk the feed. `intervalMs` pauses between snapshots
   * so a UI can render them. `0` yields the whole sequence immediately.
   */
  async play(
    listener: (state: GameState) => void,
    intervalMs = 0,
  ): Promise<GameState[]> {
    if (this.payloads.length === 0) {
      await this.load();
    } else {
      this.index = 0;
      this.history.reset();
    }

    const states: GameState[] = [];
    for (;;) {
      const state = this.next();
      if (!state) {
        break;
      }
      states.push(state);
      listener(state);
      if (intervalMs > 0) {
        await delay(intervalMs);
      }
    }
    return states;
  }
}

/** Package `fixtures/` directory, valid both from `src/` (tsx) and `dist/`. */
export function defaultFixturesDir(): string {
  return fileURLToPath(new URL('../fixtures/', import.meta.url));
}

/** True when `round.phase` or `phase_countdowns.phase` is freeze time. */
export function isFreezeTimePayload(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  const round = asRecord(record.round);
  const countdown = asRecord(record.phase_countdowns);
  const roundPhase = typeof round?.phase === 'string' ? round.phase.toLowerCase() : '';
  const countdownPhase =
    typeof countdown?.phase === 'string' ? countdown.phase.toLowerCase() : '';
  return roundPhase === 'freezetime' || countdownPhase === 'freezetime';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
