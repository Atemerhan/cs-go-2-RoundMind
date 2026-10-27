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
| Deterministic economy engine and black-and-gold web calculator | kohi (`bc-8a650664`) | `packages/economy`, `apps/web` |
| CS2 Game State Integration live feed | koki | `src/gsi/` |
| Post-match decision-leak review, this compliance section, and `docs/COMPLIANCE.md` | ahi | `post-match/`, `docs/COMPLIANCE.md` |

Kohi owns the rule numbers and the `EconomyEngine` implementation. The review calls that engine. Koki normalizes official GSI into a `GameState` and can pass it through `adaptKohiEngine`. Raw GSI parsing stays in `src/gsi/`.

经济引擎和黑金网页计算器归 kohi。GSI 直播数据归 koki。赛后决策复盘、合规章节和 `docs/COMPLIANCE.md` 归 ahi。

## Run the post-match review locally / 本地运行赛后复盘

The calculator (`apps/web`) and the GSI listener (`src/gsi/`) ship in their owners' branches. This package runs the review on a fixture match from the blueprint (a correct eco into round 5, and a full buy into a 4-man save on round 7).

计算器（`apps/web`）和 GSI 监听（`src/gsi/`）在各自负责人的分支里。下面这条命令用蓝图里的样例比赛运行复盘（第 5 回合正确 ECO，第 7 回合在 4 人可存枪时全装）。

```bash
cd post-match
npm install
npm test
npm run review
```

`npm run review` prints the three largest expected-value leaks. Until `packages/economy` is on main, the demo uses a fixture lookup that returns canned option tables. It does not contain CS2 money rules.

## Interface assumptions for kohi and koki / 给 kohi 和 koki 的接口约定

Canonical types live in `post-match/src/economy-engine.ts`. Assumed kohi surface:

```ts
type BuyClass = "full" | "force" | "eco" | "save";

interface EconomyEngine {
  recommend(input: EconomyEvaluationInput): {
    recommendation: BuyClass; // buyClass is also accepted by adaptKohiEngine
    reason: string | { en: string; zh: string };
    enemyEconomyBand?: { min: number; max: number };
    buyingPower?: number;
    options?: BuyOptionEvaluation[];
  };
  evaluateBuyOptions?(input: EconomyEvaluationInput): BuyOptionEvaluation[];
}

interface BuyOptionEvaluation {
  buyClass: BuyClass;
  expectedValue: number; // horizon EV in the engine's units; higher is better
  reason: string | { en: string; zh: string };
}
```

`reviewMatch(rounds, engine)` ranks leaks as `best.expectedValue - chosen.expectedValue` and returns the three largest gaps. A round may instead carry a logged `options` table from freeze time; logged tables are not sent back through the engine.

Koki's stub `{ recommendation, reason: string, enemyEconomyBand?: { min, max } }` adapts, and it cannot rank leaks until per-class `expectedValue` is present. Map `GameState` onto `EconomyEvaluationInput` (round, score, own money, loss streaks, optional band). Enemy positions are not part of the input.

`post-match/` 里的样例引擎只是按回合号查表。规则数字以 kohi 的 `packages/economy` 为准。
