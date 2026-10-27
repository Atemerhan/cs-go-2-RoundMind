import { ScoreHistory, type RoundSignals } from './score-history.js';
import type {
  BombState,
  BombStatus,
  GameState,
  MatchStructure,
  PlayerLoadout,
  RoundEndReason,
  RoundOutcome,
  RoundPhase,
  SurvivorCount,
  Side,
  TeamEconomy,
  WeaponSlot,
} from './types.js';

export class GsiNormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GsiNormalizeError';
  }
}

/**
 * MR12 regulation (12 rounds per half) plus MR3 overtime (3 rounds per half,
 * 6 rounds per overtime period). `round` is Valve's `map.round`.
 */
export function deriveMr12Structure(round: number): MatchStructure {
  const safe = Number.isFinite(round) ? Math.max(0, Math.trunc(round)) : 0;
  if (safe <= 12) {
    return { format: 'MR12', round: safe, half: 1, overtime: false };
  }
  if (safe <= 24) {
    return { format: 'MR12', round: safe, half: 2, overtime: false };
  }

  const otIndex = safe - 24;
  const overtimePeriod = Math.floor((otIndex - 1) / 6) + 1;
  const indexInPeriod = (otIndex - 1) % 6;
  const otHalf = indexInPeriod < 3 ? 1 : 2;
  const half = 2 + (overtimePeriod - 1) * 2 + otHalf;

  return {
    format: 'MR12',
    round: safe,
    half,
    overtime: true,
    overtimePeriod,
  };
}

/**
 * Turn one GSI JSON body into a {@link GameState}.
 *
 * Pass the same {@link ScoreHistory} for every payload in a match so round
 * outcomes can be derived when `map.round_wins` is missing. Position,
 * forward vectors, grenades, and the auth token are never copied.
 */
export function normalizeGsiPayload(payload: unknown, history?: ScoreHistory): GameState {
  if (!isRecord(payload)) {
    throw new GsiNormalizeError('GSI payload must be a JSON object');
  }

  const map = isRecord(payload.map) ? payload.map : undefined;
  const round = isRecord(payload.round) ? payload.round : undefined;
  const countdown = isRecord(payload.phase_countdowns) ? payload.phase_countdowns : undefined;
  const provider = isRecord(payload.provider) ? payload.provider : undefined;

  const ctTeam = isRecord(map?.team_ct) ? map.team_ct : undefined;
  const tTeam = isRecord(map?.team_t) ? map.team_t : undefined;
  const ct = readNonNegativeInt(ctTeam?.score) ?? 0;
  const t = readNonNegativeInt(tTeam?.score) ?? 0;
  const ctConsecutiveLosses = readNonNegativeInt(ctTeam?.consecutive_round_losses);
  const tConsecutiveLosses = readNonNegativeInt(tTeam?.consecutive_round_losses);

  const roundNumber = readNonNegativeInt(map?.round) ?? 0;
  const match = deriveMr12Structure(roundNumber);
  const bombObject = isRecord(payload.bomb) ? payload.bomb : undefined;
  const phase = resolvePhase(
    readString(map?.phase),
    readString(countdown?.phase),
    readString(round?.phase),
    readString(round?.bomb),
    readString(bombObject?.state),
  );
  const timeRemaining = readSeconds(countdown?.phase_ends_in);

  const economies = readEconomies(payload);
  const playerSide = readSide(isRecord(payload.player) ? payload.player.team : undefined);
  const bomb = readBomb(payload, round);
  const signals = readRoundSignals(payload, round, countdown, phase, timeRemaining);
  const recentRoundOutcomes = readOutcomes(map, history, ct, t, signals);

  const observedAt = readNonNegativeInt(provider?.timestamp);
  const mapName = readString(map?.name);
  const mapMode = readString(map?.mode);
  const mapPhase = readString(map?.phase);

  return {
    map: {
      ...(mapName ? { name: mapName } : {}),
      ...(mapMode ? { mode: mapMode } : {}),
      ...(mapPhase ? { phase: mapPhase } : {}),
    },
    match,
    round: {
      phase,
      ...(timeRemaining !== undefined ? { timeRemaining } : {}),
    },
    score: {
      ct,
      t,
      ...(ctConsecutiveLosses !== undefined ? { ctConsecutiveLosses } : {}),
      ...(tConsecutiveLosses !== undefined ? { tConsecutiveLosses } : {}),
    },
    ...(playerSide ? { playerSide } : {}),
    ...(economies ? { economies } : {}),
    ...(bomb ? { bomb } : {}),
    recentRoundOutcomes,
    ...(observedAt !== undefined ? { observedAt } : {}),
  };
}

