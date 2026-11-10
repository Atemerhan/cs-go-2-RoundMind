# @roundmind/gsi

Read-only [CS2 Game State Integration](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration) ingestion for RoundMind.

The package listens for Valve's JSON POST, normalizes it into a `GameState`, and can replay freeze-time fixtures with no CS2 client running. It does not decide buys. The buy call is `evaluateFreeze` from `@roundmind/engine`. This package only builds that function's input via `toFreezeSnapshot`. It does not export `recommend` or `evaluateBuyOptions`.

## Run the listener

```bash
cd packages/gsi
npm install
npm run dev
```

That binds `http://127.0.0.1:3000`.

- `POST /gsi` (and `POST /`) — CS2 payload. Body `ok` on success.
- `GET /` — smoke page (black / gold). Latest `GameState` JSON, Chinese and English labels.
- `GET /state` — same JSON for scripts.
- `GET /health` — `{ "ok": true }`.

Each accepted POST prints the `GameState` JSON on stdout. stderr logs the `toFreezeSnapshot` object (round, side, own cash, history). That object is what you pass to `evaluateFreeze`. There is no placeholder buy class.

```bash
npm run dev -- --host 127.0.0.1 --port 3000 --token roundmind-local-dev --side CT --overtime-limit 1
```

`GSI_HOST`, `GSI_PORT`, `GSI_TOKEN`, `GSI_SIDE`, and `GSI_OVERTIME_LIMIT` do the same thing. When `--token` / `GSI_TOKEN` is set, the body must include a matching `auth.token`. When it is unset, any local sender is accepted. `--side` overrides the focused player's team. `--overtime-limit` is `1` (Premier, the default) or `0` (repeated overtime). GSI does not tell us which format is running.

Without CS2, replay the freeze-time fixtures:

```bash
npm run mock
npm test
npm run build
```

After `npm run build`, `npm start` runs `dist/cli.js`.

## CS2 config

Copy [`examples/gamestate_integration_roundmind.cfg`](examples/gamestate_integration_roundmind.cfg) into the CS2 cfg directory. The file name must match `gamestate_integration_*.cfg`. Save it as UTF-8 **without** a BOM, then fully restart CS2. Valve reads these files at launch.

| OS | Folder |
| --- | --- |
| Windows | `C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg\` |
| Linux | `~/.steam/steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/` |
| macOS | `~/Library/Application Support/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/` |

The sample posts to `http://127.0.0.1:3000/gsi` with token `roundmind-local-dev`. Change the token in the cfg and pass the same value to `--token`.

Subscribed fields: provider, map, map round wins, round, phase countdowns, the focused player's id / state / weapons, all-player id / state / weapons, and bomb **state**. `player_position`, `allplayers_position`, and `allgrenades` are set to `"0"`.

`allplayers_*` is only filled when the client is observing or watching GOTV. A normal playing client receives the local `player` object, so the other side will be missing from `economies`. Missing means "Valve did not send it", not `$0`.

## What a GameState contains

`normalizeGsiPayload(json, history?)` returns:

- `map` — name, mode, raw map phase
- `match` — `format: 'MR12'`, round, half, overtime flag, overtime period
- `round.phase` — `freezetime`, `live`, `bomb`, `defuse`, `over`, `halftime`, `timeout`, `paused`, `warmup`, `gameover`, or `unknown`
- `round.timeRemaining` — `phase_countdowns.phase_ends_in` when present
- `score` — CT / T score and consecutive losses when Valve sent them
- `playerSide` — focused player's team
- `economies.CT` / `economies.T` — only sides present in the payload. Totals sum players who reported `money` or `equip_value`
- `bomb` — status, carrier / defuser steam id, countdown. No coordinates
- `recentRoundOutcomes` — from `map.round_wins` when that key exists (even if empty). Otherwise score increases seen by the shared `ScoreHistory`, plus a reason when the transition showed it (bomb explode / defuse, a five-player wipe, or the live clock hitting 0). Joining mid-match does not invent earlier rounds. A score change alone does not invent a reason
- `observedAt` — provider timestamp

