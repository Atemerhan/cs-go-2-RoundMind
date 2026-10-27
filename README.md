# RoundMind

CS2 Premier / Competitive 的冻结时间经济教练。冻结时间里，按公开规则和己方现金给出一种购买：**满购、强起、白给或存枪**，再附一句理由。对手现金留在估算里：引擎按已经打完的回合给出一条经济带。

买不买由玩家自己决定。数据只走官方 Game State Integration。建议在冻结时间和赛后给出；不读内存，不注入，不模拟键鼠，也不提供敌人位置、准星或对局中的操作指令。

> [!IMPORTANT]
> **main 上现在只有规则文档。** 已合并的是 [#2](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/2)。引擎、网页计算器、GSI 和赛后复盘都还在未合并的 PR 里。根目录没有 `package.json`，在 main 上不能 `npm run dev`。
>
> 数字核对：**[docs/economy-rules-sources.md](docs/economy-rules-sources.md)**。规则表 39 行里 32 条已核实、7 条未核实。结构化副本是 [docs/economy-rules.json](docs/economy-rules.json)。引擎落地后对照这两份，不另写一套金额。

## MVP 范围

范围是爆破模式的 Premier / Competitive：常规时间最多 24 回合，先到 13 胜。人质图和社区服自定义 cfg 不在这套数字里。

| 能力 | 状态 | 落点 |
| --- | --- | --- |
| 经济数字核对（来源、引文、核实状态） | 已在 main（[#2](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/2)） | `docs/` |
| 确定性购买建议 `evaluateFreeze` | [#3](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/3) 未合并 | `packages/engine` |
| 冻结时间计算器（中文 / 英文） | [#3](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/3) 未合并 | `apps/web` |
| 计算器界面，以及可选的 Live | [#5](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/5)，叠在 #3 的分支上 | `apps/web` |
| 四种购买的 `evaluateBuyOptions`（`expectedValue`） | [#6](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/6)，叠在 #3 上；#3 进 main 后再把目标改到 main | `packages/engine` |
| 官方 GSI → `toFreezeSnapshot`，本地 `GET /state` | [#4](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/4) 未合并 | `packages/gsi` |
| 赛后决策复盘，合规章程 | [#1](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/1) 未合并 | `post-match/`、`docs/COMPLIANCE.md` |

来源文档里有 7 条未核实。#3 在 `packages/engine/src/rules.ts` 里用 `unverified` 标出这些还不能当成事实的项。超时扣给谁还没定，购买建议不用它来选存枪或强起。

## 架构

调用方准备一份 `FreezeSnapshot`，引擎返回建议。金额只在引擎里算。网页、GSI、赛后复盘都是调用方。

```text
docs/economy-rules.json          已核实的金额
        │
        ▼
@roundmind/engine
  evaluateFreeze(FreezeSnapshot)     → 一种购买、理由、对方经济带
  evaluateBuyOptions(FreezeSnapshot) → BuyOption[]          （#6 才有）
        ▲                 ▲                      ▲
   apps/web          packages/gsi           post-match
   手填表单           官方 GSI               用两份结果排漏损
   #5 的 Live         toFreezeSnapshot
   读本地 /state
```

`FreezeSnapshot` 上有 `roundNumber`、`ourSide`、`ourPlayers`、`history`，可选 `overtimeLimit`（Premier 用 `1`）、`score`、`lossCount`。回合结束原因是 `elimination`、`bomb_explode`、`bomb_defuse`、`time`。对手现金留在引擎估出的 `enemy.band` 里。

#3 和 #6 都进 main 之后，引擎入口是：

```ts
evaluateFreeze(snapshot); // buy、reason.code、enemy.band
evaluateBuyOptions(snapshot); // BuyOption[]，顺序 full、force、eco、save
```

`buy` 是 `"full" | "force" | "eco" | "save" | null`。名单为空、比赛已经结束、或 Premier 打成 15–15 时是 `null`。

`expectedValue` 以失败奖金的一档计：1 点 = $500（`LOSS_BONUS_STEP`）。赛后把漏损记成 `best.expectedValue - chosen.expectedValue`（正数）。

`packages/gsi` 的 `GET /state` 返回归一化后的 `GameState`。`toFreezeSnapshot(gameState)` 再收成 `FreezeSnapshot`。#5 的 Live 只 HTTP 拉取 `http://127.0.0.1:3000/state`，在网页里转成引擎输入，页面不引用 `@roundmind/gsi`。转换时丢掉对手现金。监听没开、还没有对局、或返回的不是对局状态时，计算器继续用手填的表。

## 目录

main 上现在只有 `README.md` 和 `docs/` 里的两份规则。下表其余路径随对应 PR 进来。

| 路径 | 内容 | 什么时候有 |
| --- | --- | --- |
| `docs/economy-rules-sources.md` | 来源、引文、核实状态 | 已在 main |
| `docs/economy-rules.json` | 同一份数字，给以后和 `rules.ts` 对照 | 已在 main |
| `packages/engine` | `@roundmind/engine`，无 DOM、无网络 | #3；`evaluateBuyOptions` 在 #6 |
| `apps/web` | `@roundmind/web`，Vite + React | #3；界面和 Live 在 #5 |
| `packages/gsi` | `@roundmind/gsi`，只读 GSI | #4 |
| `post-match` | `@roundmind/post-match` | #1 |
| `docs/COMPLIANCE.md` | 合规章程 | #1 |

#3 把仓库收成 npm workspace（`packages/*`、`apps/*`）。`post-match/` 在 workspace 外面，自己安装。`packages/gsi` 落在 `packages/*` 里；按 #4 的说明，进入该目录安装再启动。它的依赖里没有 `@roundmind/engine`。

## 分工

| 谁 | 负责 | 路径 |
| --- | --- | --- |
| zhasi | 经济引擎、规则数字、网页计算器 | `packages/engine`、`apps/web`、`docs/economy-rules-sources.md`、`docs/economy-rules.json` |
| kohi | 计算器界面。引擎合并后再做。Live 只读 #4 的监听 | `apps/web` |
| koki | 官方 GSI 收成 `toFreezeSnapshot`，交给 `evaluateFreeze` | `packages/gsi` |
| ahi | 赛后复盘、合规章程 | `post-match/`、`docs/COMPLIANCE.md` |

规则数字以 zhasi 的来源文档为准。koki 交给引擎的快照里只有己方现金。ahi 的复盘调用 zhasi 的两份结果：冻结建议走 `evaluateFreeze`，漏损排序走 `evaluateBuyOptions`。

## 本地运行

下面的命令来自各 PR 分支的 `package.json`。main 上还没有这些脚本。需要 Node.js 20 或以上。

### 计算器（#3 合并之后）

在仓库根目录：

```bash
npm install
npm test
npm run dev
```

`npm run dev` 启动 `@roundmind/web`，打开 <http://localhost:5173>。`npm run build` 做类型检查并构建网页。

#3 带了 GitHub Pages 工作流。推到 main、并且仓库打开 Pages 之后，才会发布计算器。现在没有线上地址。

### GSI 监听（#4，可以单独跑）

```bash
cd packages/gsi
npm install
npm test
npm run dev
```

监听 `http://127.0.0.1:3000`。

| 路径 | 作用 |
| --- | --- |
| `POST /gsi` | Valve 的 GSI JSON |
| `GET /state` | 最近一份归一化 `GameState` |
| `GET /` | 同一份 JSON 的查看页 |

没有 CS2 客户端时，在 `packages/gsi` 里运行 `npm run mock`，按 `fixtures/` 走同一套归一化。配置示例是 `packages/gsi/examples/gamestate_integration_roundmind.cfg`，拷进游戏的 `game/csgo/cfg/` 后重启。示例只请求地图、回合、比分、金钱、装备和炸弹；位置和投掷物通道是关的。

### 可选 Live（#5，网页和监听都起来之后）

开发服务器把同源的 `/gsi/state` 代理到 `http://127.0.0.1:3000`，因为监听不发 CORS 头。页面上显示的地址仍是 `http://127.0.0.1:3000/state`。

### 赛后复盘（#1）

```bash
cd post-match
npm install
npm test
npm run review
```

`npm test` 和 `npm run review` 会从 #6 的分支 `cursor/evaluate-buy-options-8c16` 取出 `@roundmind/engine` 再打分。样例只提供冻结快照，分数来自 `evaluateBuyOptions`。

## 未合并的 PR

| PR | 现在的目标分支 | 谁 | 内容 |
| --- | --- | --- | --- |
| [#3](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/3) | `main` | zhasi | `evaluateFreeze` 和网页计算器 |
| [#5](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/5) | #3 的分支 `cursor/economy-engine-mvp-9f71` | kohi | 界面打磨，可选 Live |
| [#6](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/6) | 同上，#3 的分支 | zhasi | `evaluateBuyOptions` 与 `expectedValue` |
| [#4](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/4) | `main` | koki | `packages/gsi`：`toFreezeSnapshot` 和本地 `/state` |
| [#1](https://github.com/Atemerhan/cs-go-2-RoundMind/pull/1) | `main` | ahi | 赛后复盘和 `docs/COMPLIANCE.md` |

团队目前的合并顺序是 **#3 → #5 → #4 → #1**。#6 等 #3 进入 main，把目标分支改到 `main` 再合；#6 的说明里也是这么写的。#5 同样叠在 #3 上，#3 合并后也要改目标分支，再按上面的顺序合。

#3 和 #4 都会改根目录 `README.md`，和本页会冲突。代码目录本身不重叠：引擎在 `packages/engine`，监听在 `packages/gsi`。