function readOutcomes(
  map: Record<string, unknown> | undefined,
  history: ScoreHistory | undefined,
  ct: number,
  t: number,
  signals: RoundSignals,
): RoundOutcome[] {
  const fromWins = readRoundWins(map);
  if (fromWins !== undefined) {
    return history ? history.replace(fromWins, ct, t, signals) : fromWins;
  }
  if (history) {
    return history.observe(ct, t, signals);
  }
  return [];
}

const ROUND_WIN_REASONS: Record<string, { winner: Side; reason: RoundEndReason }> = {
  ct_win_elimination: { winner: 'CT', reason: 'elimination' },
  ct_win_defuse: { winner: 'CT', reason: 'bomb_defuse' },
  ct_win_time: { winner: 'CT', reason: 'time' },
  t_win_elimination: { winner: 'T', reason: 'elimination' },
  t_win_bomb: { winner: 'T', reason: 'bomb_explode' },
};

function mapRoundWin(reason: string): { winner: Side; reason?: RoundEndReason } | undefined {
  const known = ROUND_WIN_REASONS[reason];
  if (known) {
    return known;
  }
  if (reason.startsWith('ct_win')) {
    return { winner: 'CT' };
  }
  if (reason.startsWith('t_win')) {
    return { winner: 'T' };
  }
  return undefined;
}

function readRoundSignals(
  payload: Record<string, unknown>,
  round: Record<string, unknown> | undefined,
  countdown: Record<string, unknown> | undefined,
  phase: RoundPhase,
  timeRemaining: number | undefined,
): RoundSignals {
  const winTeam = readSide(round?.win_team);
  const bomb = readBombSignal(
    readString(round?.bomb),
    readString(isRecord(payload.bomb) ? payload.bomb.state : undefined),
  );
  const countdownPhase = readString(countdown?.phase)?.toLowerCase();
  const alive = phase === 'over' ? readFullTeamAlive(payload) : undefined;
  return {
    ...(winTeam ? { winTeam } : {}),
    ...(bomb ? { bomb } : {}),
    ...(alive ? { alive } : {}),
    ...(countdownPhase === 'live' && timeRemaining === 0 ? { clockExpired: true } : {}),
    ...(phase === 'over' ? { roundOver: true } : {}),
  };
}

function readBombSignal(
  roundBomb: string | undefined,
  bombState: string | undefined,
): RoundSignals['bomb'] | undefined {
  const values = [bombState, roundBomb].map((value) => value?.toLowerCase());
  if (values.includes('exploded')) {
    return 'exploded';
  }
  if (values.includes('defused')) {
    return 'defused';
  }
  if (values.includes('planted') || values.includes('defusing')) {
    return 'planted';
  }
  return undefined;
}

/** Alive counts only when GSI included five health values for that side. */
function readFullTeamAlive(payload: Record<string, unknown>): SurvivorCount | undefined {
  const health = new Map<string, { id: string; team: Side; health: number }>();

  if (isRecord(payload.allplayers)) {
    for (const [steamId, raw] of Object.entries(payload.allplayers)) {
      const sample = readHealth(steamId, raw);
      if (sample) {
        health.set(sample.id, sample);
      }
    }
  }
  if (isRecord(payload.player)) {
    const sample = readHealth(readString(payload.player.steamid), payload.player);
    if (sample && !health.has(sample.id)) {
      health.set(sample.id, sample);
    }
  }

  const alive: SurvivorCount = {};
  for (const side of ['CT', 'T'] as const) {
    const members = [...health.values()].filter((player) => player.team === side);
    if (members.length === 5) {
      alive[side] = members.filter((player) => player.health > 0).length;
    }
  }
  return alive.CT !== undefined || alive.T !== undefined ? alive : undefined;
}

function readHealth(
  steamId: string | undefined,
  raw: unknown,
): { id: string; team: Side; health: number } | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const team = readSide(raw.team);
  const state = isRecord(raw.state) ? raw.state : undefined;
  const hp = readNonNegativeInt(state?.health);
  if (!team || hp === undefined) {
    return undefined;
  }
  const id = steamId ?? readString(raw.steamid);
  if (!id) {
    return undefined;
  }
  return { id, team, health: hp };
}

