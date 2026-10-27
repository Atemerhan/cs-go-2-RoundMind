# RoundMind 合规章程 / Compliance charter

This is the fair-play boundary for this repository, taken from the RoundMind Master Blueprint v1.0, Part 3.2. It is a product rule for contributors. It is not legal advice.

这是本仓库的公平竞赛边界，依据 RoundMind Master Blueprint v1.0 第 3.2 节。它约束贡献者怎么做产品，不是法律意见。

## The poker precedent / 扑克先例

Competitive poker settled the same question. Real-time assistance at the table is banned on serious platforms and is their main enforcement target. The durable business grew up beside that ban: study and solver tools, used away from the table and as pre-decision trainers, that teach people a better strategy. The money that lasted was in making players better between and around hands, not in cheating during the hand.

RoundMind takes that as its line. The legitimate product is pre-decision support and post-match coaching on public information: a freeze-time buy recommendation, and a review of the decisions that cost the most expected value. Live help during an active fight is the other side of the line.

竞技扑克已经回答过同一个问题。牌桌上的实时辅助在正规平台被禁止，也是执法的主要对象。能长久的生意长在禁令旁边：复盘和求解工具，在离开牌桌之后、以及作为决策前的训练来使用，教人打出更好的策略。留得下的钱，来自让牌手在每一手之间变得更强，而不是在这一手里作弊。

RoundMind 把这件事当作自己的边界。正当的产品是基于公开信息的决策前辅助和赛后教练：冻结时间的购买建议，以及赛后指出最亏期望价值的决定。交火进行中的实时指挥，落在边界的另一侧。

The blueprint states the law this way: the legitimate, defensible, larger business is in pre-decision support and post-game coaching on public information — not in live in-round cheating. The constraint is the product.

蓝图里的原意是：正当、站得住、也更大的生意，是基于公开信息的决策前辅助和赛后教练；实时的局内作弊不是。这条约束本身就是产品。

## What this repository does / 这个仓库做什么

- Read official Counter-Strike 2 Game State Integration only. The player opts in with a `gamestate_integration_*.cfg`. The feed is read-only and local. Koki owns that listener.
- Compute buy advice from public economy rules and from state the player is already entitled to know: score, round phase, own money and equipment, bomb and timer state, and an enemy-economy band estimated from public round history. Zhasi owns those rule numbers. Kohi polishes the calculator UI after the engine PR merges.
- Speak at preparation and review time. Freeze time gets one buy class (`full`, `force`, `eco`, or `save`) and a one-clause reason. After the match, `post-match/` names the decisions that cost the most expected value and the better line for each.
- Leave every in-game action to the player.

- 只读官方的 Counter-Strike 2 Game State Integration。玩家用自己的 `gamestate_integration_*.cfg` 选择开启。这条数据流是只读的、本地的。监听由 koki 负责。
- 购买建议只来自公开经济规则，以及玩家本来就有权知道的状态：比分、回合阶段、自己的金钱和装备、炸弹与计时，以及根据公开回合历史估出的对方经济区间。规则数字由 zhasi 负责。kohi 在引擎 PR 合并后打磨计算器界面。
- 只在准备和复盘时开口。冻结时间给出一个购买类型（`full` / `force` / `eco` / `save`）和一句理由。比赛结束后，`post-match/` 指出最亏期望价值的决定，并给出更好的一条线。
- 游戏里的每一次操作都由玩家自己完成。

Estimating an opponent's likely money from the loss-bonus ladder is something a knowledgeable player can do by hand. Doing that arithmetic during a fifteen-second freeze is coaching.

根据连败奖励推算对方大概还有多少钱，懂规则的玩家用手就算得出来。在十五秒冻结时间里把这笔账算完，是教练，不是作弊。

## What we refuse / 我们拒绝这些

Contributors do not add the following, including as a "debug" path, a private flag, or a later premium feature.

贡献者不要加入下面这些能力，包括做成“调试”入口、隐藏开关，或以后的付费功能。

- **Wallhack-style reads and other hidden information.** Enemy positions, spectator or demo-only vision, unheard audio, hidden inventories, or any fact the official feed withholds. GSI does not provide enemy positions, and this repo will not reconstruct them.
- **Auto-buy and any other input automation.** No buying, shooting, movement, aiming, or crosshair control. No injected input, no macros that play the round, no trigger or aim assistance.
- **Memory reading and process attachment.** No reading the game's memory, no DLL injection, no hooks into the game process. The only input is the sanctioned feed or numbers the user types.
- **Live commands during an active engagement.** Depth belongs to freeze time and to the post-match review. The coach does not call a fight in progress.
- **Selling an advantage across that line.** A feature that needs hidden information or input automation is outside the product, paid or free.

- **透视式读取，以及其他隐藏信息。** 敌人位置、观战或录像才有的视野、听不见的声音、隐藏的库存，以及官方数据流故意不给的任何事实。GSI 不提供敌人位置，本仓库也不去还原它。
- **自动购买，以及任何输入自动化。** 不代买、不开枪、不移动、不瞄准、不控准星。不注入输入，不用宏替玩家打完这一分，不做自动扳机或瞄准辅助。
- **读取内存，以及附着到游戏进程。** 不读游戏内存，不注入 DLL，不挂钩游戏进程。唯一的输入是官方数据流，或用户自己填入的数字。
- **交火进行中的实时指挥。** 深度放在冻结时间和赛后复盘。教练不在交火中发号施令。
- **出售越线的优势。** 需要隐藏信息或输入自动化才能成立的功能，无论免费还是付费，都不在产品里。

## How the line is held / 边界怎么守住

The post-match review calls zhasi's `EconomyEngine` and ranks lines the engine already scored. It does not open a second input path. A future GSI listener stays read-only. Facts (the engine) and guesses (a later read layer) stay separate, and a guess is not presented as a fact.

赛后复盘调用 zhasi 的 `EconomyEngine`，只对引擎已经算过的购买线排序。它不开第二条输入通道。以后的 GSI 监听保持只读。事实（引擎）和猜测（以后的解读层）分开，猜测不会被说成事实。

See the ownership table in the root [README](../README.md).

模块归属见根目录 [README](../README.md)。
