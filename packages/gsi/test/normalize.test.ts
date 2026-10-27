import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultFixturesDir } from '../src/mock-feed.js';
import { GsiNormalizeError, deriveMr12Structure, normalizeGsiPayload } from '../src/normalize.js';
import { ScoreHistory } from '../src/score-history.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

describe('deriveMr12Structure', () => {
  it('maps regulation halves and MR3 overtime periods', () => {
    expect(deriveMr12Structure(0)).toMatchObject({ round: 0, half: 1, overtime: false });
    expect(deriveMr12Structure(1)).toMatchObject({ half: 1, overtime: false });
    expect(deriveMr12Structure(12)).toMatchObject({ half: 1, overtime: false });
    expect(deriveMr12Structure(13)).toMatchObject({ half: 2, overtime: false });
    expect(deriveMr12Structure(24)).toMatchObject({ half: 2, overtime: false });
    expect(deriveMr12Structure(25)).toMatchObject({ half: 3, overtime: true, overtimePeriod: 1 });
    expect(deriveMr12Structure(27)).toMatchObject({ half: 3, overtime: true, overtimePeriod: 1 });
    expect(deriveMr12Structure(28)).toMatchObject({ half: 4, overtime: true, overtimePeriod: 1 });
    expect(deriveMr12Structure(30)).toMatchObject({ half: 4, overtime: true, overtimePeriod: 1 });
    expect(deriveMr12Structure(31)).toMatchObject({ half: 5, overtime: true, overtimePeriod: 2 });
  });
});

