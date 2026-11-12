import { hasPrimaryWeapon, toFreezeSnapshot, type FreezeSnapshot } from './freeze-snapshot.js';
import { inferChosenBuy, type BuyClass, type RosterSample } from './infer-buy.js';
import { GsiNormalizeError, normalizeGsiPayload } from './normalize.js';
import { RecordingError, type GsiRecordingLine } from './record.js';
import { ScoreHistory } from './score-history.js';
import type { GameState, RoundPhase, Side } from './types.js';

/**
 * One round inside a schema v1 match file.
 * `state` is the own-side pre-buy snapshot from the first freeze of that round.
 */
export interface ConvertedRound {
  roundNumber: number;
  chosenBuy: BuyClass;
  winner: 'us' | 'them';
  state: FreezeSnapshot;
}

/**
 * Match file schema version 1, the document the review UI parses.
 * See post-match/MATCH_SCHEMA.md on the review-UI branch. `map` is display
 * metadata. Scoring reads `rounds` only.
 */
export interface MatchDocument {
  schemaVersion: 1;
  map?: string;
  rounds: ConvertedRound[];
}

export interface ConvertOptions {
  /**
   * Used only when the freeze payload has no focused `player.team` and the
   * remembered steam id is not in `allplayers`. A known team always wins,
   * including the side after halftime.
   */
  ourSide?: Side;
  /** Premier is `1` (default). Repeated overtime is `0`. */
  overtimeLimit?: 0 | 1;
}

interface TrackedRound {
  roundNumber: number;
  state: FreezeSnapshot;
  pre: RosterSample[];
  post?: RosterSample[];
  scoreAtOpen: { ct: number; t: number };
}

interface Peek {
  mapName?: string;
  mapPhase?: string;
  roundPhase?: string;
  countdownPhase?: string;
  round: number;
  ct?: number;
  t?: number;
  hasScore: boolean;
}

/**
 * Replay a recording into post-match rounds.
 *
 * The pre-buy snapshot is the first `freezetime` of the round. The buy is
 * inferred from the last later freeze, or from a `live` / `bomb` / `defuse`
 * payload. Round-over cash is not a buy sample: the round reward is already
 * in it. Warmup, round 0, and payloads with no team scores are ignored.
 * A repeated freeze does not replace the pre-buy snapshot. A lower round
 * number, or a score drop that is not a new round 1, is a stale reconnect
 * packet and is ignored. A map change, or a score drop on round 1, starts
 * a new match and only that later match is returned. A round with no freeze
 * snapshot or no winner is omitted. The result is match schema v1.
 */
export function convertRecording(
  entries: readonly GsiRecordingLine[],
  options: ConvertOptions = {},
): MatchDocument {
  const overtimeLimit = options.overtimeLimit ?? 1;
  if (overtimeLimit !== 0 && overtimeLimit !== 1) {
    throw new RecordingError('overtimeLimit must be 1 (Premier) or 0 (repeated overtime).');
  }

  const history = new ScoreHistory();
  const open = new Map<number, TrackedRound>();
  const finished: ConvertedRound[] = [];
  const done = new Set<number>();
  let mapName: string | undefined;
  let ct: number | undefined;
  let t: number | undefined;
  let highest = 0;
  let steamId: string | undefined;

  const reset = (): void => {
    history.reset();
    open.clear();
    finished.length = 0;
    done.clear();
    highest = 0;
    ct = undefined;
    t = undefined;
    mapName = undefined;
  };

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    steamId = rememberSteam(entry.payload, steamId);
    const peek = peekPayload(entry.payload);
    if (!peek?.hasScore || isWarmup(peek) || peek.round < 1) {
      continue;
    }
    const nextCt = peek.ct;
    const nextT = peek.t;
    if (nextCt === undefined || nextT === undefined) {
      continue;
    }

    const mapChanged = Boolean(mapName && peek.mapName && mapName !== peek.mapName);
    const scoreDropped = ct !== undefined && t !== undefined && (nextCt < ct || nextT < t);
    if (mapChanged || (scoreDropped && peek.round <= 1)) {
      reset();
    } else if (scoreDropped || (highest > 0 && peek.round < highest)) {
      continue;
    }

    let state: GameState;
    try {
      state = normalizeGsiPayload(entry.payload, history);
    } catch (error) {
      if (error instanceof GsiNormalizeError) {
        throw new RecordingError(`Recording entry ${index + 1}: ${error.message}`);
      }
      throw error;
    }

    const phase = state.round.phase;
    const round = state.match.round;
    const side = resolveSide(state, steamId, options.ourSide);

    if (phase === 'freezetime' && round >= 1 && side && !open.has(round) && !done.has(round)) {
      open.set(round, {
        roundNumber: round,
        state: toFreezeSnapshot(state, { ourSide: side, overtimeLimit }),
        pre: samples(state, side),
        scoreAtOpen: { ct: state.score.ct, t: state.score.t },
      });
    } else if (open.has(round) && isPostBuyPhase(phase)) {
      const tracked = open.get(round);
      if (tracked) {
        const sample = samples(state, tracked.state.ourSide);
        if (sample.some((player) => player.cash !== undefined)) {
          tracked.post = sample;
        }
      }
    }

    for (const tracked of [...open.values()]) {
      const winningSide = decideWinner(tracked, state, phase, round);
      if (!winningSide) {
        continue;
      }
      finished.push({
        roundNumber: tracked.roundNumber,
        chosenBuy: inferChosenBuy(
          tracked.roundNumber,
          tracked.state.ourSide,
          tracked.pre,
          tracked.post,
        ),
        winner: winningSide === tracked.state.ourSide ? 'us' : 'them',
        state: tracked.state,
      });
      open.delete(tracked.roundNumber);
      done.add(tracked.roundNumber);
    }

    if (peek.mapName) {
      mapName = peek.mapName;
    }
    ct = nextCt;
    t = nextT;
    if (round > highest) {
      highest = round;
    }
  }

  const rounds = finished.sort((left, right) => left.roundNumber - right.roundNumber);
  return {
    schemaVersion: 1,
    ...(mapName ? { map: mapName } : {}),
    rounds,
  };
}