function readRoundWins(map: Record<string, unknown> | undefined): RoundOutcome[] | undefined {
  if (!map || !Object.prototype.hasOwnProperty.call(map, 'round_wins')) {
    return undefined;
  }
  const raw = map.round_wins;
  if (!isRecord(raw)) {
    return undefined;
  }

  const keys = Object.keys(raw).sort((a, b) => Number(a) - Number(b));
  const outcomes: RoundOutcome[] = [];
  let ct = 0;
  let t = 0;

  for (const key of keys) {
    const reason = raw[key];
    const round = Number(key);
    if (!Number.isInteger(round) || round <= 0 || typeof reason !== 'string') {
      continue;
    }
    const mapped = mapRoundWin(reason);
    if (!mapped) {
      continue;
    }
    if (mapped.winner === 'CT') {
      ct += 1;
    } else {
      t += 1;
    }
    outcomes.push({
      round,
      winner: mapped.winner,
      ...(mapped.reason ? { reason: mapped.reason, gsiReason: reason } : { gsiReason: reason }),
      ctScore: ct,
      tScore: t,
    });
  }

  return outcomes;
}

function readEconomies(payload: Record<string, unknown>): GameState['economies'] | undefined {
  const byId = new Map<string, PlayerLoadout>();

  if (isRecord(payload.allplayers)) {
    for (const [steamId, raw] of Object.entries(payload.allplayers)) {
      const player = readPlayer(steamId, raw);
      if (player) {
        byId.set(player.steamId ?? steamId, player);
      }
    }
  }

  if (isRecord(payload.player)) {
    const focused = readPlayer(readString(payload.player.steamid), payload.player);
    if (focused) {
      const key = focused.steamId ?? `focused-${focused.team}`;
      const existing = byId.get(key);
      byId.set(key, existing ? mergePlayer(existing, focused) : focused);
    }
  }

  if (byId.size === 0) {
    return undefined;
  }

  const ct: PlayerLoadout[] = [];
  const t: PlayerLoadout[] = [];
  for (const player of [...byId.values()].sort(comparePlayers)) {
    if (player.team === 'CT') {
      ct.push(player);
    } else {
      t.push(player);
    }
  }

  const economies: NonNullable<GameState['economies']> = {};
  if (ct.length > 0) {
    economies.CT = summarizeTeam('CT', ct);
  }
  if (t.length > 0) {
    economies.T = summarizeTeam('T', t);
  }
  return economies.CT || economies.T ? economies : undefined;
}

function comparePlayers(a: PlayerLoadout, b: PlayerLoadout): number {
  return (a.steamId ?? a.name ?? '').localeCompare(b.steamId ?? b.name ?? '');
}

function mergePlayer(base: PlayerLoadout, extra: PlayerLoadout): PlayerLoadout {
  return {
    steamId: base.steamId ?? extra.steamId,
    ...(base.name || extra.name ? { name: base.name ?? extra.name } : {}),
    team: base.team,
    ...(base.money !== undefined || extra.money !== undefined
      ? { money: base.money ?? extra.money }
      : {}),
    ...(base.equipmentValue !== undefined || extra.equipmentValue !== undefined
      ? { equipmentValue: base.equipmentValue ?? extra.equipmentValue }
      : {}),
    ...(base.helmet !== undefined || extra.helmet !== undefined
      ? { helmet: base.helmet ?? extra.helmet }
      : {}),
    ...(base.armor !== undefined || extra.armor !== undefined
      ? { armor: base.armor ?? extra.armor }
      : {}),
    ...(base.defuseKit !== undefined || extra.defuseKit !== undefined
      ? { defuseKit: base.defuseKit ?? extra.defuseKit }
      : {}),
    weapons: base.weapons.length > 0 ? base.weapons : extra.weapons,
  };
}

function summarizeTeam(side: Side, players: PlayerLoadout[]): TeamEconomy {
  const withMoney = players.filter((player) => player.money !== undefined);
  const withEquipment = players.filter((player) => player.equipmentValue !== undefined);
  return {
    side,
    players,
    ...(withMoney.length > 0
      ? {
          totalMoney: withMoney.reduce((sum, player) => sum + (player.money ?? 0), 0),
          moneySamples: withMoney.length,
        }
      : {}),
    ...(withEquipment.length > 0
      ? {
          totalEquipmentValue: withEquipment.reduce(
            (sum, player) => sum + (player.equipmentValue ?? 0),
            0,
          ),
          equipmentSamples: withEquipment.length,
        }
      : {}),
  };
}

/**
 * Read money, equipment, and weapons. `position` and `forward` are ignored
 * even when a spectator payload includes them.
 */