describe('normalizeGsiPayload', () => {
  it('rejects payloads that are not objects', () => {
    expect(() => normalizeGsiPayload(null)).toThrow(GsiNormalizeError);
    expect(() => normalizeGsiPayload([])).toThrow(GsiNormalizeError);
    expect(() => normalizeGsiPayload('live')).toThrow(GsiNormalizeError);
  });

  it('normalizes a pistol freeze and drops positions, grenades, and the auth token', async () => {
    const payload = JSON.parse(await readFile(path.join(fixturesDir, '01-pistol-round-freeze.json'), 'utf8'));
    const state = normalizeGsiPayload(payload);

    expect(state.map).toEqual({ name: 'de_mirage', mode: 'competitive', phase: 'live' });
    expect(state.match).toEqual({ format: 'MR12', round: 1, half: 1, overtime: false });
    expect(state.round).toEqual({ phase: 'freezetime', timeRemaining: 15 });
    expect(state.score).toEqual({ ct: 0, t: 0, ctConsecutiveLosses: 0, tConsecutiveLosses: 0 });
    expect(state.playerSide).toBe('CT');
    expect(state.observedAt).toBe(1730000001);
    expect(state.recentRoundOutcomes).toEqual([]);

    expect(state.economies?.CT?.totalMoney).toBe(1600);
    expect(state.economies?.CT?.moneySamples).toBe(2);
    expect(state.economies?.CT?.totalEquipmentValue).toBe(400);
    expect(state.economies?.T?.totalMoney).toBe(1600);
    expect(state.economies?.CT?.players[0]?.weapons.map((weapon) => weapon.name)).toEqual([
      'weapon_knife',
      'weapon_usp_silencer',
    ]);

    expect(state.bomb).toEqual({
      status: 'carried',
      playerSteamId: '76561198000000011',
    });

    const keys = collectKeys(state);
    expect(keys).not.toContain('position');
    expect(keys).not.toContain('forward');
    expect(keys).not.toContain('auth');
    expect(keys).not.toContain('token');
    expect(keys).not.toContain('previously');

    const encoded = JSON.stringify(state);
    expect(encoded).not.toContain('sentinel-');
    expect(encoded).not.toContain('bomb-x');
    expect(encoded).not.toContain('not-part-of-gamestate');
    expect(encoded).not.toContain('roundmind-local-dev');
    expect(path.resolve(defaultFixturesDir())).toBe(path.resolve(fixturesDir));
  });

  it('keeps only the local team when allplayers is absent', () => {
    const state = normalizeGsiPayload({
      player: {
        steamid: '76561198000000001',
        name: 'Ava',
        team: 'CT',
        state: { money: 4200, equip_value: 3900, helmet: true, armor: 100, defusekit: true },
        weapons: {
          weapon_0: { name: 'weapon_m4a1', type: 'Rifle', state: 'active' },
        },
        position: 'should-not-copy',
      },
    });

    expect(state.playerSide).toBe('CT');
    expect(state.economies?.T).toBeUndefined();
    expect(state.economies?.CT).toMatchObject({
      totalMoney: 4200,
      totalEquipmentValue: 3900,
      moneySamples: 1,
      equipmentSamples: 1,
    });
    expect(state.economies?.CT?.players[0]).toMatchObject({
      helmet: true,
      armor: 100,
      defuseKit: true,
      weapons: [{ name: 'weapon_m4a1', type: 'Rifle', state: 'active' }],
    });
    expect(JSON.stringify(state)).not.toContain('should-not-copy');
  });

  it('does not treat a missing money field as zero', () => {
    const state = normalizeGsiPayload({
      allplayers: {
        '1': { name: 'Ava', team: 'CT', state: { money: 800, equip_value: 200 } },
        '2': { name: 'Bo', team: 'CT', state: { equip_value: 200 } },
        spec: { name: 'Ghost', team: 'Spectator', state: { money: 16000 }, position: '1, 2, 3' },
      },
    });

    expect(state.economies?.CT?.totalMoney).toBe(800);
    expect(state.economies?.CT?.moneySamples).toBe(1);
    expect(state.economies?.CT?.players).toHaveLength(2);
    expect(state.economies?.T).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain('Ghost');
    expect(JSON.stringify(state)).not.toContain('16000');
  });

  it('sorts weapons and merges the focused player into allplayers by steam id', () => {
    const state = normalizeGsiPayload({
      player: {
        steamid: '9',
        name: 'Ava',
        team: 'CT',
        weapons: {
          weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
        },
      },
      allplayers: {
        '9': { name: 'Ava', team: 'CT', state: { money: 1000 }, weapons: {} },
      },
    });

    expect(state.economies?.CT?.players).toEqual([
      expect.objectContaining({
        steamId: '9',
        money: 1000,
        weapons: [{ name: 'weapon_knife', type: 'Knife', state: 'holstered' }],
      }),
    ]);
  });

  it('maps countdown phases, bomb, halftime, and gameover', () => {
    expect(phaseOf({ phase_countdowns: { phase: 'live' }, round: { phase: 'live' } })).toBe('live');
    expect(
      phaseOf({
        phase_countdowns: { phase: 'live', phase_ends_in: '20.5' },
        round: { phase: 'live', bomb: 'planted' },
        bomb: { state: 'planted', position: '1, 2, 3', countdown: '35.1' },
      }),
    ).toBe('bomb');
    expect(phaseOf({ phase_countdowns: { phase: 'defuse' }, round: { bomb: 'planted' } })).toBe('defuse');
    expect(phaseOf({ phase_countdowns: { phase: 'timeout_t' } })).toBe('timeout');
    expect(phaseOf({ phase_countdowns: { phase: 'paused' } })).toBe('paused');
    expect(phaseOf({ map: { phase: 'intermission' }, round: { phase: 'over' } })).toBe('halftime');
    expect(phaseOf({ map: { phase: 'gameover' }, phase_countdowns: { phase: 'over' } })).toBe('gameover');
    expect(phaseOf({ map: { phase: 'warmup' } })).toBe('warmup');
    expect(phaseOf({})).toBe('unknown');

    const planted = normalizeGsiPayload({
      round: { phase: 'live', bomb: 'planted' },
      phase_countdowns: { phase: 'bomb', phase_ends_in: '30' },
      bomb: { state: 'defusing', player: '765', countdown: 4.2, position: 'nope' },
    });
    expect(planted.round).toEqual({ phase: 'defuse', timeRemaining: 30 });
    expect(planted.bomb).toEqual({ status: 'defusing', playerSteamId: '765', countdown: 4.2 });
  });

  it('uses map.round_wins when present, including an empty list', () => {
    const history = new ScoreHistory();
    normalizeGsiPayload(
      {
        map: {
          round: 2,
          team_ct: { score: 1 },
          team_t: { score: 0 },
        },
      },
      history,
    );

    const replaced = normalizeGsiPayload(
      {
        map: {
          round: 3,
          team_ct: { score: 1 },
          team_t: { score: 1 },
          round_wins: {
            '2': 't_win_bomb',
            '1': 'ct_win_elimination',
            skip: 'nope',
          },
        },
      },
      history,
    );

    expect(replaced.recentRoundOutcomes).toEqual([
      {
        round: 1,
        winner: 'CT',
        reason: 'elimination',
        gsiReason: 'ct_win_elimination',
        ctScore: 1,
        tScore: 0,
      },
      {
        round: 2,
        winner: 'T',
        reason: 'bomb_explode',
        gsiReason: 't_win_bomb',
        ctScore: 1,
        tScore: 1,
      },
    ]);

    const continued = normalizeGsiPayload(
      {
        map: {
          round: 4,
          team_ct: { score: 2 },
          team_t: { score: 1 },
        },
      },
      history,
    );
    expect(continued.recentRoundOutcomes.map((outcome) => outcome.winner)).toEqual(['CT', 'T', 'CT']);
    expect(continued.recentRoundOutcomes[2]).toMatchObject({ round: 3, ctScore: 2, tScore: 1 });

    const reset = normalizeGsiPayload(
      {
        map: {
          round: 1,
          team_ct: { score: 3 },
          team_t: { score: 0 },
          round_wins: {},
        },
      },
      history,
    );
    expect(reset.recentRoundOutcomes).toEqual([]);
  });

  it('derives later rounds from score changes and does not back-fill a mid-match join', () => {
    const history = new ScoreHistory();
    const joined = normalizeGsiPayload(
      { map: { round: 9, team_ct: { score: 5 }, team_t: { score: 3 } } },
      history,
    );
    expect(joined.recentRoundOutcomes).toEqual([]);

    const next = normalizeGsiPayload(
      { map: { round: 10, team_ct: { score: 6 }, team_t: { score: 3 } } },
      history,
    );
    expect(next.recentRoundOutcomes).toEqual([
      { round: 1, winner: 'CT', ctScore: 6, tScore: 3 },
    ]);

    const both = normalizeGsiPayload(
      { map: { round: 12, team_ct: { score: 7 }, team_t: { score: 4 } } },
      history,
    );
    expect(both.recentRoundOutcomes.map((outcome) => outcome.winner)).toEqual(['CT', 'CT', 'T']);

    const newMatch = normalizeGsiPayload(
      { map: { round: 1, team_ct: { score: 0 }, team_t: { score: 0 } } },
      history,
    );
    expect(newMatch.recentRoundOutcomes).toEqual([]);
  });

  it('records a multi-round score jump as one outcome per point', () => {
    const history = new ScoreHistory();
    normalizeGsiPayload({ map: { team_ct: { score: 0 }, team_t: { score: 0 } } }, history);
    const state = normalizeGsiPayload(
      { map: { team_ct: { score: 2 }, team_t: { score: 0 } } },
      history,
    );
    expect(state.recentRoundOutcomes).toEqual([
      { round: 1, winner: 'CT', ctScore: 1, tScore: 0 },
      { round: 2, winner: 'CT', ctScore: 2, tScore: 0 },
    ]);
  });

  it('reads the second-half and overtime fixtures', async () => {
    const secondHalf = JSON.parse(
      await readFile(path.join(fixturesDir, '04-second-half-freeze.json'), 'utf8'),
    );
    const overtime = JSON.parse(
      await readFile(path.join(fixturesDir, '05-overtime-freeze.json'), 'utf8'),
    );

    const half = normalizeGsiPayload(secondHalf);
    expect(half.match).toMatchObject({ round: 13, half: 2, overtime: false });
    expect(half.recentRoundOutcomes).toHaveLength(12);
    expect(half.recentRoundOutcomes.filter((outcome) => outcome.winner === 'CT')).toHaveLength(7);
    expect(half.recentRoundOutcomes.filter((outcome) => outcome.winner === 'T')).toHaveLength(5);
    expect(half.recentRoundOutcomes[0]).toMatchObject({
      reason: 'elimination',
      gsiReason: 'ct_win_elimination',
    });
    expect(half.economies?.T?.players[0]?.weapons.map((weapon) => weapon.name)).toEqual([
      'weapon_knife',
      'weapon_glock',
    ]);
    expect(half.economies?.CT?.players[0]?.defuseKit).toBe(true);

    const ot = normalizeGsiPayload(overtime);
    expect(ot.match).toEqual({
      format: 'MR12',
      round: 25,
      half: 3,
      overtime: true,
      overtimePeriod: 1,
    });
    expect(ot.score).toMatchObject({ ct: 12, t: 12 });
    expect(ot.recentRoundOutcomes).toHaveLength(24);
    expect(ot.recentRoundOutcomes.at(-1)).toMatchObject({
      round: 24,
      winner: 'T',
      reason: 'elimination',
      gsiReason: 't_win_elimination',
      ctScore: 12,
      tScore: 12,
    });
  });

  it('records bomb, wipe, and clock reasons from round transitions', () => {
    const history = new ScoreHistory();
    normalizeGsiPayload(
      {
        map: { round: 1, phase: 'live', team_ct: { score: 0 }, team_t: { score: 0 } },
        round: { phase: 'live' },
        bomb: { state: 'planted' },
      },
      history,
    );
    const exploded = normalizeGsiPayload(
      {
        map: { round: 1, phase: 'live', team_ct: { score: 0 }, team_t: { score: 1 } },
        round: { phase: 'over', win_team: 'T', bomb: 'exploded' },
        bomb: { state: 'exploded' },
        allplayers: teamHealth('T', [0, 0, 0, 0, 100]),
      },
      history,
    );
    expect(exploded.recentRoundOutcomes).toEqual([
      {
        round: 1,
        winner: 'T',
        reason: 'bomb_explode',
        ctScore: 0,
        tScore: 1,
        alive: { T: 1 },
        bombPlanted: true,
      },
    ]);

    const clock = new ScoreHistory();
    normalizeGsiPayload(
      {
        map: { round: 2, phase: 'live', team_ct: { score: 0 }, team_t: { score: 0 } },
        phase_countdowns: { phase: 'live', phase_ends_in: '0.0' },
        round: { phase: 'live' },
      },
      clock,
    );
    const timed = normalizeGsiPayload(
      {
        map: { round: 2, phase: 'live', team_ct: { score: 1 }, team_t: { score: 0 } },
        round: { phase: 'over', win_team: 'CT' },
        phase_countdowns: { phase: 'over', phase_ends_in: '5' },
      },
      clock,
    );
    expect(timed.recentRoundOutcomes).toEqual([
      { round: 1, winner: 'CT', reason: 'time', ctScore: 1, tScore: 0 },
    ]);

    const wiped = new ScoreHistory();
    normalizeGsiPayload(
      { map: { round: 3, team_ct: { score: 0 }, team_t: { score: 0 } }, round: { phase: 'live' } },
      wiped,
    );
    const elimination = normalizeGsiPayload(
      {
        map: { round: 3, team_ct: { score: 1 }, team_t: { score: 0 } },
        round: { phase: 'over', win_team: 'CT' },
        allplayers: {
          ...teamHealth('T', [0, 0, 0, 0, 0]),
          ...teamHealth('CT', [100, 80, 10, 0, 50]),
        },
      },
      wiped,
    );
    expect(elimination.recentRoundOutcomes).toEqual([
      {
        round: 1,
        winner: 'CT',
        reason: 'elimination',
        ctScore: 1,
        tScore: 0,
        alive: { T: 0, CT: 4 },
      },
    ]);
  });

  it('does not treat one CT health sample as a team wipe', () => {
    const history = new ScoreHistory();
    normalizeGsiPayload(
      { map: { team_ct: { score: 0 }, team_t: { score: 0 } }, round: { phase: 'live' } },
      history,
    );
    const state = normalizeGsiPayload(
      {
        map: { team_ct: { score: 1 }, team_t: { score: 0 } },
        round: { phase: 'over', win_team: 'CT' },
        player: { steamid: 'only-me', team: 'CT', state: { health: 0, money: 800 } },
      },
      history,
    );
    expect(state.recentRoundOutcomes).toEqual([
      { round: 1, winner: 'CT', ctScore: 1, tScore: 0 },
    ]);
  });
});

function phaseOf(payload: unknown): string {
  return normalizeGsiPayload(payload).round.phase;
}

function teamHealth(side: 'CT' | 'T', healths: number[]): Record<string, unknown> {
  const players: Record<string, unknown> = {};
  healths.forEach((health, index) => {
    players[`${side}-${index}`] = {
      team: side,
      state: { health, money: 800 },
    };
  });
  return players;
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}
