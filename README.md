# RoundMind

RoundMind is a CS2 buy-phase economy coach. During freeze time it recommends one buy — `full`, `force`, `eco`, or `save` — with a one-clause reason. After the match it reviews the decisions that cost the most expected value and names a better line for each.

The MVP is coaching on public information: official Game State Integration when that listener is connected, and economy rules the player could already compute. The poker-precedent line and the refuse list live in [docs/COMPLIANCE.md](docs/COMPLIANCE.md).

RoundMind 是 CS2 冻结时间的经济教练。冻结时间给出一种购买（`full` / `force` / `eco` / `save`）和一句理由。比赛结束后，复盘最亏期望价值的决定，并给出更好的一条线。

## Compliance / 合规

RoundMind reads the official CS2 Game State Integration feed and public economy rules, then speaks during freeze time and after the match. It does not read game memory, automate input, or surface hidden information.

The charter, including the poker precedent and the explicit refuse list (wallhack-style reads, auto-buy, memory reading, hidden info), is [docs/COMPLIANCE.md](docs/COMPLIANCE.md).

RoundMind 只读官方 GSI 和公开经济规则，在冻结时间和赛后开口。不读内存，不自动化输入，不提供隐藏信息。章程见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)。

## Module ownership / 模块归属

| Module | Owner | Path |
| --- | --- | --- |
| Deterministic economy engine, rule numbers, and the web calculator | zhasi | `packages/engine`, `apps/web`, `docs/economy-rules.json` |
| Calculator UI polish, after zhasi's engine PR merges | kohi | `apps/web` |
| CS2 Game State Integration live feed | koki | `src/gsi/` |
| Post-match decision-leak review, this compliance section, and `docs/COMPLIANCE.md` | ahi | `post-match/`, `docs/COMPLIANCE.md` |

Zhasi owns the rule numbers and `@roundmind/engine`. The review calls `evaluateFreeze` ([PR #3](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/3)). Kohi polishes the calculator UI after that PR merges. Koki emits the same freeze snapshot — `roundNumber`, `ourSide`, `ourPlayers`, `history` — and does not send enemy cash. Raw GSI parsing stays in `src/gsi/`.

Verified Premier/Competitive numbers are zhasi's [docs/economy-rules.json](docs/economy-rules.json) ([PR #2](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/2): 32 `VERIFIED`, 7 `UNVERIFIED`), with the source checklist in [docs/economy-rules-sources.md](docs/economy-rules-sources.md). `post-match/` does not re-implement that table. Once `packages/engine` lands, fixture states and any dollar amounts in this package stay consistent with the verified rows. Values the fixtures must follow:

- The planter receives $300 (`objective.plant_personal`).
- A defused bomb pays each Terrorist $600 (`objective.plant_team_if_defused`), on top of the loss bonus. The old $800 team plant award is not the current number.
- A win steps the loss count down one tier (`loss_bonus.win_steps_down`). The next loss does not jump back to the $1400 floor.
- Each half starts at loss count 1, so a pistol loss pays $1900 (`loss_bonus.half_start_and_pistol`).

The seven `UNVERIFIED` rows stay out of fixtures until zhasi checks them. The demo lookup's expected-value table is canned review input, not a second copy of the ladder.

经济引擎、规则数字和网页计算器归 zhasi，入口是 `evaluateFreeze`。kohi 在引擎 PR 合并后打磨计算器界面。koki 的 GSI 交出同一份冻结快照：`roundNumber`、`ourSide`、`ourPlayers`、`history`。对手现金不是输入，`enemy.band` 由 `history` 推出。回合结束原因是 `elimination`、`bomb_explode`、`bomb_defuse`、`time`。赛后决策复盘、合规章节和 `docs/COMPLIANCE.md` 归 ahi。已核对的数字在 `docs/economy-rules.json`（32 条 VERIFIED，7 条 UNVERIFIED）。引擎落地后，赛后样例里的金额与这些已核对数字保持一致，包括：埋包者 $300；炸弹被拆时每名 T $600（不是 $800）；获胜后连败奖励只降一档，不回到 $1400；半场手枪局从连败层数 1 起算，手枪局失利是 $1900。`post-match/` 不另写一套经济规则。`evaluateFreeze` 目前不返回每种购买的期望价值，漏判排序仍用记录下来的选项表。

## Run the post-match review locally / 本地运行赛后复盘

The calculator (`apps/web`) and the GSI listener (`src/gsi/`) ship in their owners' branches. This package runs the review on a fixture match from the blueprint (a correct eco into round 5, and a full buy into a 4-man save on round 7).

计算器（`apps/web`）和 GSI 监听（`src/gsi/`）在各自负责人的分支里。下面这条命令用蓝图里的样例比赛运行复盘（第 5 回合正确 ECO，第 7 回合在 4 人可存枪时全装）。

```bash
cd post-match
npm install
npm test
npm run review
```

`npm run review` prints the three largest expected-value leaks from the fixture table. `evaluateFreeze` returns one buy and `enemy.band`, not a per-class expected value, so the demo does not ask it to rank leaks. Dollar amounts in those fixtures follow `docs/economy-rules.json` once a payout is stated; the lookup itself does not encode the ladder.

## Interface for zhasi and koki / 给 zhasi 和 koki 的接口

Canonical consumer types live in `post-match/src/economy-engine.ts`. Zhasi's call, from `@roundmind/engine`:

```ts
evaluateFreeze({
  roundNumber,    // 1-based round about to be played
  ourSide,        // "T" | "CT"
  overtimeLimit,  // 1 Premier, 0 repeated OT
  ourPlayers,     // { id?, cash, hasPrimary, equipmentValue? }[]
  history,        // { winner: "T" | "CT", reason, alive? }[], oldest first
})
```

`reason` on a completed round is `elimination | bomb_explode | bomb_defuse | time`. Enemy cash is not an input. The result used here is `buy` (`full | force | eco | save | null`), `reason.code`, `reason.lossBonus`, and `enemy.band` (`averageLow` / `averageHigh`, plus per-player and team min/max). `adaptEconomyEngine({ evaluateFreeze })` maps that result.

`reviewMatch` ranks leaks as `best.expectedValue - chosen.expectedValue`. `evaluateFreeze` does not return that table yet. A round can carry a logged `options` list, and a later `evaluateBuyOptions` on the same object will be used when zhasi adds one. Until then the fixture lookup ranks the blueprint match.

Koki emits `roundNumber`, `ourSide`, `ourPlayers`, and `history` in this shape. Enemy positions are not part of it.

`post-match/` 里的样例引擎只是按回合号查表。规则数字以 zhasi 的 `docs/economy-rules.json` 和 `evaluateFreeze` 为准。
