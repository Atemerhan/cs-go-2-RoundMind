# RoundMind 公平竞赛章程 / Fair-play charter

依据 RoundMind Master Blueprint v1.0 第 3.2 节，RoundMind 借鉴扑克复盘工具的思路，把产品范围限定在冻结时间的购买决策和赛后学习。

RoundMind Master Blueprint v1.0, Part 3.2 draws on poker study tools as an analogy. RoundMind limits its coaching to freeze-time buy decisions and post-match review.

| 范围 / Scope | 约束 / Boundary |
| --- | --- |
| 数据采集 / Data collection | 玩家通过配置启用官方 CS2 GSI。本地监听器只读，示例配置关闭位置和投掷物通道。 / The player enables official CS2 GSI through a configuration file. The listener is local and read-only. The sample disables position and grenade feeds. |
| 冻结时间 / Freeze time | 基于己方可见经济信息和公开回合历史给出买法建议。对手经济以区间估算显示。购买由玩家自行完成。 / Use own-side economy data and public round history. Show opponent economy as an estimated range. The player makes every purchase. |
| 交火阶段 / Active rounds | 收到交火阶段的 GSI 状态后停止实时购买建议。产品禁止交火指令、敌人位置和隐藏装备信息。 / Stop live buy advice when GSI reports active play. In-fight commands, enemy positions, and hidden equipment information are outside scope. |
| 赛后 / Post-match | 使用回合记录和同一套经济引擎比较不同买法。评分用于复盘排序。 / Use round records and the shared economy engine to compare buys and rank rounds for review. |

项目禁止读取游戏进程内存、注入代码、模拟游戏输入和自动购买。参加比赛时遵守赛事方的工具使用规则。

The project excludes process memory reads, code injection, simulated game input, and automatic purchases. Follow the organizer's tool rules when using RoundMind in a competition.
