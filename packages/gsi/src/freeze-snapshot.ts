import type { GameState, RoundEndReason, RoundOutcome, Side, WeaponSlot } from './types.js';

/**
 * Input for `evaluateFreeze` in `@roundmind/engine`.
 * Field names match that package. This module does not implement the buy call.
 * Enemy cash is not a field.
 */
export interface PlayerSnapshot {
  /** Stable id, usually the SteamID64 GSI sent. */
  id: string;
  /** Cash this player is holding at freeze, before this round's purchases. */
  cash: number;
  /** Rifle, SMG, shotgun, sniper, or machine gun still in the loadout. Pistols do not count. */
  hasPrimary: boolean;
  /** `equip_value` from GSI when Valve sent it. Not a price-list calculation. */
  equipmentValue?: number;
}

export interface CompletedRound {
  winner: Side;
  reason: RoundEndReason;
  /** Set only when this listener saw a plant. Omitted means unknown, not "no plant". */
  bombPlanted?: boolean;
  /** Omit a side whose five health values were not in the round-end payload. */
  alive?: Partial<Record<Side, number>>;
}

export interface FreezeSnapshot {
  /** 1-based round that is about to be played. */
  roundNumber: number;
  ourSide: Side;
  /**
   * `1` is Premier: one overtime block. `0` repeats overtime.
   * GSI does not say which format is running; the default here is Premier.
   */
  overtimeLimit: 0 | 1;
  /** Own-team players whose cash GSI actually sent. Never the other side. */
  ourPlayers: PlayerSnapshot[];
  /**
   * Completed rounds, oldest first, with no holes.
   * Stops at the first outcome that has a winner but no reason, because the
   * engine reads this list as a sequence rather than as round numbers.
   */
  history: CompletedRound[];
  score: { CT: number; T: number };
  /** `consecutive_round_losses` when Valve sent it. Not a bonus calculation. */
  lossCount?: Partial<Record<Side, number>>;
}

export interface FreezeSnapshotOptions {
  /**
   * Coached side. Defaults to `GameState.playerSide`.
   * Required when the payload has no focused player — this function will not pick CT or T for you.
   */
  ourSide?: Side;
  /** Premier = `1` (default). Major-style repeated overtime = `0`. */
  overtimeLimit?: 0 | 1;
}

export class FreezeSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FreezeSnapshotError';
  }
}

const PRIMARY_TYPES = new Set([
  'rifle',
  'sniperrifle',
  'submachine gun',
  'smg',
  'shotgun',
  'machine gun',
  'heavy',
]);

/** Classnames used only when GSI omitted `type`. Not a price table. */
const PRIMARY_NAMES = new Set([
  'weapon_ak47',
  'weapon_m4a1',
  'weapon_m4a1_silencer',
  'weapon_famas',
  'weapon_galilar',
  'weapon_aug',
  'weapon_sg556',
  'weapon_awp',
  'weapon_ssg08',
  'weapon_g3sg1',
  'weapon_scar20',
  'weapon_mac10',
  'weapon_mp9',
  'weapon_mp7',
  'weapon_mp5sd',
  'weapon_ump45',
  'weapon_p90',
  'weapon_bizon',
  'weapon_nova',
  'weapon_xm1014',
  'weapon_sawedoff',
  'weapon_mag7',
  'weapon_negev',
  'weapon_m249',
]);

/**
 * Map a normalized `GameState` into the engine's freeze-time input.
 *
 * Pass the result to `evaluateFreeze` from `@roundmind/engine`. Do not add a
 * second recommendation function here. Enemy money stays on `GameState` only
 * when Valve sent it, and is not copied into this snapshot.
 */
export function toFreezeSnapshot(
  state: GameState,
  options: FreezeSnapshotOptions = {},
): FreezeSnapshot {
  const ourSide = options.ourSide ?? state.playerSide;
  if (ourSide !== 'CT' && ourSide !== 'T') {
    throw new FreezeSnapshotError(
      'ourSide is required when GameState.playerSide is missing. Pass { ourSide: "CT" | "T" }.',
    );
  }

  const overtimeLimit = options.overtimeLimit ?? 1;
  if (overtimeLimit !== 0 && overtimeLimit !== 1) {
    throw new FreezeSnapshotError('overtimeLimit must be 1 (Premier) or 0 (repeated overtime)');
  }

  return {
    roundNumber: roundAboutToBePlayed(state),
    ourSide,
    overtimeLimit,
    ourPlayers: ourPlayers(state, ourSide),
    history: completedHistory(state.recentRoundOutcomes),
    score: { CT: state.score.ct, T: state.score.t },
    ...lossCount(state),
  };
}

/**
 * Round the engine should price.
 * During freeze, live play, or a timeout, `map.round` is that round.
 * After the round ends (`over` or halftime), the buy is for the next one.
 */
export function roundAboutToBePlayed(state: GameState): number {
  const current = state.match.round;
  if (state.round.phase === 'over' || state.round.phase === 'halftime') {
    return Math.max(1, current + 1);
  }
  if (current <= 0) {
    return 1;
  }
  return current;
}

export function hasPrimaryWeapon(weapons: readonly WeaponSlot[]): boolean {
  return weapons.some((weapon) => {
    const type = weapon.type?.toLowerCase();
    if (type && PRIMARY_TYPES.has(type)) {
      return true;
    }
    return PRIMARY_NAMES.has(weapon.name.toLowerCase());
  });
}

function ourPlayers(state: GameState, ourSide: Side): PlayerSnapshot[] {
  const roster = state.economies?.[ourSide]?.players ?? [];
  const used = new Set<string>();
  const players: PlayerSnapshot[] = [];

  roster.forEach((player, index) => {
    if (player.money === undefined) {
      return;
    }
    const base = player.steamId ?? player.name ?? `player-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    players.push({
      id,
      cash: player.money,
      hasPrimary: hasPrimaryWeapon(player.weapons),
      ...(player.equipmentValue !== undefined ? { equipmentValue: player.equipmentValue } : {}),
    });
  });

  return players;
}

function completedHistory(outcomes: readonly RoundOutcome[]): CompletedRound[] {
  const history: CompletedRound[] = [];
  for (const outcome of outcomes) {
    if (!outcome.reason) {
      break;
    }
    const round: CompletedRound = {
      winner: outcome.winner,
      reason: outcome.reason,
    };
    if (outcome.bombPlanted) {
      round.bombPlanted = true;
    }
    if (outcome.alive && (outcome.alive.CT !== undefined || outcome.alive.T !== undefined)) {
      round.alive = {};
      if (outcome.alive.CT !== undefined) {
        round.alive.CT = outcome.alive.CT;
      }
      if (outcome.alive.T !== undefined) {
        round.alive.T = outcome.alive.T;
      }
    }
    history.push(round);
  }
  return history;
}

function lossCount(state: GameState): { lossCount?: Partial<Record<Side, number>> } {
  const loss: Partial<Record<Side, number>> = {};
  if (state.score.ctConsecutiveLosses !== undefined) {
    loss.CT = state.score.ctConsecutiveLosses;
  }
  if (state.score.tConsecutiveLosses !== undefined) {
    loss.T = state.score.tConsecutiveLosses;
  }
  return Object.keys(loss).length > 0 ? { lossCount: loss } : {};
}