function readPlayer(steamId: string | undefined, raw: unknown): PlayerLoadout | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const team = readSide(raw.team);
  if (!team) {
    return undefined;
  }
  const state = isRecord(raw.state) ? raw.state : undefined;
  const money = readNonNegativeInt(state?.money);
  const equipmentValue = readNonNegativeInt(state?.equip_value);
  const armor = readNonNegativeInt(state?.armor);
  const helmet = typeof state?.helmet === 'boolean' ? state.helmet : undefined;
  const defuseKit = typeof state?.defusekit === 'boolean' ? state.defusekit : undefined;
  const name = readString(raw.name);
  const id = steamId ?? readString(raw.steamid);

  return {
    ...(id ? { steamId: id } : {}),
    ...(name ? { name } : {}),
    team,
    ...(money !== undefined ? { money } : {}),
    ...(equipmentValue !== undefined ? { equipmentValue } : {}),
    ...(helmet !== undefined ? { helmet } : {}),
    ...(armor !== undefined ? { armor } : {}),
    ...(defuseKit !== undefined ? { defuseKit } : {}),
    weapons: readWeapons(raw.weapons),
  };
}

function readWeapons(raw: unknown): WeaponSlot[] {
  if (!isRecord(raw)) {
    return [];
  }
  const slots: WeaponSlot[] = [];
  for (const key of Object.keys(raw).sort()) {
    const slot = raw[key];
    if (!isRecord(slot)) {
      continue;
    }
    const name = readString(slot.name);
    if (!name) {
      continue;
    }
    const type = readString(slot.type);
    const state = readString(slot.state);
    slots.push({
      name,
      ...(type ? { type } : {}),
      ...(state ? { state } : {}),
    });
  }
  return slots;
}

function readBomb(
  payload: Record<string, unknown>,
  round: Record<string, unknown> | undefined,
): BombState | undefined {
  const bomb = isRecord(payload.bomb) ? payload.bomb : undefined;
  const status = normalizeBombStatus(readString(bomb?.state) ?? readString(round?.bomb));
  if (!status) {
    return undefined;
  }
  const playerSteamId = readString(bomb?.player);
  const countdown = readSeconds(bomb?.countdown);
  return {
    status,
    ...(playerSteamId ? { playerSteamId } : {}),
    ...(countdown !== undefined ? { countdown } : {}),
  };
}

function normalizeBombStatus(value: string | undefined): BombStatus | undefined {
  switch (value?.toLowerCase()) {
    case 'carried':
    case 'dropped':
    case 'planting':
    case 'planted':
    case 'defusing':
    case 'defused':
    case 'exploded':
      return value.toLowerCase() as BombStatus;
    default:
      return undefined;
  }
}

function resolvePhase(
  mapPhase: string | undefined,
  countdownPhase: string | undefined,
  roundPhase: string | undefined,
  roundBomb: string | undefined,
  bombState: string | undefined,
): RoundPhase {
  const mapToken = mapPhase?.toLowerCase();
  if (mapToken === 'gameover') {
    return 'gameover';
  }
  if (mapToken === 'intermission') {
    return 'halftime';
  }

  const countdown = mapPhaseToken(countdownPhase);
  const fromRound = mapPhaseToken(roundPhase);
  const bombFlag = (bombState ?? roundBomb)?.toLowerCase();

  if (countdown === 'defuse' || bombFlag === 'defusing') {
    return 'defuse';
  }

  const planted =
    countdown === 'bomb' || bombFlag === 'planted' || roundBomb?.toLowerCase() === 'planted';
  const clockOwnsThePhase =
    countdown === 'freezetime' ||
    countdown === 'timeout' ||
    countdown === 'paused' ||
    countdown === 'over' ||
    countdown === 'warmup' ||
    countdown === 'halftime' ||
    countdown === 'gameover';

  if (planted && !clockOwnsThePhase) {
    return 'bomb';
  }
  if (countdown) {
    return countdown;
  }
  if (fromRound) {
    return fromRound;
  }
  if (mapToken === 'warmup') {
    return 'warmup';
  }
  return 'unknown';
}

function mapPhaseToken(value: string | undefined): RoundPhase | undefined {
  switch (value?.toLowerCase()) {
    case 'freezetime':
    case 'freeze_time':
      return 'freezetime';
    case 'live':
      return 'live';
    case 'bomb':
      return 'bomb';
    case 'defuse':
    case 'defusing':
      return 'defuse';
    case 'over':
      return 'over';
    case 'warmup':
      return 'warmup';
    case 'intermission':
    case 'halftime':
      return 'halftime';
    case 'timeout':
    case 'timeout_t':
    case 'timeout_ct':
      return 'timeout';
    case 'paused':
      return 'paused';
    case 'gameover':
      return 'gameover';
    default:
      return undefined;
  }
}

function readSide(value: unknown): Side | undefined {
  if (value === 'CT' || value === 'T') {
    return value;
  }
  if (typeof value === 'string') {
    const upper = value.toUpperCase();
    if (upper === 'CT' || upper === 'T') {
      return upper;
    }
  }
  return undefined;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.trunc(value);
}

function readSeconds(value: unknown): number | undefined {
  const numeric =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return numeric;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
