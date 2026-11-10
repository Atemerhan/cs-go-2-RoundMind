import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeGsiPayload } from '../src/normalize.js';
import { renderSmokePage } from '../src/smoke-page.js';
import { GsiServer } from '../src/server.js';

const pistolPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/01-pistol-round-freeze.json',
);

const servers: GsiServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe('renderSmokePage', () => {
  it('escapes player names so the smoke page stays a JSON view', () => {
    const state = normalizeGsiPayload({
      player: {
        steamid: '1',
        name: '</pre><script>alert(1)</script>',
        team: 'CT',
        state: { money: 800 },
      },
    });
    const html = renderSmokePage(state);
    expect(html).toContain('&lt;/pre&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert');
  });
});

describe('GsiServer', () => {
  it('serves the smoke page and the latest GameState from a POST', async () => {
    const seen: string[] = [];
    const server = new GsiServer({
      port: 0,
      onState: (state) => {
        seen.push(state.round.phase);
      },
    });
    servers.push(server);
    const address = await server.start();
    const base = `http://${address.host}:${address.port}`;

    const health = await fetch(`${base}/health`);
    expect(await health.json()).toEqual({ ok: true });

    const before = await fetch(`${base}/state`);
    expect(await before.json()).toBeNull();

    const page = await fetch(`${base}/`);
    expect(page.headers.get('content-type')).toContain('text/html');
    const html = await page.text();
    expect(html).toContain('最新对局状态');
    expect(html).toContain('Latest GameState');
    expect(html).toContain('回合阶段');

    const payload = await readFile(pistolPath, 'utf8');
    const posted = await fetch(`${base}/gsi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    expect(posted.status).toBe(200);
    expect(await posted.text()).toBe('ok');

    const latest = await fetch(`${base}/state`);
    const state = (await latest.json()) as { round: { phase: string }; bomb: { status: string } };
    expect(state.round.phase).toBe('freezetime');
    expect(state.bomb.status).toBe('carried');
    expect(JSON.stringify(state)).not.toContain('sentinel-');
    expect(seen).toEqual(['freezetime']);

    const pageAfter = await fetch(`${base}/`);
    const htmlAfter = await pageAfter.text();
    expect(htmlAfter).toContain('de_mirage');
    expect(htmlAfter).toContain('freezetime');
    expect(htmlAfter).toContain('回合阶段');
    expect(htmlAfter).not.toContain('sentinel');
    expect(htmlAfter).not.toContain('<script>alert');

    const bad = await fetch(`${base}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(bad.status).toBe(400);

    const notObject = await fetch(`${base}/gsi`, {
      method: 'POST',
      body: '[]',
    });
    expect(notObject.status).toBe(400);
    expect(server.getLatest()?.round.phase).toBe('freezetime');
  });

  it('rejects a POST when the configured auth token does not match', async () => {
    const server = new GsiServer({ port: 0, authToken: 'roundmind-local-dev' });
    servers.push(server);
    const address = await server.start();
    const base = `http://127.0.0.1:${address.port}`;

    const denied = await fetch(`${base}/gsi`, {
      method: 'POST',
      body: JSON.stringify({ auth: { token: 'nope' }, map: { round: 1 } }),
    });
    expect(denied.status).toBe(401);
    expect(server.getLatest()).toBeNull();

    const allowed = await fetch(`${base}/gsi`, {
      method: 'POST',
      body: JSON.stringify({
        auth: { token: 'roundmind-local-dev' },
        map: { name: 'de_ancient', round: 8, phase: 'live', team_ct: { score: 4 }, team_t: { score: 3 } },
        round: { phase: 'freezetime' },
      }),
    });
    expect(allowed.status).toBe(200);
    expect(server.getLatest()).toMatchObject({
      map: { name: 'de_ancient' },
      match: { round: 8, half: 1, overtime: false },
    });
  });
});
