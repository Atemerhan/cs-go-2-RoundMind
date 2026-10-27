# `@roundmind/engine`

Deterministic CS2 Premier bomb-defusal economy. No DOM, no network, no game process.

A later official GSI adapter should fill `FreezeSnapshot` and call `evaluateFreeze`. Post-match review can pass that same snapshot to `evaluateBuyOptions` and rank the buy the team actually made. This package does not open a socket and does not read memory. Enemy positions are not a field on the input.

Numeric status matches the sources doc (`docs/economy-rules.json` on the docs branch). This package does not own that file. Anything the sources pass left open is `unverified` in `src/rules.ts` and is not treated as a fact by the buy call.

## Call

```ts
import { evaluateFreeze } from "@roundmind/engine";

const advice = evaluateFreeze({
  roundNumber: 5,
  ourSide: "CT",
  overtimeLimit: 1,
  ourPlayers: [
    { id: "p1", cash: 1600, hasPrimary: false },
    { id: "p2", cash: 1600, hasPrimary: false },
    { id: "p3", cash: 1400, hasPrimary: false },
    { id: "p4", cash: 1800, hasPrimary: false },
    { id: "p5", cash: 1600, hasPrimary: true }
  ],
  history: [
    { winner: "T", reason: "elimination" },
    { winner: "T", reason: "bomb_explode" },
    { winner: "CT", reason: "elimination" },
    { winner: "T", reason: "time", alive: { T: 2 } }
  ]
});

advice.buy; // "full" | "force" | "eco" | "save" | null
advice.reason.code;
advice.enemy.band; // min/max per player and for the team of 5
```

`buy === null` when the roster is empty, Premier has drawn 15–15, or a team has already won.

## Compare every class

`evaluateFreeze` stays the one recommendation. `evaluateBuyOptions` scores the same snapshot so a caller can rank a buy the team actually made.

```ts
import { evaluateBuyOptions, evaluateFreeze, type BuyClass, type FreezeSnapshot } from "@roundmind/engine";

declare const snapshot: FreezeSnapshot;
declare const teamBuy: BuyClass; // class the team actually purchased

evaluateFreeze(snapshot).buy; // the unique best class, or null

const options = evaluateBuyOptions(snapshot);
// BuyOption[] in order: full, force, eco, save
// { buy: BuyClass; expectedValue: number }

const best = Math.max(...options.map((row) => row.expectedValue));
const played = options.find((row) => row.buy === teamBuy);
const regret = (played?.expectedValue ?? 0) - best; // 0 if the team matched, otherwise negative
```

`expectedValue` is a relative policy score in **loss-bonus steps**. One point equals `LOSS_BONUS_STEP` dollars ($500). Multiply by `LOSS_BONUS_STEP.value` to recover that many dollars of threshold gap. It is not estimated round-win money and not a prize.

The gaps are the ones the buy call already uses:

- cash versus the full, force, or utility line
- `averageCash + lossBonus` versus the next rifle buy (the eco-versus-force test)
- the poor and rich loadout bundles the projector spends for that class

On a live round the maximum is unique and is `evaluateFreeze(...).buy`. The value at that maximum is the slack on the rule that fired, and it is 0 when cash sits on the line. A pistol round's full-buy slack is the poor-path pistol bundle ($800), which is what the projector spends. Every other class is lower by the gap it gives up, and by at least $1 (0.002 steps) so a rounded tie cannot create a second maximum. There is no class-name tie-break. Subtracting the maximum cancels the slack, so the same kind of miss ranks the same on a $5,000 rifle round and a $10,000 overtime round.

When the roster is empty, the match is already over, or Premier has drawn, every `expectedValue` is 0 and `buy` is null.

## Input a GSI adapter may fill

| Field | Source later | Never |
| --- | --- | --- |
| `roundNumber` | map round about to be played, 1-based | |
| `ourSide` | the coached team this freeze | |
| `ourPlayers[].cash` | own-team money visible to GSI | enemy cash |
| `ourPlayers[].hasPrimary` | own primary still in hand | enemy inventory as a fact |
| `history[].winner` / `reason` | public round result | positions, angles, key state |
| `history[].alive` | optional headcount at round end | who is standing where |
| `history[].kills` or `killRewardTotal` | optional, tightens the band | |
| `history[].teamKills` | optional personal penalty | |
| `score` | optional; history wins are used when omitted | |
| `lossCount` | optional override | |
| `overtimeLimit` | `1` Premier (default), `0` repeated OT | |

Enemy money is always estimated. GSI does not provide it. The estimate is a band because kills, buys, and the timeout-income rule are not fully known.

## Output

- `buy` and `reason.code` — the coaching class and why. The web app turns the code into one Chinese or English sentence. The engine does not ask a language model to decide.
- `our` — exact cash you passed, loss count, loss bonus if this round is lost.
- `enemy.band` — poor path and rich path. `poorerBuy` / `richerBuy` are the classes those edges can afford.
- `enemy.assumptions` — includes `buy_spend_model` (how the simulator thinks they spent), `unknown_kills`, and `unverified_timeout_income` when a round ended on time.
- `warnings` — short history, cash above the cap, overtime loss-count uncertainty, and similar.

## Settlement order

For each completed round, per player, poor path and rich path:

1. Regulation half (rounds 1 and 13): cash becomes $800 and the loss count becomes 1. Verified.
2. Overtime half: cash becomes $10,000. The loss count is **not** reset. That reset is unverified.
3. Spend a coaching loadout (policy, built from verified prices). The poor path spends more.
4. Team-kill penalty, floored at $0. The floor itself is unverified.
5. Round-end income, then clamp at $16,000.
   - Win: $3250 elimination or time, $3500 detonation or defuse.
   - Loss: `1400 + 500 * min(lossCount, 4)`, using the count **entering** the round. The stored count then increases by one and is not capped. One win decreases it by one. A win does not return it to zero.
   - Planter: +$300 once. Not paid to every Terrorist.
   - Defuse after plant: +$600 to **each** Terrorist, on top of the loss bonus. Detonation does **not** add $600.
   - Defuser: +$300, on top of the $3500 team win.
   - Each CT: +$50 per dead Terrorist, win or lose. Terrorists do not receive the mirror award.
6. On a T time loss, the poor path pays living Terrorists $0 and the rich path pays the full loss bonus. The buy call does not choose save vs force from that split.

Shorthanded $1000 is verified as a convar and is not applied, because the per-missing-player multiplier is unverified and Majors set it to 0.

Hostage maps are not modeled.
