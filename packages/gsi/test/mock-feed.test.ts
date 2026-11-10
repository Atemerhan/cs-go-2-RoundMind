import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MockGsiFeed, isFreezeTimePayload } from '../src/mock-feed.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('MockGsiFeed', () => {
  it('replays packaged freeze-time fixtures in order and keeps score history', async () => {
    const feed = new MockGsiFeed();
    expect(await feed.load()).toBe(5);

    const states = feed.replay();
    expect(states.map((state) => state.match.round)).toEqual([1, 2, 3, 13, 25]);
    expect(states.every((state) => state.round.phase === 'freezetime')).toBe(true);

    expect(states[0]?.recentRoundOutcomes).toEqual([]);
    expect(states[1]?.recentRoundOutcomes).toEqual([
      { round: 1, winner: 'CT', ctScore: 1, tScore: 0 },
    ]);
    expect(states[2]?.recentRoundOutcomes.map((outcome) => outcome.winner)).toEqual(['CT', 'T']);
    expect(states[2]?.playerSide).toBe('T');
    expect(states[2]?.score.ctConsecutiveLosses).toBe(1);

    expect(states[3]?.match).toMatchObject({ half: 2, overtime: false });
    expect(states[3]?.recentRoundOutcomes).toHaveLength(12);

    expect(states[4]?.match).toMatchObject({
      half: 3,
      overtime: true,
      overtimePeriod: 1,
    });
    expect(states[4]?.recentRoundOutcomes).toHaveLength(24);
    expect(states[4]?.round.timeRemaining).toBe(10.5);

    const encoded = JSON.stringify(states);
    expect(encoded).not.toContain('sentinel-');
    expect(encoded).not.toContain('position');

    const again = await feed.play(() => undefined);
    expect(again).toHaveLength(5);
    expect(again[4]?.match.overtime).toBe(true);
  });

  it('skips non-freeze snapshots unless asked to include them', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'roundmind-gsi-'));
    tempDirs.push(dir);

    await writeFile(
      path.join(dir, '01-live.json'),
      JSON.stringify({
        map: { name: 'de_dust2', round: 4, team_ct: { score: 3 }, team_t: { score: 0 } },
        round: { phase: 'live' },
        phase_countdowns: { phase: 'live', phase_ends_in: '100' },
      }),
    );
    await writeFile(
      path.join(dir, '02-freeze.json'),
      JSON.stringify({
        map: { name: 'de_dust2', round: 5, team_ct: { score: 4 }, team_t: { score: 0 } },
        round: { phase: 'freezetime' },
        phase_countdowns: { phase: 'freezetime', phase_ends_in: '9' },
      }),
    );

    const freezeOnly = new MockGsiFeed({ fixturesDir: dir });
    expect(await freezeOnly.load()).toBe(1);
    const [only] = freezeOnly.replay();
    expect(only?.round.phase).toBe('freezetime');
    expect(only?.map.name).toBe('de_dust2');
    expect(only?.recentRoundOutcomes).toEqual([]);

    const everything = new MockGsiFeed({ fixturesDir: dir, freezeTimeOnly: false });
    expect(await everything.load()).toBe(2);
    const both = everything.replay();
    expect(both[0]?.round.phase).toBe('live');
    expect(both[1]?.recentRoundOutcomes).toEqual([
      { round: 1, winner: 'CT', ctScore: 4, tScore: 0 },
    ]);

    expect(isFreezeTimePayload({ round: { phase: 'freezetime' } })).toBe(true);
    expect(isFreezeTimePayload({ phase_countdowns: { phase: 'freezetime' } })).toBe(true);
    expect(isFreezeTimePayload({ round: { phase: 'live' } })).toBe(false);
    expect(isFreezeTimePayload(null)).toBe(false);
  });
});
