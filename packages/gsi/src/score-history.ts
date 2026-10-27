import type { RoundEndReason, RoundOutcome, Side, SurvivorCount } from './types.js';

const MAX_OUTCOMES = 128;

/** What one GSI payload revealed about the round that is closing, if anything. */
export interface RoundSignals {
  winTeam?: Side;
  /** Strongest bomb fact on this payload. Exploded / defused outrank planted. */
  bomb?: 'planted' | 'exploded' | 'defused';
  /** Living players while the round phase is `over`. Partial teams are omitted by the caller. */
  alive?: SurvivorCount;
  /** Live clock reported `0` seconds. Sticky until the round's score change is consumed. */
  clockExpired?: boolean;
  /** This payload is the round-end frame, so pending facts belong to the latest completed round. */
  roundOver?: boolean;
}

interface PendingRound {
  winTeam?: Side;
  bomb: 'none' | 'planted' | 'exploded' | 'defused';
  sawPlanted: boolean;
  alive?: SurvivorCount;
  clockExpired: boolean;
}

/**
 * Remembers score changes and how each round ended.
 *
 * `map.round_wins` is the clean list when Valve sends it. When that key is
 * missing, a score increase records the winner, and bomb / wipe / clock
 * signals seen since the previous score record the reason. Joining mid-match
 * does not invent earlier rounds, and a reason is never guessed from the
 * score alone.
 */
export class ScoreHistory {
  private outcomes: RoundOutcome[] = [];
  private lastCt: number | null = null;
  private lastT: number | null = null;
  private pending: PendingRound = emptyPending();

  /** Outcomes currently stored, oldest first. */
  snapshot(): RoundOutcome[] {
    return this.outcomes.map(cloneOutcome);
  }

  reset(): void {
    this.outcomes = [];
    this.lastCt = null;
    this.lastT = null;
    this.pending = emptyPending();
  }

  /**
   * Trust a `map.round_wins` list and move the cursor to the payload's score
   * so the next delta-only payload does not count those rounds again.
   * Alive counts and a planted bomb already observed are kept on the matching round.
   */
  replace(
    outcomes: readonly RoundOutcome[],
    ct: number,
    t: number,
    signals?: RoundSignals,
  ): RoundOutcome[] {
    if (signals) {
      this.note(signals);
    }

    const previousByRound = new Map(this.outcomes.map((outcome) => [outcome.round, outcome]));
    const copy = outcomes.slice(-MAX_OUTCOMES).map((outcome) => {
      const prior = previousByRound.get(outcome.round);
      return {
        ...cloneOutcome(outcome),
        ...(prior?.alive && !outcome.alive ? { alive: { ...prior.alive } } : {}),
        ...(prior?.bombPlanted && !outcome.bombPlanted ? { bombPlanted: true } : {}),
      };
    });

    const last = copy[copy.length - 1];
    if (last && signals?.roundOver && last.round === ct + t) {
      if (this.pending.alive) {
        last.alive = { ...this.pending.alive };
      }
      if (this.pending.sawPlanted || this.pending.bomb !== 'none') {
        last.bombPlanted = true;
      }
    }

    this.outcomes = copy;
    this.lastCt = ct;
    this.lastT = t;
    this.pending = emptyPending();
    return this.snapshot();
  }

