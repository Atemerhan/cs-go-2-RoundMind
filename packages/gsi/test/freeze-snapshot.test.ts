import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FreezeSnapshotError,
  hasPrimaryWeapon,
  roundAboutToBePlayed,
  toFreezeSnapshot,
} from '../src/freeze-snapshot.js';
import { normalizeGsiPayload } from '../src/normalize.js';
import type { GameState } from '../src/types.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

describe('toFreezeSnapshot', () => {
  it('maps a pistol freeze onto the engine input and drops enemy cash', async () => {
    const payload = JSON.parse(await readFile(path.join(fixturesDir, '01-pistol-round-freeze.json'), 'utf8'));
    payload.allplayers['76561198000000011'].state.money = 12345;
    const state = normalizeGsiPayload(payload);
    const snapshot = toFreezeSnapshot(state);

    expect(snapshot).toEqual({
      roundNumber: 1,
      ourSide: 'CT',
      overtimeLimit: 1,
      ourPlayers: [
        { id: '76561198000000001', cash: 800, hasPrimary: false, equipmentValue: 200 },
        { id: '76561198000000002', cash: 800, hasPrimary: false, equipmentValue: 200 },
      ],
      history: [],
      score: { CT: 0, T: 0 },
      lossCount: { CT: 0, T: 0 },
    });
    expect(JSON.stringify(snapshot)).not.toContain('12345');
    expect(JSON.stringify(snapshot)).not.toContain('Cai');
    expect(JSON.stringify(snapshot)).not.toContain('76561198000000011');
  });

  it('uses round_wins reasons and the round that is about to be played', async () => {
    const secondHalf = JSON.parse(
      await readFile(path.join(fixturesDir, '04-second-half-freeze.json'), 'utf8'),
    );
    const state = normalizeGsiPayload(secondHalf);
    const snapshot = toFreezeSnapshot(state, { ourSide: 'T', overtimeLimit: 0 });

    expect(snapshot.roundNumber).toBe(13);
    expect(snapshot.ourSide).toBe('T');
    expect(snapshot.overtimeLimit).toBe(0);
    expect(snapshot.history).toHaveLength(12);
    expect(snapshot.history[0]).toEqual({ winner: 'CT', reason: 'elimination' });
    expect(snapshot.history[4]).toEqual({ winner: 'T', reason: 'bomb_explode' });
    expect(snapshot.history[6]).toEqual({ winner: 'CT', reason: 'bomb_defuse' });
    expect(snapshot.history[3]).toEqual({ winner: 'CT', reason: 'time' });
    expect(snapshot.ourPlayers).toEqual([
      { id: '76561198000000001', cash: 4200, hasPrimary: false, equipmentValue: 0 },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('5500');
    expect(snapshot.lossCount).toEqual({ CT: 1, T: 0 });
    expect(snapshot.score).toEqual({ CT: 7, T: 5 });
  });

  it('stops history at the first round that has no reason', () => {
    const state = baseState({
      recentRoundOutcomes: [
        { round: 1, winner: 'CT', reason: 'elimination', ctScore: 1, tScore: 0 },
        { round: 2, winner: 'T', ctScore: 1, tScore: 1 },
        { round: 3, winner: 'CT', reason: 'time', ctScore: 2, tScore: 1 },
      ],
    });
    expect(toFreezeSnapshot(state, { ourSide: 'CT' }).history).toEqual([
      { winner: 'CT', reason: 'elimination' },
    ]);
  });

  it('moves the buy to the next round after the previous one ends', () => {
    const over = baseState({
      match: { format: 'MR12', round: 4, half: 1, overtime: false },
      round: { phase: 'over' },
    });
    expect(roundAboutToBePlayed(over)).toBe(5);
    expect(toFreezeSnapshot(over, { ourSide: 'CT' }).roundNumber).toBe(5);

    const halftime = baseState({
      match: { format: 'MR12', round: 12, half: 1, overtime: false },
      round: { phase: 'halftime' },
    });
    expect(roundAboutToBePlayed(halftime)).toBe(13);
  });

  it('requires a side and skips teammates who did not report cash', () => {
    const state = baseState({
      playerSide: undefined,
      economies: {
        CT: {
          side: 'CT',
          players: [
            { steamId: 'known', team: 'CT', money: 2400, weapons: [{ name: 'weapon_ak47', type: 'Rifle' }] },
            { steamId: 'unknown-cash', team: 'CT', weapons: [] },
          ],
        },
        T: {
          side: 'T',
          players: [{ steamId: 'enemy', team: 'T', money: 99999, weapons: [] }],
        },
      },
    });

    expect(() => toFreezeSnapshot(state)).toThrow(FreezeSnapshotError);
    const snapshot = toFreezeSnapshot(state, { ourSide: 'CT' });
    expect(snapshot.ourPlayers).toEqual([{ id: 'known', cash: 2400, hasPrimary: true }]);
    expect(JSON.stringify(snapshot)).not.toContain('99999');
    expect(JSON.stringify(snapshot)).not.toContain('enemy');
  });

  it('treats pistols as not primary and classnames as primary when type is missing', () => {
    expect(hasPrimaryWeapon([{ name: 'weapon_glock', type: 'Pistol' }])).toBe(false);
    expect(hasPrimaryWeapon([{ name: 'weapon_awp' }])).toBe(true);
    expect(hasPrimaryWeapon([{ name: 'weapon_mp9', type: 'Submachine Gun' }])).toBe(true);
    expect(hasPrimaryWeapon([{ name: 'weapon_knife', type: 'Knife' }])).toBe(false);
  });
});

function baseState(overrides: Partial<GameState> = {}): GameState {
  return {
    map: { name: 'de_mirage', phase: 'live' },
    match: { format: 'MR12', round: 1, half: 1, overtime: false },
    round: { phase: 'freezetime' },
    score: { ct: 0, t: 0 },
    recentRoundOutcomes: [],
    ...overrides,
  };
}
