import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RecordingError,
  appendRecordingLine,
  readRecording,
  sanitizeRecordedPayload,
} from '../src/record.js';
import { GsiServer } from '../src/server.js';

const servers: GsiServer[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('sanitizeRecordedPayload', () => {
  it('drops the token, positions, facing, previous state, and grenades', () => {
    const sanitized = sanitizeRecordedPayload({
      auth: { token: 'roundmind-local-dev' },
      previously: { player: { position: 'old-x' } },
      allgrenades: { '1': { position: 'nade-x' } },
      player_position: '1',
      player: {
        steamid: '76561198000000001',
        position: 'sentinel-x, sentinel-y, sentinel-z',
        forward: '0, 1, 0',
        state: { money: 800, equip_value: 200 },
        weapons: { weapon_1: { name: 'weapon_usp_silencer', type: 'Pistol' } },
      },
      bomb: { state: 'carried', position: 'bomb-x, bomb-y, bomb-z', player: '76561198000000011' },
      allplayers: {
        '76561198000000001': { team: 'CT', Forward: '9, 0, 0', state: { money: 800 } },
      },
    });

    expect(sanitized).toEqual({
      player: {
        steamid: '76561198000000001',
        state: { money: 800, equip_value: 200 },
        weapons: { weapon_1: { name: 'weapon_usp_silencer', type: 'Pistol' } },
      },
      bomb: { state: 'carried', player: '76561198000000011' },
      allplayers: {
        '76561198000000001': { team: 'CT', state: { money: 800 } },
      },
    });
    expect(JSON.stringify(sanitized)).not.toContain('roundmind-local-dev');
    expect(JSON.stringify(sanitized)).not.toContain('sentinel-');
    expect(JSON.stringify(sanitized)).not.toContain('nade-x');
  });
});

describe('JSONL recording', () => {
  it('appends version-1 lines and reads them back', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'roundmind-record-'));
    dirs.push(dir);
    const file = path.join(dir, 'match.jsonl');
    const when = new Date('2026-11-12T20:21:00.123Z');
    appendRecordingLine(file, { auth: { token: 'secret' }, map: { round: 1 }, player: { position: '1, 2, 3' } }, when);
    appendRecordingLine(file, { map: { round: 2, team_ct: { score: 1 }, team_t: { score: 0 } } }, when);

    const text = readFileSync(file, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n').filter((line) => line.length > 0)).toHaveLength(2);
    const lines = readRecording(`\n${text}\n`);
    expect(lines[0]).toEqual({
      v: 1,
      receivedAt: '2026-11-12T20:21:00.123Z',
      payload: { map: { round: 1 }, player: {} },
    });
    expect(lines[1]?.payload).toMatchObject({ map: { round: 2 } });
    expect(text).not.toContain('secret');
  });

  it('rejects a line that is not version 1', () => {
    expect(() => readRecording('{')).toThrow(RecordingError);
    expect(() => readRecording('{"v":2,"receivedAt":"2026-11-12T00:00:00.000Z","payload":{}}')).toThrow(/version 2/);
    expect(() => readRecording('{"v":1,"receivedAt":"nope","payload":{}}')).toThrow(/receivedAt/);
    expect(() => readRecording('{"v":1,"receivedAt":"2026-11-12T00:00:00.000Z","payload":[]}')).toThrow(/payload/);
  });
});

describe('GsiServer recording hook', () => {
  it('reports only accepted payloads, already sanitized', async () => {
    const seen: unknown[] = [];
    const server = new GsiServer({
      port: 0,
      authToken: 'roundmind-local-dev',
      onAccepted: (event) => {
        seen.push(event.payload);
        expect(event.receivedAt).toBeInstanceOf(Date);
      },
    });
    servers.push(server);
    const address = await server.start();
    const base = `http://${address.host}:${address.port}`;

    const denied = await fetch(`${base}/gsi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auth: { token: 'nope' }, map: { round: 1 } }),
    });
    expect(denied.status).toBe(401);

    const broken = await fetch(`${base}/gsi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(broken.status).toBe(400);
    expect(seen).toHaveLength(0);

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);

    const accepted = await fetch(`${base}/gsi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth: { token: 'roundmind-local-dev' },
        map: { name: 'de_mirage', round: 1, phase: 'live', team_ct: { score: 0 }, team_t: { score: 0 } },
        round: { phase: 'freezetime' },
        player: { steamid: '1', team: 'CT', position: 'sentinel-x', state: { money: 800 } },
        allgrenades: { '1': { position: 'nade-x' } },
      }),
    });
    expect(accepted.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(seen[0])).not.toContain('roundmind-local-dev');
    expect(JSON.stringify(seen[0])).not.toContain('sentinel-x');
    expect(JSON.stringify(seen[0])).not.toContain('nade-x');
    expect(JSON.stringify(seen[0])).toContain('"money":800');
  });
});
