import type { Side } from './types.js';

/**
 * Played buy, using the same categories as `@roundmind/engine`.
 *
 * Dollar lines are `fullBuyCash`, `forceBuyCash`, `POLICY.pistolSpendLow`,
 * `POLICY.pistolSpendHigh`, and `POLICY.savePrimaryRatio`. A test locks
 * these numbers to that package so the table is not copied from weapon prices.
 *
 * Pistol rounds are 1 and 13 (`isPistolRound` for MR12). Overtime resets
 * are not pistol rounds.
 *
 * - Pistol: average cash spent ≥ $800 is `full`, ≥ $300 is `force`, else `eco`.
 * - Other rounds: ≥ rifle+helmet (T $3700 / CT $3900) is `full`;
 *   ≥ SMG+kevlar (T $1700 / CT $1900) is `force`.
 * - `save` when this is not a pistol round, every teammate who reported cash
 *   also reported weapons, at least 60% of them already held a primary, they
 *   still do after the buy, and the spend is below the force line. A missing
 *   weapon list on someone who reported cash is not a save.
 * - Otherwise `eco`.
 *
 * Spend is the average drop in `money` for teammates who reported it both
 * at the start of freeze and after the buy. A missing `money` is skipped,
 * never treated as $0. A cash increase is ignored. When nobody can be
 * compared, the same full/force lines are applied to the average
 * `equip_value` after the buy, and a qualifying primary ratio is still
 * `save` when that equipment value did not rise by a force buy.
 */
export const BUY_LINES = {
  full: { T: 3700, CT: 3900 },
  force: { T: 1700, CT: 1900 },
  pistolFull: 800,
  pistolPartial: 300,
  savePrimaryRatio: 0.6,
} as const;

export type BuyClass = 'full' | 'force' | 'eco' | 'save';

export interface RosterSample {
  id: string;
  /** Absent when this payload did not include `money`. */
  cash?: number;
  hasPrimary: boolean;
  equipmentValue?: number;
  /** False when the payload listed no weapons, so `hasPrimary` is not evidence. */
  weaponsKnown: boolean;
}

export function inferChosenBuy(
  roundNumber: number,
  ourSide: Side,
  pre: readonly RosterSample[],
  post: readonly RosterSample[] | undefined,
): BuyClass {
  const spent = averageSpend(pre, post);
  if (isPistolRoundNumber(roundNumber)) {
    return classifyPistol(spent, averageEquip(post ?? pre));
  }

  const full = BUY_LINES.full[ourSide];
  const force = BUY_LINES.force[ourSide];
  const preRatio = primaryRatio(pre);
  const postRatio = post ? primaryRatio(post) : preRatio;
  const kept = keptPrimaries(preRatio, postRatio);

  if (spent !== undefined) {
    if (kept && spent < force) {
      return 'save';
    }
    if (spent >= full) {
      return 'full';
    }
    if (spent >= force) {
      return 'force';
    }
    return 'eco';
  }

  const equipDelta = averageEquipDelta(pre, post);
  const postEquip = averageEquip(post);
  if (kept && (equipDelta === undefined || equipDelta < force)) {
    return 'save';
  }
  if (postEquip !== undefined && postEquip >= full) {
    return 'full';
  }
  if (postEquip !== undefined && postEquip >= force) {
    return 'force';
  }
  return 'eco';
}

/** MR12 pistol rounds. Same pair as `isPistolRound` in `@roundmind/engine`. */
function isPistolRoundNumber(roundNumber: number): boolean {
  return roundNumber === 1 || roundNumber === 13;
}

function classifyPistol(spent: number | undefined, equip: number | undefined): BuyClass {
  const value = spent ?? equip;
  if (value === undefined) {
    return 'eco';
  }
  if (value >= BUY_LINES.pistolFull) {
    return 'full';
  }
  if (value >= BUY_LINES.pistolPartial) {
    return 'force';
  }
  return 'eco';
}

function keptPrimaries(preRatio: number | undefined, postRatio: number | undefined): boolean {
  if (preRatio === undefined || postRatio === undefined) {
    return false;
  }
  return preRatio >= BUY_LINES.savePrimaryRatio && postRatio >= BUY_LINES.savePrimaryRatio;
}

/**
 * Share of the cash-reporting roster holding a primary.
 * Undefined when that roster is empty or any of them omitted weapons,
 * so a hole cannot be counted as "no primary" or as a full save.
 */
function primaryRatio(players: readonly RosterSample[]): number | undefined {
  const withCash = players.filter((player) => player.cash !== undefined);
  if (withCash.length === 0 || withCash.some((player) => !player.weaponsKnown)) {
    return undefined;
  }
  const primaries = withCash.filter((player) => player.hasPrimary).length;
  return primaries / withCash.length;
}

function averageSpend(
  pre: readonly RosterSample[],
  post: readonly RosterSample[] | undefined,
): number | undefined {
  if (!post) {
    return undefined;
  }
  const preById = new Map(pre.map((player) => [player.id, player]));
  const deltas: number[] = [];
  for (const player of post) {
    if (player.cash === undefined) {
      continue;
    }
    const before = preById.get(player.id);
    if (before?.cash === undefined) {
      continue;
    }
    const delta = before.cash - player.cash;
    if (delta < 0) {
      continue;
    }
    deltas.push(delta);
  }
  return mean(deltas);
}

function averageEquip(players: readonly RosterSample[] | undefined): number | undefined {
  if (!players) {
    return undefined;
  }
  return mean(
    players.flatMap((player) => (player.equipmentValue === undefined ? [] : [player.equipmentValue])),
  );
}

function averageEquipDelta(
  pre: readonly RosterSample[],
  post: readonly RosterSample[] | undefined,
): number | undefined {
  if (!post) {
    return undefined;
  }
  const preById = new Map(pre.map((player) => [player.id, player]));
  const deltas: number[] = [];
  for (const player of post) {
    if (player.equipmentValue === undefined) {
      continue;
    }
    const before = preById.get(player.id);
    if (before?.equipmentValue === undefined) {
      continue;
    }
    deltas.push(player.equipmentValue - before.equipmentValue);
  }
  return mean(deltas);
}

function mean(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
