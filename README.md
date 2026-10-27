# RoundMind

CS2 冻结时间的经济教练。引擎按公开规则算己方购买力和对方经济带，并给出一个建议：**满购 / 强起 / 白给 / 存枪**，附一句理由。

这是 MVP 的确定性核心。官方 GSI 接入和赛后复盘不在这个包里。

## 合规边界

只做购买阶段和复盘时的决策辅助。以后只读取官方 Game State Integration。不读游戏内存，不注入，不模拟键鼠，不提供敌人位置、准星或对局中的操作指令。建议由玩家自己执行。

## 仓库

| 路径 | 内容 |
| --- | --- |
| `packages/engine` | 纯 TypeScript 经济引擎，无 DOM |
| `apps/web` | Vite + React 计算器，中文 / 英文，黑金 |
| `packages/engine/src/rules.ts` | 金额与规则。`verified` / `unverified` / `policy` |
| `packages/engine/README.md` | 给后续 GSI 用的输入输出 |

经济来源文档由另一条分支维护（`docs/economy-rules.json`）。本分支不改 `docs/`。

## 本地

```bash
npm install
npm test
npm run dev
```

计算器在 <http://localhost:5173>。`npm run build` 会类型检查并构建网页。

## 引擎在算什么

- MR12：上下半各 12 回合，先到 13。第 13 回合金钱回到 $800，连败计数回到 1。
- 负场奖金：$1400 / $1900 / $2400 / $2900 / $3400。赢一回合只降一档，不归零。计数可以超过 4，奖金封顶。超过 4 之后赢一回合仍是 $3400，这一读法对应 2019 年的原文；服务器是否把计数存在 4 上，尚未核实。
- 击杀、下包、拆包、爆炸获胜、金钱上限、加时 $10,000，见 `rules.ts` 里标成 verified 的项。
- 下包 $300 只给下包的人。包被拆时每名匪额外 $600（不是 $800）。爆炸获胜 $3500，不再加 $600。
- 对方现金是一条带，不是一个数。击杀未知时上沿多算一笔冲锋枪击杀。
- 超时 “+$0” 的字符串已核实，扣给谁没有核实。建议不会因此叫你送死换奖金。

## English

RoundMind is a freeze-time economy coach for CS2 Premier bomb defusal. `packages/engine` is a pure function from a public round list plus your team's cash to one buy class: full, force, eco, or save. `apps/web` is the calculator.

Coaching only. A future build may subscribe to official Game State Integration. It must not read game memory, inject code, or automate input, and it must not reveal enemy positions.

Rule values live in `packages/engine/src/rules.ts` with a verification flag. The input shape for a later GSI adapter is documented in `packages/engine/README.md`.