`reason` uses the engine's words: `elimination`, `bomb_explode`, `bomb_defuse`, `time`. `gsiReason` keeps Valve's raw string (`ct_win_elimination`, `t_win_bomb`, …) when `map.round_wins` was the source.

MR12: rounds 1–12 are half 1, 13–24 are half 2. Overtime is MR3 (3 rounds per side). Round 25 starts overtime period 1, half 3.

World position, facing vectors, grenade data, and the auth token are never copied onto `GameState`.

## Mock feed

```ts
import { MockGsiFeed } from '@roundmind/gsi';

const feed = new MockGsiFeed();
await feed.load();
for (const state of feed.replay()) {
  // freeze-time GameState, oldest fixture first
}
```

Fixtures live in [`fixtures/`](fixtures/). Files whose round phase is not `freezetime` are skipped unless `freezeTimeOnly: false`.

From a root app that is not an npm workspace:

```json
{
  "dependencies": {
    "@roundmind/gsi": "file:./packages/gsi"
  }
}
```

Build this package first so `dist/` exists, or depend on it from a workspace and run `npm run build -w @roundmind/gsi`.

## toFreezeSnapshot

`@roundmind/engine` (engine PR, not merged into this branch) exports `evaluateFreeze(snapshot)`. Enemy cash is never an input. This package does not implement that function and does not add a second engine API. ahi's post-match review assumed `recommend` / `evaluateBuyOptions`; adapt that review to `evaluateFreeze` rather than teaching GSI a parallel shape.

```ts
import { evaluateFreeze } from "@roundmind/engine";
import { toFreezeSnapshot, type GameState } from "@roundmind/gsi";

export function advise(state: GameState) {
  return evaluateFreeze(
    toFreezeSnapshot(state, {
      ourSide: "CT", // optional when state.playerSide is set
      overtimeLimit: 1, // Premier. 0 = repeated overtime
    }),
  );
}

advise(state).buy; // "full" | "force" | "eco" | "save" | null
advise(state).reason.code;
advise(state).enemy.band;
```

`toFreezeSnapshot(state, options?)` returns:

| Field | Source |
| --- | --- |
| `roundNumber` | Round about to be played. `map.round` during freeze / live. After `over` or halftime, that round plus one. |
| `ourSide` | `options.ourSide`, else `playerSide`. Throws if both are missing. |
| `overtimeLimit` | `1` unless you pass `0`. |
| `ourPlayers` | Own side only. `id`, `cash` (`money`), `hasPrimary` (rifle / SMG / shotgun / sniper / machine gun), optional `equipmentValue`. Players with no `money` are omitted, not sent as `$0`. |
| `history` | `{ winner, reason, alive?, bombPlanted? }` oldest first. Stops at the first outcome that has no `reason`, so a hole is not shifted into a later round. |
| `score` | `{ CT, T }` from GSI. |
| `lossCount` | `consecutive_round_losses` when Valve sent it. Not a bonus formula. |

`alive` is set only when that side had five health values on the round-end payload. One player's health is not a team wipe. `bombPlanted` is set only when this process saw a plant. Kill rewards are not computed here.

Until `packages/engine` is on `main`, install the two packages side by side. The snapshot type is structural: it matches `FreezeSnapshot` in the engine PR. Do not copy loss-bonus or weapon prices into `packages/gsi`.

## Compliance

This listener is read-only Game State Integration.

- It does not read game memory, scan the CS2 process, or install hooks.
- It does not inject keyboard, mouse, or console input.
- It does not draw an overlay that buys, moves, shoots, or otherwise plays.
- The sample config does not request positions or grenades. The normalizer drops those fields if a different config sends them.
- Run it beside the game on `127.0.0.1`. Follow Valve's rules and any tournament rules that apply to you.
