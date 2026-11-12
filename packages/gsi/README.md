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

`GSI_HOST`, `GSI_PORT`, `GSI_TOKEN`, `GSI_SIDE`, `GSI_OVERTIME_LIMIT`, and `GSI_RECORD` do the same thing. When `--token` / `GSI_TOKEN` is set, the body must include a matching `auth.token`. When it is unset, any local sender is accepted. `--side` overrides the focused player's team on the live log. `--overtime-limit` is `1` (Premier, the default) or `0` (repeated overtime). GSI does not tell us which format is running. `--record` is off unless you pass it; see [Record a match](#record-a-match).

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

## Record a match

Recording is off unless you pass `--record`. Each POST that passes auth and `normalizeGsiPayload` is appended to that file. Rejected bodies (bad JSON, wrong token, normalize error) are not written. The listener does not rewrite earlier lines, so a restarted process continues the same file.

```bash
npm run dev -w @roundmind/gsi -- --token roundmind-local-dev --record ./match.jsonl
```

`GSI_RECORD` is the same path. `--record` does not apply to `--mock`.

### Recording file (version 1)

UTF-8 JSONL, no BOM. One JSON object per line, LF-terminated. Readers skip blank lines and reject any line whose `v` is not `1`.

| Field | Type | Meaning |
| --- | --- | --- |
| `v` | `1` | Format version. |
| `receivedAt` | string | ISO-8601 UTC from `Date.toISOString()`, the time this process accepted the POST. This is not `provider.timestamp`. |
| `payload` | object | The accepted GSI body after the fields below are removed. |

`payload` keeps every other field Valve sent, including money, weapons, round phase, scores, `map.round_wins`, bomb state, and provider. Nothing is inferred into the payload.

These keys are removed anywhere in the tree, case-insensitively, so a recording cannot become a position or grenade log:

| Key | Why |
| --- | --- |
| `auth` | The shared token. |
| `previously` | Valve's previous-state delta. It can echo positions. |
| `position`, `forward` | World position and facing. |
| `allgrenades`, `grenades`, `player_position`, `allplayers_position` | Grenade and position feeds. The sample cfg already sets those channels to `"0"`. |

Example line:

```json
{"v":1,"receivedAt":"2026-11-12T20:21:00.123Z","payload":{"map":{"name":"de_mirage","phase":"live","round":1,"team_ct":{"score":0},"team_t":{"score":0}},"round":{"phase":"freezetime"},"player":{"steamid":"76561198000000001","team":"CT","state":{"money":800}}}}
```

Lines are in accept order. Conversion walks the file in that order and does not sort by `receivedAt`.

## Convert a recording

```bash
npm run convert -w @roundmind/gsi -- ./match.jsonl --out ./match.json
npm run convert -w @roundmind/gsi -- ./match.jsonl --array --out ./rounds.json
npm run review -w @roundmind/post-match -- ./rounds.json
```

`--out` writes the review file. Without `--out`, the JSON goes to stdout and the summary goes to stderr. The default file is match schema version 1, the document the review UI reads:

```json
{
  "schemaVersion": 1,
  "map": "de_mirage",
  "rounds": [
    {
      "roundNumber": 1,
      "winner": "us",
      "chosenBuy": "full",
      "state": { "roundNumber": 1, "ourSide": "CT", "ourPlayers": [], "history": [] }
    }
  ]
}
```

`schemaVersion` is the number `1`. `rounds` holds one object per reviewed freeze. `map` is set when the recording named one map; it is not scored. `label` is left unset. Round numbers are unique. `state.roundNumber` matches `roundNumber`. `state` does not contain enemy-cash fields.

The post-match CLI on `main` still requires a bare array of rounds, so it rejects this document. `--array` writes that array for `npm run review` until the schema v1 CLI lands. The review page reads the versioned document, not the array.

`--side CT|T` is used only when a freeze payload has no focused `player.team` and that player's steam id is not in `allplayers`. A team GSI already sent is kept, including the team after a halftime swap. `--overtime-limit` is copied onto each snapshot (`1` Premier, `0` repeated overtime).

`state` is `toFreezeSnapshot` of the **first** `freezetime` payload of that round (the pre-buy snapshot `evaluateFreeze` already accepts). A teammate with no `money` field is omitted there. Missing cash is never written as `$0`.

`chosenBuy` is the buy inferred from what the team held after that freeze:

1. The post-buy sample is the last later `freezetime` payload, or a `live` / `bomb` / `defuse` payload for the same round. A second freeze does not replace the pre-buy snapshot. The `over` payload is not a buy sample, because round-end rewards are already in that cash.
2. Spend is the average drop in `money` among own-side players who reported cash in both samples. A player missing from either sample is skipped. A cash increase is ignored.
3. The lines are the economy engine's, not a second price table: `fullBuyCash`, `forceBuyCash`, `POLICY.pistolSpendLow` ($800), `POLICY.pistolSpendHigh` ($300), and `POLICY.savePrimaryRatio` (0.6). Pistol rounds are 1 and 13. Overtime is not a pistol round.
   - Pistol: spend ≥ $800 is `full`, ≥ $300 is `force`, otherwise `eco`.
   - Other rounds: spend ≥ rifle + helmet (T $3700 / CT $3900) is `full`. Spend ≥ SMG + kevlar (T $1700 / CT $1900) is `force`.
   - `save` on a non-pistol round when every teammate who reported cash also reported weapons, at least 60% of them already held a primary, they still do after the buy, and the spend is below that force line. If any of those teammates omitted weapons, this is not a save.
   - Otherwise `eco`.
4. When spend cannot be computed, those full and force lines are applied to the average `equip_value` after the buy. A qualifying primary ratio is still `save` when that equipment value did not rise by a force buy.

`winner` is `us` when the side that won the round is the snapshot's `ourSide`, otherwise `them`. The coached side is `player.team`. If that object is missing, the converter keeps the last `player.steamid` and reads that id's team from `allplayers`, which is how a halftime swap is picked up. The winner comes from `map.round_wins` when that round is listed, otherwise from a one-point score change after the freeze.

These payloads do not become rounds:

- Warmup, `map.round` below 1, and any body with no CT and T scores.
- A lower `map.round` than one already seen, and a score drop on a round greater than 1. Those are stale reconnect packets.
- A round that never showed a freeze snapshot, or never showed a winner (the recording stopped mid-round).

A map-name change, or a score drop on round 1, starts a new match. The file then converts to that later match only. Use a new `--record` path for each match you want to keep. An empty recording converts to `{ "schemaVersion": 1, "rounds": [] }`.

## Compliance

This listener is read-only Game State Integration.

- It does not read game memory, scan the CS2 process, or install hooks.
- It does not inject keyboard, mouse, or console input.
- It does not draw an overlay that buys, moves, shoots, or otherwise plays.
- The sample config does not request positions or grenades. The normalizer drops those fields if a different config sends them. A `--record` file drops them too, and does not add any feed the listener did not accept.
- Run it beside the game on `127.0.0.1`. Follow Valve's rules and any tournament rules that apply to you.
