/**
 * Public contract for RoundMind's GSI ingestion layer.
 *
 * Values come from Valve's CS2 Game State Integration POST, or from score
 * changes this process has already observed. Nothing here is inferred from
 * memory, radar, or "typical" enemy positions.
 */

/** Competitive side as Valve spells it in GSI. */
export type Side = 'CT' | 'T';

/**
 * Round / map phase collapsed to the labels the coach cares about.
 * `bomb` and `defuse` come from `phase_countdowns` (or a planted bomb flag).
 */
export type RoundPhase =
  | 'warmup'
  | 'freezetime'
  | 'live'
  | 'bomb'
  | 'defuse'
  | 'over'
  | 'halftime'
  | 'timeout'
  | 'paused'
  | 'gameover'
  | 'unknown';

export interface WeaponSlot {
  /** Valve classname, e.g. `weapon_ak47`. */
  name: string;
  type?: string;
  state?: string;
}

/**
 * One player's money and equipment, copied from `player` or `allplayers`.
 * World position is intentionally not a field.
 */
export interface PlayerLoadout {
  steamId?: string;
  name?: string;
  team: Side;
  /** Cash Valve reported. Absent when that object had no `money` field. */
  money?: number;
  /** `state.equip_value` when Valve sent it. */
  equipmentValue?: number;
  helmet?: boolean;
  armor?: number;
  defuseKit?: boolean;
  weapons: WeaponSlot[];
}

export interface TeamEconomy {
  side: Side;
  players: PlayerLoadout[];
  /**
   * Sum of `money` across players who actually reported it.
   * Absent when nobody on this side reported money. Not a guess for the rest.
   */
  totalMoney?: number;
  /** How many players contributed to `totalMoney`. */
  moneySamples?: number;
  /** Sum of reported `equip_value`. Absent when nobody reported it. */
  totalEquipmentValue?: number;
  equipmentSamples?: number;
}

export type BombStatus =
  | 'carried'
  | 'dropped'
  | 'planting'
  | 'planted'
  | 'defusing'
  | 'defused'
  | 'exploded';

/** Bomb status only. Coordinates from the `bomb` object are discarded. */
export interface BombState {
  status: BombStatus;
  /** SteamID64 of the carrier / planter / defuser when GSI included `bomb.player`. */
  playerSteamId?: string;
  /** `bomb.countdown` in seconds when present (plant, defuse, or fuse). */
  countdown?: number;
}

/**
 * Same four endings `@roundmind/engine` uses on `CompletedRound`.
 * Hostage maps are not modeled. Omitted when this listener did not see a reason.
 */
export type RoundEndReason = 'elimination' | 'bomb_explode' | 'bomb_defuse' | 'time';

export interface SurvivorCount {
  /** Living players. Set only when five health values for that side were in the payload. */
  CT?: number;
  T?: number;
}

export interface RoundOutcome {
  /** 1-based round index. From `map.round_wins` when Valve sent it, else the order we observed. */
  round: number;
  winner: Side;
  /**
   * Engine vocabulary. From `map.round_wins`, or from a round transition
   * (bomb explode / defuse, a full team wiped, or the live clock hitting 0).
   * Absent when only the score changed.
   */
  reason?: RoundEndReason;
  /** Valve's raw `round_wins` string when that map was the source. */
  gsiReason?: string;
  ctScore: number;
  tScore: number;
  /** Headcount at round end. A missing side was not fully present in GSI. */
  alive?: SurvivorCount;
  /** True only when this listener saw the bomb planted before the round closed. */
  bombPlanted?: boolean;
}

/**
 * CS2 premier / competitive regulation is MR12 (12 rounds per half, first to 13).
 * Overtime periods are MR3: 3 rounds a side, 6 rounds per period.
 */
export interface MatchStructure {
  format: 'MR12';
  /** `map.round` from GSI. `0` before the first live round. */
  round: number;
  /**
   * 1 = regulation first half (rounds 1–12), 2 = second half (13–24).
   * Later halves are overtime: 3 and 4 are OT period 1, 5 and 6 are OT period 2, and so on.
   */
  half: number;
  overtime: boolean;
  /** 1-based overtime period. Omitted during regulation. */
  overtimePeriod?: number;
}

export interface ScoreState {
  ct: number;
  t: number;
  /** `map.team_ct.consecutive_round_losses` when present. */
  ctConsecutiveLosses?: number;
  /** `map.team_t.consecutive_round_losses` when present. */
  tConsecutiveLosses?: number;
}

export interface GameState {
  map: {
    name?: string;
    mode?: string;
    /** Raw `map.phase` (`warmup`, `live`, `intermission`, `gameover`). */
    phase?: string;
  };
  match: MatchStructure;
  round: {
    phase: RoundPhase;
    /** Seconds left in the current phase (`phase_countdowns.phase_ends_in`). */
    timeRemaining?: number;
  };
  score: ScoreState;
  /** Team of the focused `player` object, when GSI included one. */
  playerSide?: Side;
  /**
   * Economies for sides that appeared in this payload.
   * A missing side means Valve did not send those players (typical on a
   * playing client, where `allplayers` is empty). It does not mean $0.
   */
  economies?: {
    CT?: TeamEconomy;
    T?: TeamEconomy;
  };
  bomb?: BombState;
  /**
   * Completed rounds for this match, oldest first.
   * Prefer `map.round_wins` when the payload has that key.
   * Otherwise this is the score-delta history the listener has observed
   * since it started (it does not back-fill rounds it never saw).
   * `reason` is set only when Valve or a round transition named the ending.
   */
  recentRoundOutcomes: RoundOutcome[];
  /** `provider.timestamp` (unix seconds) when present. */
  observedAt?: number;
}