  /**
   * Record wins implied by a score increase. A drop in either score starts a
   * new match. The first score observed after a reset is a baseline, not a win.
   * A single new point can carry the signals noted since the previous score.
   * A jump of more than one point records winners only — one pending signal
   * must not be copied onto several rounds.
   */
  observe(ct: number, t: number, signals?: RoundSignals): RoundOutcome[] {
    if (signals) {
      this.note(signals);
    }

    if (this.lastCt === null || this.lastT === null) {
      this.lastCt = ct;
      this.lastT = t;
      // A round that has already closed on the first payload is not a transition
      // we can score. Signals from a round still in progress stay pending.
      if (signals?.roundOver) {
        this.pending = emptyPending();
      }
      return this.snapshot();
    }

    if (ct < this.lastCt || t < this.lastT) {
      this.outcomes = [];
      this.lastCt = ct;
      this.lastT = t;
      this.pending = emptyPending();
      return this.snapshot();
    }

    const ctDelta = ct - this.lastCt;
    const tDelta = t - this.lastT;
    const added = ctDelta + tDelta;
    let ctScore = this.lastCt;
    let tScore = this.lastT;

    if (added === 1) {
      const winner: Side = ctDelta === 1 ? 'CT' : 'T';
      if (winner === 'CT') {
        ctScore += 1;
      } else {
        tScore += 1;
      }
      this.push(winner, ctScore, tScore, this.detailFor(winner));
      this.pending = emptyPending();
    } else if (added > 1) {
      for (let i = 0; i < ctDelta; i += 1) {
        ctScore += 1;
        this.push('CT', ctScore, tScore);
      }
      for (let i = 0; i < tDelta; i += 1) {
        tScore += 1;
        this.push('T', ctScore, tScore);
      }
      this.pending = emptyPending();
    }

    this.lastCt = ct;
    this.lastT = t;
    return this.snapshot();
  }

  private note(signals: RoundSignals): void {
    if (signals.winTeam) {
      this.pending.winTeam = signals.winTeam;
    }
    if (signals.bomb) {
      if (bombRank(signals.bomb) >= bombRank(this.pending.bomb)) {
        this.pending.bomb = signals.bomb;
      }
      if (signals.bomb === 'planted' || signals.bomb === 'exploded' || signals.bomb === 'defused') {
        this.pending.sawPlanted = true;
      }
    }
    if (signals.alive) {
      this.pending.alive = { ...signals.alive };
    }
    if (signals.clockExpired) {
      this.pending.clockExpired = true;
    }
  }

  private detailFor(winner: Side): RoundDetail {
    const bomb = this.pending.bomb;
    let reason: RoundEndReason | undefined;
    if (bomb === 'exploded' && winner === 'T') {
      reason = 'bomb_explode';
    } else if (bomb === 'defused' && winner === 'CT') {
      reason = 'bomb_defuse';
    } else {
      const loser: Side = winner === 'CT' ? 'T' : 'CT';
      if (this.pending.alive?.[loser] === 0) {
        reason = 'elimination';
      } else if (this.pending.clockExpired && winner === 'CT' && bomb === 'none') {
        reason = 'time';
      }
    }

    const planted = this.pending.sawPlanted || bomb !== 'none';
    return {
      ...(reason ? { reason } : {}),
      ...(this.pending.alive ? { alive: { ...this.pending.alive } } : {}),
      ...(planted ? { bombPlanted: true } : {}),
    };
  }

  private push(winner: Side, ctScore: number, tScore: number, detail?: RoundDetail): void {
    const previous = this.outcomes[this.outcomes.length - 1];
    this.outcomes.push({
      round: previous ? previous.round + 1 : 1,
      winner,
      ctScore,
      tScore,
      ...(detail?.reason ? { reason: detail.reason } : {}),
      ...(detail?.alive ? { alive: { ...detail.alive } } : {}),
      ...(detail?.bombPlanted ? { bombPlanted: true } : {}),
    });
    if (this.outcomes.length > MAX_OUTCOMES) {
      this.outcomes.splice(0, this.outcomes.length - MAX_OUTCOMES);
    }
  }
}

interface RoundDetail {
  reason?: RoundEndReason;
  alive?: SurvivorCount;
  bombPlanted?: boolean;
}

function emptyPending(): PendingRound {
  return { bomb: 'none', sawPlanted: false, clockExpired: false };
}

function bombRank(bomb: PendingRound['bomb']): number {
  if (bomb === 'exploded' || bomb === 'defused') {
    return 2;
  }
  if (bomb === 'planted') {
    return 1;
  }
  return 0;
}

function cloneOutcome(outcome: RoundOutcome): RoundOutcome {
  return {
    ...outcome,
    ...(outcome.alive ? { alive: { ...outcome.alive } } : {}),
  };
}
