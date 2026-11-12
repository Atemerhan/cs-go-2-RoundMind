# RoundMind

RoundMind 是 CS2 Premier / Competitive 爆破模式的冻结时间经济教练。Möbi 用己方现金、已有装备和已结束的回合给出满购、强起、白给或存枪建议，并说明理由。对手经济以区间估算显示。

RoundMind is a freeze-time economy coach for CS2 Premier and Competitive defusal matches. Möbi uses your side's cash, equipment, and completed rounds to suggest a full buy, force buy, eco, or save, with a short explanation. Opponent economy is shown as an estimated range.

## 本地试玩 / Run locally

需要 Node.js 22（与 CI 一致）。/ Use Node.js 22 to match CI.

```bash
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173>。选择「手枪局」「白给」或「加时」即可试算，也可以手填双方已结束的回合和己方阵容。右上角可切换中英文。

Open <http://127.0.0.1:5173>. Try the pistol, eco, or overtime preset, or edit your roster and round history. Use the language switch in the upper right.

```bash
npm test
npm run build
```

## 本机 GSI / Local GSI

在第二个终端从仓库根目录启动监听器。/ Start the listener from the repository root in a second terminal.

```bash
npm run dev -w @roundmind/gsi -- --token roundmind-local-dev
```

将[示例配置](packages/gsi/examples/gamestate_integration_roundmind.cfg)复制到 CS2 的 `game/csgo/cfg/`，确认配置中的 token 与监听器一致，再重启 CS2。网页选择「本机直播（GSI）」。监听器绑定到 `127.0.0.1:3000`，本地网页通过 `GET /gsi/state` 读取状态。

Copy the [example config](packages/gsi/examples/gamestate_integration_roundmind.cfg) into CS2's `game/csgo/cfg/`, match the listener token, and restart CS2. Select **Live (GSI)** in the local calculator. The listener binds to `127.0.0.1:3000` and the local web app reads state through `GET /gsi/state`.

不启动 CS2 也可以在第三个终端发送一份冻结时间样例。/ Send a freeze-time fixture from a third terminal to try it without CS2.

```bash
curl -fsS -H 'Content-Type: application/json' --data-binary @packages/gsi/fixtures/01-pistol-round-freeze.json http://127.0.0.1:3000/gsi
```

实时建议使用冻结阶段收到的己方数据。其他阶段、未收到对局或监听不可用时，网页使用手动表。网页显示实际收到的己方人数，缺失的现金不会当作 $0。玩家自行购买。GSI 只读，位置和投掷物通道关闭，计算器用回合历史估算对方经济。详见 [GSI 配置与数据说明](packages/gsi/README.md)。

Live advice uses own-side data reported during freeze time. The manual form supplies the calculation during other phases or when match data is unavailable. The web app shows how many teammates have reported cash, and missing cash stays unknown. Players make their own purchases. GSI is read-only, position and grenade feeds are off, and the calculator estimates opponent economy from round history.

## 赛后复盘 / Post-match review

从仓库根目录运行样例，或传入自己的回合 JSON。复盘用 zhasi 的经济引擎按「最佳购买评分 − 实际购买评分」排序，默认输出差距最大的三轮和中英文解释。分数是规则模型中的相对值，单位为一档连败奖金。

Run the built-in example from the repo root, or pass your own rounds as JSON. The review ranks the gap between the best and played buys using zhasi's economy engine. It reports up to three rounds with bilingual explanations. The score is relative to the policy model and is measured in loss-bonus steps.

```bash
npm run review -w @roundmind/post-match
npm run review -w @roundmind/post-match -- ./match.json
```

每条记录填写回合编号、实际买法、该轮胜负和买枪前的快照。/ Each entry records the round number, actual buy, round winner, and pre-buy snapshot.

```json
[
  {
    "roundNumber": 1,
    "chosenBuy": "eco",
    "winner": "us",
    "state": {
      "roundNumber": 1,
      "ourSide": "CT",
      "ourPlayers": [{ "cash": 800, "hasPrimary": false }],
      "history": []
    }
  }
]
```

实际买法为 `full`、`force`、`eco` 或 `save`，胜方为 `us` 或 `them`。可以手写，也可以从本机 GSI 录制转换。/ Use `full`, `force`, `eco`, or `save` for the buy and `us` or `them` for the winner. Write the file by hand, or convert a local GSI recording.

### 从本机 GSI 录制 / Record from local GSI

监听器默认不落盘。加上 `--record` 后，每条已接受的 GSI 会追加到 JSONL（`v: 1`、`receivedAt`，以及去掉 token、坐标、朝向和投掷物之后的 `payload`）。格式见 [GSI 说明](packages/gsi/README.md)。赛后转换写成 schema v1：`{ schemaVersion: 1, map?, rounds }`。`rounds` 里每一项仍是上面的回合对象。赛后复盘页面读这份文档。当前命令行只接受回合数组，所以在它开始接受 schema v1 之前，转换时加上 `--array`。

买法按冻结开始时的己方快照，和冻结结束后的实际花费来推断。没有 `money` 的队友会略过，不会写成 $0。花费是两侧都报了现金的队友的平均现金下降：

- 手枪局（第 1、13 轮）：花费 ≥ $800 为 `full`，≥ $300 为 `force`，否则为 `eco`。
- 其他回合：花费 ≥ 步枪加头盔（T $3700 / CT $3900）为 `full`，≥ 冲锋枪加护甲（T $1700 / CT $1900）为 `force`。
- 若每个报了现金的队友也都报了武器，其中至少 60% 在冻结前已经有主武器，买完后仍是如此，且花费低于强起线，记为 `save`。有人报了现金但没有武器列表时，不记为存枪。
- 其余为 `eco`。算不出花费时，用买完后的平均 `equip_value` 套同一条分界。

胜方按该轮己方（半场交换后跟着同一名玩家的新阵营）写成 `us` 或 `them`。暖机不算回合。重连时较旧的回合包不会覆盖买前快照。没有买前快照或没有胜负的回合会略过。比分回到第 1 轮或地图名变了之后，只输出后面那场。

The listener does not write a file unless you pass `--record`. Each accepted GSI payload is appended as JSONL (`v: 1`, `receivedAt`, and the `payload` with the token, positions, facing, and grenades removed). The field list is in the [GSI readme](packages/gsi/README.md). Conversion writes schema v1: `{ schemaVersion: 1, map?, rounds }`. Each entry in `rounds` is the round object above. The review page reads that document. The CLI on this branch still accepts only the bare array, so pass `--array` until it accepts schema v1.

The buy is inferred from the own-side snapshot at the start of freeze and the cash actually spent by the time freeze ends. A teammate with no `money` field is omitted, not stored as $0. Spend is the average cash drop among teammates who reported cash both times:

- Pistol rounds (1 and 13): spend ≥ $800 is `full`, ≥ $300 is `force`, otherwise `eco`.
- Other rounds: spend ≥ rifle + helmet (T $3700 / CT $3900) is `full`, and spend ≥ SMG + kevlar (T $1700 / CT $1900) is `force`.
- If every teammate who reported cash also reported weapons, at least 60% of them already held a primary, they still do after the buy, and the spend is below the force line, the buy is `save`. A teammate who reported cash but no weapon list blocks that save.
- Otherwise it is `eco`. When the spend cannot be computed, the same lines are applied to the average `equip_value` after the buy.

The winner is `us` or `them` for the side you were on that round. After halftime that side follows the same player onto the new team. Warmup is not a round. A reconnect packet for an older round does not replace the pre-buy snapshot. Rounds with no pre-buy snapshot or no winner are left out. If the score returns to round 1, or the map name changes, only the later match is written.

```bash
npm run dev -w @roundmind/gsi -- --token roundmind-local-dev --record ./match.jsonl
npm run convert -w @roundmind/gsi -- ./match.jsonl --out ./match.json
npm run convert -w @roundmind/gsi -- ./match.jsonl --array --out ./rounds.json
npm run review -w @roundmind/post-match -- ./rounds.json
```

## 项目状态 / Project status

| 模块 / Module | 状态 / Status |
| --- | --- |
| 经济引擎 / Economy engine | [`evaluateFreeze`](packages/engine/README.md)，由 zhasi 实现 |
| 双语计算器 / Bilingual calculator | 手动试算与本机 GSI / Manual calculator and local GSI |
| 购买方案评分 / Buy-option scoring | [`evaluateBuyOptions`](packages/engine/README.md)，由 zhasi 实现 |
| 赛后复盘 / Post-match review | [本地命令行 / Local CLI](post-match) |

经济规则的来源和核实状态见[规则文档](docs/economy-rules-sources.md)，机器可读版本在 [`economy-rules.json`](docs/economy-rules.json)。/ The [rules reference](docs/economy-rules-sources.md) lists sources and verification status. [`economy-rules.json`](docs/economy-rules.json) is its machine-readable companion.

产品的公平竞赛边界见[合规章程](docs/COMPLIANCE.md)。/ See the [fair-play charter](docs/COMPLIANCE.md) for the product boundaries.

### GitHub Pages

Pages 只发布手动计算器的静态构建，本机 GSI 用本地网页体验。现有工作流已成功构建并上传产物，部署阶段返回 404。启用前先确认私有仓库支持 Pages，再在 [Settings → Pages](https://github.com/Atemerhan/cs-go-2-RoundMind/settings/pages) 将 Source 设为 **GitHub Actions**。配置后可重新运行 [Pages 工作流](https://github.com/Atemerhan/cs-go-2-RoundMind/actions/workflows/pages.yml)。

Pages serves the static manual calculator. Use the local web app for GSI. The existing workflow built and uploaded the artifact, then received a 404 from the deployment endpoint. Confirm Pages is available for this private repository and set **GitHub Actions** as the source before rerunning the workflow. See [GitHub's Pages setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