function decideWinner(
  tracked: TrackedRound,
  state: GameState,
  phase: RoundPhase,
  currentRound: number,
): Side | undefined {
  const advanced = currentRound > tracked.roundNumber;
  const terminal =
    currentRound === tracked.roundNumber &&
    (phase === 'over' || phase === 'gameover' || phase === 'halftime');
  if (!advanced && !terminal) {
    return undefined;
  }

  const listed = state.recentRoundOutcomes.find((outcome) => outcome.round === tracked.roundNumber);
  if (listed) {
    return listed.winner;
  }

  const ctDelta = state.score.ct - tracked.scoreAtOpen.ct;
  const tDelta = state.score.t - tracked.scoreAtOpen.t;
  if (ctDelta < 0 || tDelta < 0 || ctDelta + tDelta !== 1) {
    return undefined;
  }
  return ctDelta === 1 ? 'CT' : 'T';
}

function isPostBuyPhase(phase: RoundPhase): boolean {
  return phase === 'freezetime' || phase === 'live' || phase === 'bomb' || phase === 'defuse';
}

function samples(state: GameState, side: Side): RosterSample[] {
  const players = state.economies?.[side]?.players ?? [];
  return players.map((player, index) => ({
    id: player.steamId ?? player.name ?? `player-${index + 1}`,
    ...(player.money !== undefined ? { cash: player.money } : {}),
    hasPrimary: hasPrimaryWeapon(player.weapons),
    ...(player.equipmentValue !== undefined ? { equipmentValue: player.equipmentValue } : {}),
    weaponsKnown: player.weapons.length > 0,
  }));
}

function resolveSide(state: GameState, steamId: string | undefined, fallback: Side | undefined): Side | undefined {
  if (state.playerSide) {
    return state.playerSide;
  }
  if (steamId) {
    for (const side of ['CT', 'T'] as const) {
      const roster = state.economies?.[side]?.players ?? [];
      if (roster.some((player) => player.steamId === steamId)) {
        return side;
      }
    }
  }
  return fallback;
}

function rememberSteam(payload: unknown, current: string | undefined): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.player)) {
    return current;
  }
  const id = payload.player.steamid;
  if (typeof id !== 'string') {
    return current;
  }
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : current;
}

function peekPayload(payload: unknown): Peek | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const map = isRecord(payload.map) ? payload.map : undefined;
  const round = isRecord(payload.round) ? payload.round : undefined;
  const countdown = isRecord(payload.phase_countdowns) ? payload.phase_countdowns : undefined;
  const ctTeam = map && isRecord(map.team_ct) ? map.team_ct : undefined;
  const tTeam = map && isRecord(map.team_t) ? map.team_t : undefined;
  const ct = readScore(ctTeam?.score);
  const t = readScore(tTeam?.score);
  return {
    ...(readString(map?.name) ? { mapName: readString(map?.name) } : {}),
    ...(readString(map?.phase) ? { mapPhase: readString(map?.phase) } : {}),
    ...(readString(round?.phase) ? { roundPhase: readString(round?.phase) } : {}),
    ...(readString(countdown?.phase) ? { countdownPhase: readString(countdown?.phase) } : {}),
    round: readScore(map?.round) ?? 0,
    ...(ct !== undefined ? { ct } : {}),
    ...(t !== undefined ? { t } : {}),
    hasScore: ct !== undefined && t !== undefined,
  };
}

function isWarmup(peek: Peek): boolean {
  return [peek.mapPhase, peek.roundPhase, peek.countdownPhase].some((phase) => phase?.toLowerCase() === 'warmup');
}

function readScore(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.trunc(value);
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
