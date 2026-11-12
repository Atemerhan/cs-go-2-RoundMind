import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { convertRecording } from '../src/convert.js';
import { RecordingError, appendRecordingLine, readRecording, type GsiRecordingLine } from '../src/record.js';
import { GsiServer } from '../src/server.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const AVA = '76561198000000001';
const BO = '76561198000000002';

const AK = {
  weapon_0: { name: 'weapon_knife', type: 'Knife', state: 'holstered' },
  weapon_1: { name: 'weapon_ak47', type: 'Rifle', state: 'active' },
};

type Payload = Record<string, unknown>;
type Phase = 'freezetime' | 'live' | 'over' | 'warmup' | 'halftime';

const servers: GsiServer[] = [];
const dirs: string[] = [];

let pistol: Payload;
let round2: Payload;
let secondHalf: Payload;
let overtime: Payload;

beforeAll(async () => {
  pistol = await loadFixture('01-pistol-round-freeze.json');
  round2 = await loadFixture('02-round2-freeze.json');
  secondHalf = await loadFixture('04-second-half-freeze.json');
  overtime = await loadFixture('05-overtime-freeze.json');
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('convertRecording', () => {
  it('keeps the latest match, a mid-match join, and a side fallback', () => {
    const first = roundPair('de_mirage', 800, '76561198000000001');
    const second = roundPair('de_mirage', 5000, '76561198000000001');
    const restarted = convertRecording([...first, ...second]);
    expect(restarted).toMatchObject({ schemaVersion: 1, map: 'de_mirage' });
    expect(restarted.rounds).toHaveLength(1);
    expect(restarted.rounds[0]?.state.ourPlayers[0]?.cash).toBe(5000);
    expect(restarted.rounds[0]?.chosenBuy).toBe('full');
    expect(restarted.rounds[0]?.winner).toBe('us');

    const switched = convertRecording([
      ...roundPair('de_mirage', 800, '76561198000000001').slice(0, 1),
      ...roundPair('de_nuke', 5000, '76561198000000001'),
    ]);
    expect(switched.map).toBe('de_nuke');
    expect(switched.rounds).toHaveLength(1);
    expect(switched.rounds[0]?.state.ourPlayers[0]?.cash).toBe(5000);

    const partial = convertRecording([
      line(freezeAt(5, 2, 2, 2500, true)),
      line(overAt(5, 2, 3)),
    ]);
    expect(partial.rounds).toEqual([
      expect.objectContaining({
        roundNumber: 5,
        chosenBuy: 'save',
        winner: 'them',
      }),
    ]);
    expect(partial.rounds[0]?.state.history).toEqual([]);
    expect(partial.rounds[0]?.state.ourPlayers).toEqual([
      expect.objectContaining({ cash: 2500, hasPrimary: true }),
    ]);

    expect(convertRecording([line(freezeAt(5, 2, 2, 2500, false)), line(jumpAhead())]).rounds).toEqual([]);

    const stale = convertRecording([
      line(freezeAt(4, 3, 1, 3000, false)),
      line(freezeAt(3, 2, 1, 100, false)),
      line(overAt(4, 3, 2)),
    ]);
    expect(stale.rounds).toHaveLength(1);
    expect(stale.rounds[0]?.state.ourPlayers[0]?.cash).toBe(3000);
    expect(stale.rounds[0]?.winner).toBe('them');

    const noSide = [line(spectatorFreeze()), line(overAt(2, 1, 1))];
    expect(convertRecording(noSide)).toEqual({ schemaVersion: 1, map: 'de_anubis', rounds: [] });
    const fallback = convertRecording(noSide, { ourSide: 'CT', overtimeLimit: 0 });
    expect(fallback.rounds[0]?.state.ourSide).toBe('CT');
    expect(fallback.rounds[0]?.state.overtimeLimit).toBe(0);
    expect(fallback.rounds[0]?.winner).toBe('them');
    expect(fallback.rounds[0]?.state.ourPlayers.map((player) => player.cash)).toEqual([3000]);
  });

  it('rejects an overtime limit other than 0 or 1', () => {
    expect(() => convertRecording([], { overtimeLimit: 2 as never })).toThrow(RecordingError);
  });
});

describe('recorded match', () => {
  it(
    'records a fixture match and reviews the converted JSON',
    async () => {
      const payloads = buildMatch();
      const dir = mkdtempSync(path.join(tmpdir(), 'roundmind-match-'));
      dirs.push(dir);
      const jsonlPath = path.join(dir, 'match.jsonl');
      const matchPath = path.join(dir, 'match.json');

      const server = new GsiServer({
        port: 0,
        onAccepted: (event) => {
          appendRecordingLine(jsonlPath, event.payload, event.receivedAt);
        },
      });
      servers.push(server);
      const address = await server.start();
      const base = `http://${address.host}:${address.port}`;

      for (const payload of payloads) {
        const response = await fetch(`${base}/gsi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        expect(response.status, await response.clone().text()).toBe(200);
      }
      await server.stop();

      const recorded = readFileSync(jsonlPath, 'utf8');
      expect(recorded.split('\n').filter((entry) => entry.length > 0)).toHaveLength(payloads.length);
      expect(recorded).not.toContain('roundmind-local-dev');
      expect(recorded).not.toContain('should-not-leak-token');
      expect(recorded).not.toContain('sentinel-');
      expect(recorded).not.toContain('bomb-x');
      expect(recorded).not.toContain('nade-x');
      expect(recorded).not.toContain('not-part-of-gamestate');
      expect(recorded).toContain('"v":1');
      for (const entry of readRecording(recorded)) {
        expect(entry.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }

      const match = convertRecording(readRecording(recorded));
      expect(match.schemaVersion).toBe(1);
      expect(match.map).toBe('de_mirage');
      const rounds = match.rounds;
      expect(rounds.map((round) => round.roundNumber)).toEqual([1, 2, 3, 13, 25]);
      expect(rounds.map((round) => round.chosenBuy)).toEqual(['full', 'force', 'save', 'full', 'full']);
      expect(rounds.map((round) => round.winner)).toEqual(['us', 'them', 'them', 'us', 'us']);
      expect(rounds.map((round) => round.state.ourSide)).toEqual(['CT', 'CT', 'CT', 'T', 'CT']);
      expect(rounds.map((round) => round.state.history.length)).toEqual([0, 1, 2, 12, 24]);
      expect(rounds[1]?.state.history[0]).toEqual({ winner: 'CT', reason: 'elimination' });
      expect(rounds[3]?.state.history[0]).toEqual({ winner: 'CT', reason: 'elimination' });
      expect(rounds[0]?.state.ourPlayers.map((player) => player.cash)).toEqual([800, 800]);
      expect(rounds[1]?.state.ourPlayers.map((player) => player.cash)).toEqual([3500, 2800]);
      expect(rounds[2]?.state.ourPlayers).toEqual([
        { id: AVA, cash: 2200, hasPrimary: true, equipmentValue: 2700 },
      ]);
      expect(JSON.stringify(rounds[2]?.state)).not.toContain(BO);
      expect(JSON.stringify(rounds[2]?.state)).not.toContain('"cash":0');
      expect(rounds[3]?.state.ourPlayers.map((player) => player.cash)).toEqual([4200]);
      expect(JSON.stringify(rounds[3]?.state)).not.toContain('5500');
      expect(rounds[4]?.state).toMatchObject({ roundNumber: 25, ourSide: 'CT', overtimeLimit: 1 });
      expect(rounds[4]?.state.ourPlayers.map((player) => player.cash)).toEqual([10400]);
      expect(JSON.stringify(rounds[4]?.state)).not.toContain('2300');
      for (const round of rounds) {
        expect(round.state.roundNumber).toBe(round.roundNumber);
        for (const player of round.state.ourPlayers) {
          expect(player.cash).toBeGreaterThan(0);
        }
      }

      const converted = spawnSync(
        'npm',
        ['run', 'convert', '-w', '@roundmind/gsi', '--', jsonlPath, '--out', matchPath],
        { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 },
      );
      expect(converted.status, `${converted.stdout}\n${converted.stderr}`).toBe(0);
      const written = JSON.parse(readFileSync(matchPath, 'utf8')) as {
        schemaVersion: number;
        map?: string;
        rounds: unknown[];
      };
      expect(written).toEqual(match);
      expect(JSON.stringify(written)).not.toMatch(/enemyCash|knownEnemyMoney|"enemy"|ourMoney/);

      const parsed = parseWithPr12Validator(written, dir);
      expect(parsed).toEqual({
        shape: 'document',
        schemaVersion: 1,
        map: 'de_mirage',
        rounds: [1, 2, 3, 13, 25],
      });

      const rejected = spawnSync(
        'npm',
        ['run', 'review', '-w', '@roundmind/post-match', '--', matchPath],
        { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 },
      );
      expect(rejected.status, rejected.stdout).not.toBe(0);
      expect(`${rejected.stdout}\n${rejected.stderr}`).toContain('array of round objects');

      const arrayPath = path.join(dir, 'rounds.json');
      const asArray = spawnSync(
        'npm',
        ['run', 'convert', '-w', '@roundmind/gsi', '--', jsonlPath, '--array', '--out', arrayPath],
        { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 },
      );
      expect(asArray.status, `${asArray.stdout}\n${asArray.stderr}`).toBe(0);
      expect(JSON.parse(readFileSync(arrayPath, 'utf8'))).toEqual(rounds);

      const review = spawnSync(
        'npm',
        ['run', 'review', '-w', '@roundmind/post-match', '--', arrayPath],
        { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 },
      );
      expect(review.status, `${review.stdout}\n${review.stderr}`).toBe(0);
      expect(review.stdout).toContain('RoundMind post-match review');
      expect(review.stdout).toContain('Rounds: 5');
      expect(review.stdout).toContain('Score source: engine');
    },
    90_000,
  );
});

describe('listener help', () => {
  it('lists record and convert', () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'packages/gsi/src/cli.ts', '--help'],
      { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('--record');
    expect(result.stdout).toContain('--convert');
    expect(result.stdout).toContain('--array');
    expect(result.stdout).toContain('schema v1');
    expect(result.stdout).toContain('GSI_RECORD');
  });
});

function buildMatch(): Payload[] {
  const warmup = prepared(pistol, 0, 0, 0, 'warmup');
  warmup.allgrenades = { '1': { type: 'smoke', position: 'nade-x, 0, 0' } };

  const round1Freeze = prepared(pistol, 1, 0, 0, 'freezetime');
  const scoreless: Payload = {
    provider: { name: 'Counter-Strike 2', timestamp: 3 },
    auth: { token: 'should-not-leak-token' },
  };
  const round1Live = prepared(pistol, 1, 0, 0, 'live');
  setMoney(round1Live, AVA, 0);
  setMoney(round1Live, BO, 0);
  const round1Over = withWins(prepared(pistol, 1, 1, 0, 'over'), { '1': 'ct_win_elimination' });
  const warmupAgain = prepared(pistol, 0, 0, 0, 'warmup');

  const round2Freeze = prepared(round2, 2, 1, 0, 'freezetime');
  const round2Again = prepared(round2, 2, 1, 0, 'freezetime');
  setMoney(round2Again, AVA, 1500);
  setMoney(round2Again, BO, 800);
  const round2Over = withWins(prepared(round2, 2, 1, 1, 'over'), {
    '1': 'ct_win_elimination',
    '2': 't_win_elimination',
  });

  const stale = prepared(pistol, 1, 1, 1, 'freezetime');
  setMoney(stale, AVA, 123);
  setMoney(stale, BO, 123);
  withWins(stale, { '1': 'ct_win_elimination' });

  const round3Freeze = prepared(round2, 3, 1, 1, 'freezetime');
  setMoney(round3Freeze, AVA, 2200);
  setWeapons(round3Freeze, AVA, AK);
  setEquip(round3Freeze, AVA, 2700);
  deleteMoney(round3Freeze, BO);
  round3Freeze.player = {
    steamid: AVA,
    name: 'Ava',
    team: 'CT',
    state: { health: 100, money: 2200, equip_value: 2700 },
    weapons: AK,
  };
  const round3Live = clonePayload(round3Freeze);
  setScore(round3Live, 3, 1, 1, 'live');
  setMoney(round3Live, AVA, 2000);
  const round3Over = withWins(prepared(round2, 3, 1, 2, 'over'), {
    '1': 'ct_win_elimination',
    '2': 't_win_elimination',
    '3': 't_win_elimination',
  });

  const halftime = prepared(secondHalf, 12, 7, 5, 'halftime');
  const round13Freeze = prepared(secondHalf, 13, 7, 5, 'freezetime');
  const round13Live = prepared(secondHalf, 13, 7, 5, 'live');
  setMoney(round13Live, AVA, 3400);
  const round13Over = withWins(prepared(secondHalf, 13, 7, 6, 'over'), {
    ...winsOf(secondHalf),
    '13': 't_win_elimination',
  });

  const round25Freeze = prepared(overtime, 25, 12, 12, 'freezetime');
  const round25Live = prepared(overtime, 25, 12, 12, 'live');
  setMoney(round25Live, AVA, 6400);
  const round25Over = withWins(prepared(overtime, 25, 13, 12, 'over'), {
    ...winsOf(overtime),
    '25': 'ct_win_elimination',
  });
  const round26Freeze = prepared(overtime, 26, 13, 12, 'freezetime');
  setMoney(round26Freeze, AVA, 9000);

  return [
    warmup,
    round1Freeze,
    scoreless,
    round1Live,
    round1Over,
    warmupAgain,
    round2Freeze,
    round2Again,
    round2Over,
    stale,
    round3Freeze,
    round3Live,
    round3Over,
    halftime,
    round13Freeze,
    round13Live,
    round13Over,
    round25Freeze,
    round25Live,
    round25Over,
    round26Freeze,
  ];
}

function prepared(base: Payload, round: number, ct: number, t: number, phase: Phase): Payload {
  const payload = clonePayload(base);
  setScore(payload, round, ct, t, phase);
  return payload;
}

function setScore(payload: Payload, round: number, ct: number, t: number, phase: Phase): void {
  const map = asRecord(payload.map);
  map.name = 'de_mirage';
  map.phase = phase === 'halftime' ? 'intermission' : phase === 'warmup' ? 'warmup' : 'live';
  map.round = round;
  const ctTeam = asRecord(map.team_ct ?? {});
  const tTeam = asRecord(map.team_t ?? {});
  ctTeam.score = ct;
  tTeam.score = t;
  map.team_ct = ctTeam;
  map.team_t = tTeam;
  payload.map = map;
  const roundPhase = phase === 'halftime' ? 'over' : phase;
  payload.round = { ...asRecord(payload.round), phase: roundPhase };
  payload.phase_countdowns = {
    phase: phase === 'halftime' ? 'halftime' : phase,
    phase_ends_in: '10',
  };
}

function setMoney(payload: Payload, steamId: string, money: number): void {
  const players = asRecord(payload.allplayers);
  const player = asRecord(players[steamId]);
  const state = asRecord(player.state ?? {});
  state.money = money;
  player.state = state;
  players[steamId] = player;
  payload.allplayers = players;
  if (payload.player && asRecord(payload.player).steamid === steamId) {
    const focused = asRecord(payload.player);
    const focusedState = asRecord(focused.state ?? {});
    focusedState.money = money;
    focused.state = focusedState;
    payload.player = focused;
  }
}

function setEquip(payload: Payload, steamId: string, equip: number): void {
  const state = asRecord(asRecord(asRecord(payload.allplayers)[steamId]).state);
  state.equip_value = equip;
}

function setWeapons(payload: Payload, steamId: string, weapons: Record<string, unknown>): void {
  asRecord(asRecord(payload.allplayers)[steamId]).weapons = weapons;
}

function deleteMoney(payload: Payload, steamId: string): void {
  const state = asRecord(asRecord(asRecord(payload.allplayers)[steamId]).state);
  delete state.money;
  delete state.equip_value;
}

function withWins(payload: Payload, wins: Record<string, string>): Payload {
  asRecord(payload.map).round_wins = wins;
  return payload;
}

function winsOf(payload: Payload): Record<string, string> {
  return { ...(asRecord(asRecord(payload.map).round_wins) as Record<string, string>) };
}

function roundPair(mapName: string, cash: number, steamId: string): GsiRecordingLine[] {
  return [
    line({
      map: { name: mapName, phase: 'live', round: 1, team_ct: { score: 0 }, team_t: { score: 0 } },
      round: { phase: 'freezetime' },
      phase_countdowns: { phase: 'freezetime', phase_ends_in: '15' },
      player: { steamid: steamId, team: 'CT', state: { money: cash } },
    }),
    line({
      map: { name: mapName, phase: 'live', round: 1, team_ct: { score: 0 }, team_t: { score: 0 } },
      round: { phase: 'live' },
      phase_countdowns: { phase: 'live', phase_ends_in: '100' },
      player: { steamid: steamId, team: 'CT', state: { money: cash - 800 } },
    }),
    line({
      map: { name: mapName, phase: 'live', round: 1, team_ct: { score: 1 }, team_t: { score: 0 } },
      round: { phase: 'over', win_team: 'CT' },
      phase_countdowns: { phase: 'over', phase_ends_in: '5' },
    }),
  ];
}

function freezeAt(round: number, ct: number, t: number, cash: number, primary: boolean): Payload {
  return {
    map: { name: 'de_anubis', phase: 'live', round, team_ct: { score: ct }, team_t: { score: t } },
    round: { phase: 'freezetime' },
    phase_countdowns: { phase: 'freezetime', phase_ends_in: '12' },
    player: {
      steamid: '9',
      name: 'Ava',
      team: 'CT',
      state: { money: cash, equip_value: primary ? 2700 : 200 },
      weapons: primary ? AK : { weapon_1: { name: 'weapon_usp_silencer', type: 'Pistol' } },
    },
  };
}

function overAt(round: number, ct: number, t: number): Payload {
  return {
    map: { name: 'de_anubis', phase: 'live', round, team_ct: { score: ct }, team_t: { score: t } },
    round: { phase: 'over' },
    phase_countdowns: { phase: 'over', phase_ends_in: '3' },
  };
}

function jumpAhead(): Payload {
  return {
    map: { name: 'de_anubis', phase: 'live', round: 8, team_ct: { score: 5 }, team_t: { score: 3 } },
    round: { phase: 'freezetime' },
    phase_countdowns: { phase: 'freezetime', phase_ends_in: '15' },
    player: { steamid: '9', team: 'CT', state: { money: 1000 } },
  };
}

function spectatorFreeze(): Payload {
  return {
    map: { name: 'de_anubis', phase: 'live', round: 2, team_ct: { score: 1 }, team_t: { score: 0 } },
    round: { phase: 'freezetime' },
    phase_countdowns: { phase: 'freezetime', phase_ends_in: '10' },
    allplayers: {
      '5': {
        name: 'Bo',
        team: 'CT',
        state: { money: 3000 },
        weapons: { weapon_1: { name: 'weapon_glock', type: 'Pistol' } },
      },
    },
  };
}

const PR12_REF = 'origin/cursor/post-match-review-ui-ee69';

function parseWithPr12Validator(
  document: unknown,
  dir: string,
): { shape: string; schemaVersion: number; map: string | null; rounds: number[] } {
  const present = spawnSync('git', ['rev-parse', '--verify', '--quiet', PR12_REF], { cwd: repoRoot });
  if (present.status !== 0) {
    const fetched = spawnSync(
      'git',
      ['fetch', '--depth', '1', 'origin', 'cursor/post-match-review-ui-ee69'],
      { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 },
    );
    if (fetched.status !== 0) {
      throw new Error(fetched.stderr || 'could not fetch the review-UI branch');
    }
  }

  const source = execFileSync('git', ['show', `${PR12_REF}:post-match/src/match-file.ts`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const economy = pathToFileURL(path.join(repoRoot, 'post-match/src/economy-engine.ts')).href;
  const reviewTypes = pathToFileURL(path.join(repoRoot, 'post-match/src/review.ts')).href;
  const parserPath = path.join(dir, 'pr12-match-file.ts');
  writeFileSync(
    parserPath,
    source
      .replaceAll('from "./economy-engine.js"', `from ${JSON.stringify(economy)}`)
      .replaceAll('from "./review.js"', `from ${JSON.stringify(reviewTypes)}`),
  );
  const inputPath = path.join(dir, 'pr12-input.json');
  const runnerPath = path.join(dir, 'run-pr12-parser.mts');
  writeFileSync(inputPath, JSON.stringify(document));
  writeFileSync(
    runnerPath,
    `import { readFileSync } from 'node:fs';
import { parseMatchFile } from ${JSON.stringify(pathToFileURL(parserPath).href)};
const parsed = parseMatchFile(JSON.parse(readFileSync(${JSON.stringify(inputPath)}, 'utf8')));
console.log(JSON.stringify({
  shape: parsed.shape,
  schemaVersion: parsed.document.schemaVersion,
  map: parsed.document.map ?? null,
  rounds: parsed.rounds.map((round) => round.roundNumber),
}));
`,
  );
  const result = spawnSync(process.execPath, ['--import', 'tsx', runnerPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'PR #12 parser failed');
  }
  return JSON.parse(result.stdout) as {
    shape: string;
    schemaVersion: number;
    map: string | null;
    rounds: number[];
  };
}

function line(payload: Payload, receivedAt = '2026-11-12T20:00:00.000Z'): GsiRecordingLine {
  return { v: 1, receivedAt, payload };
}

async function loadFixture(name: string): Promise<Payload> {
  return JSON.parse(await readFile(path.join(fixturesDir, name), 'utf8')) as Payload;
}

function clonePayload(value: Payload): Payload {
  return JSON.parse(JSON.stringify(value)) as Payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('expected object');
  }
  return value as Record<string, unknown>;
}
