# match.json schema version 1

Post-match review reads a match file entirely in the browser, or from the local CLI. A GSI recording converter should write this document. The review UI parses it in `parseMatchFile` (`src/match-file.ts`) and does not score JSON on its own.

`examples/match.json` is the bundled sample (the same rounds as the built-in blueprint). The web review loads that sample without a game or a GSI connection.

## Document

```json
{
  "schemaVersion": 1,
  "label": "Sample match",
  "map": "de_mirage",
  "rounds": []
}
```

| Field | Required | Used for |
| --- | --- | --- |
| `schemaVersion` | yes | Must be the number `1`. Any other value is rejected. |
| `rounds` | yes | One entry per reviewed freeze. Order does not matter; the UI sorts by `roundNumber`. |
| `label` | no | Title shown in the review. Not scored. |
| `map` | no | Map name shown in the review. Not scored. |

Unknown keys are ignored. That keeps a future display field from needing a new version. A new required field, or a change to `rounds`, needs `schemaVersion: 2`.

The CLI and the parser also accept the older bare array of round objects (no `schemaVersion`). New files should use the document above.

## Round

```json
{
  "roundNumber": 7,
  "winner": "them",
  "chosenBuy": "full",
  "state": {
    "roundNumber": 7,
    "ourSide": "CT",
    "overtimeLimit": 1,
    "ourPlayers": [{ "id": "p1", "cash": 4200, "hasPrimary": true }],
    "history": [{ "winner": "T", "reason": "elimination" }]
  }
}
```

| Field | Required | Values |
| --- | --- | --- |
| `roundNumber` | yes | Positive integer. Unique in the file. |
| `winner` | yes | `"us"` or `"them"`, relative to `state.ourSide`. Reported only. It does not rank the buy. |
| `chosenBuy` | yes | `"full"`, `"force"`, `"eco"`, or `"save"`. The buy the team actually played. |
| `state` | one of `state` or `options` | Freeze snapshot **before** this round's purchases. Same object `evaluateFreeze` accepts. |
| `options` | one of `state` or `options` | Logged `evaluateBuyOptions` rows, `{ "buy", "expectedValue" }`. When present, these scores rank the round and the engine is not asked to rescore. |

`state.roundNumber` must equal the round's `roundNumber`.

`state` fields:

| Field | Required | Notes |
| --- | --- | --- |
| `roundNumber` | yes | 1-based round about to be played. |
| `ourSide` | yes | `"T"` or `"CT"`. |
| `ourPlayers` | yes | `{ "cash": number, "hasPrimary": boolean, "id"?: string }`. Own cash only. |
| `history` | yes | Completed public rounds, oldest first. `winner` is `"T"` or `"CT"`. `reason` is `elimination`, `bomb_explode`, `bomb_defuse`, or `time`. |
| `overtimeLimit` | no | `1` Premier (default), `0` repeated overtime. |
| `score` | no | `{ "T": number, "CT": number }`. |
| `lossCount` | no | `{ "T"?: number, "CT"?: number }`. |

Enemy cash is not an input. Keys such as `enemy`, `enemyCash`, `knownEnemyMoney`, and `ourMoney` are rejected. The engine estimates the enemy band from `history`.

`expectedValue` is a relative policy score in loss-bonus steps. One step is $500. It is not estimated round-win dollars. The highest score is the recommended buy. Leak cost is `best - chosen`.

## Try it

```bash
npm run review -w @roundmind/post-match -- post-match/examples/match.json
```

In the web app, open **赛后复盘** / **Review** (`#review`). The sample is already loaded. Drop a `match.json`, or use the file picker, to replace it.
