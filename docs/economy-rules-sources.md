# CS2 竞技经济数字核对

核对日期：2026-10-27。范围是 Valve Premier / Competitive 的爆破模式，不是人质模式，也不是社区服自定义 cfg。

Premier 的默认值定义为：先加载 `gamemode_competitive.cfg`，再加载 `gamemode_competitive_tmm.cfg`。Valve Major 规则书写明了这个顺序（2026-10-07）。游戏文件取自 [SteamTracking/GameTracking-CS2](https://github.com/SteamTracking/GameTracking-CS2) 提交 `04d3e4a67ac60168d0e79594c69a2116bb3b7278`（2026-10-22）。2023-09-28 至 2026-07-08 的公开更新里，没有一条再改失败奖金阶梯本身；其间改过的是下包失败队奖、三件击杀奖励、CT 每死一名 T 的队奖，以及若干枪械标价。

本文只核对数字，不实现经济引擎。结构化副本见 [economy-rules.json](economy-rules.json)，供以后和 `rules.ts` 对照。

## 计数

| 类别 | VERIFIED | UNVERIFIED |
| --- | ---: | ---: |
| 规则行（下表 39 行） | 32 | 7 |
| 武器购买价（同一份 `weapons.vdata`） | 44 | 0 |
| 单件击杀奖励（同一份文件，与「击杀分类」行是同一组数） | 42 | 0 |

7 条未核实：深连败时计数是否封顶、下包个人奖金的发放时刻、T 方是否也有对称的 $50 队奖、时间耗尽时谁拿不到失败奖金、自杀是否仍取消回合收入、短手奖金按缺少人数怎么乘、加时半场是否重置连败计数。

## 来源怎么分级

核实用的是 Valve 更新说明、`counter-strike.net`、游戏内 cfg / convar 说明 / 本地化字符串，以及 Valve 的 Major 规则书。FACEIT 帮助中心只用来标明赛事默认和 Premier 的差别，并注明该页最后更新于 2025-01-17。只出现在博客或百科、又和游戏文件对不上的数字，标 UNVERIFIED，不写进建议实现的公式。

## 规则表

金额除另行说明外，都是**每人**拿到的数。`cash_team_*` 与失败奖金同一类：2018 年 Valve 写的是「手枪局失败者拿到 $1900」，不是五个人分 $1900。

| ID | 数值 | 是什么 | 来源（URL、引文、日期） | 状态 |
| --- | --- | --- | --- | --- |
| money.start | $800 | 手枪局与半场重置时的起始金钱（`mp_startmoney`） | [gamemode_competitive.cfg](https://github.com/SteamTracking/GameTracking-CS2/blob/04d3e4a67ac60168d0e79594c69a2116bb3b7278/game/csgo/cfg/gamemode_competitive.cfg)（2026-10-22）：`mp_startmoney 800`。convar：「amount of money each player gets when they reset」 | VERIFIED |
| money.cap | $16000 | 个人金钱上限。超出部分不保留 | [convars.txt](https://github.com/SteamTracking/GameTracking-CS2/blob/04d3e4a67ac60168d0e79594c69a2116bb3b7278/DumpSource2/convars.txt)（2026-10-22）：`mp_maxmoney 16000 — maximum amount of money allowed in a player's account`。竞技 cfg 同值 | VERIFIED |
| money.after_round | $0 | 每回合结束的固定补贴。收入只来自各项奖金钱 | 同上 cfg：`mp_afterroundmoney 0`（2026-10-22） | VERIFIED |
| match.max_rounds | 24 回合，先到 13 | MR12。`mp_match_can_clinch 1`：赢下超过总回合数一半即可收场 | [Valve，2023-09-27](https://www.counter-strike.net/newsentry/3644028846252008595)：「a maximum of 24 rounds in regulation time (with a 6 round overtime in case of a tie) for Premier, Competitive, and the Majors.」cfg：`mp_maxrounds 24`，`mp_halftime 1`，`mp_match_can_clinch 1` | VERIFIED |
| match.half_reset | 金钱 $800，连败计数 1 | 每个半场开始时重置。第二半的手枪局同样是这个起点 | [Valve，2019-03-13](https://blog.counter-strike.net/2019/03/23488/)：「Teams still begin the half with a loss count of 1.」2026 cfg：`mp_starting_losses 1`，`mp_startmoney 800`，`mp_halftime 1` | VERIFIED |
| match.round_time_seconds | 1:55（1.92 分钟） | 回合时间，含爆破回合 | cfg：`mp_roundtime 1.92`，`mp_roundtime_defuse 1.92`（2026-10-22） | VERIFIED |
| match.buy_time_seconds | 20 秒 | 购买时间。tmm cfg 不覆盖 | cfg：`mp_buytime 20`（2026-10-22） | VERIFIED |
| match.freeze_time_seconds | Premier 20 秒；单独的 competitive.cfg 是 15 秒 | 官方对局顺序是 competitive.cfg 之后再执行 tmm cfg，冻结时间以 20 秒为准 | [gamemode_competitive_tmm.cfg](https://github.com/SteamTracking/GameTracking-CS2/blob/04d3e4a67ac60168d0e79594c69a2116bb3b7278/game/csgo/cfg/gamemode_competitive_tmm.cfg)：`mp_freezetime 20`。[Major 规则书，2026-10-07](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/621b7d91b0a236044aed62a357fddc863dfaea49/major-supplemental-rulebook.md)：「Premier defaults (by first loading cfg/gamemode_competitive.cfg and then loading cfg/gamemode_competitive_tmm.cfg)」 | VERIFIED |
| match.bomb_timer_seconds | 40 秒 | C4 爆炸计时。竞技 cfg 未覆盖，用 convar 默认值 | convars.txt：`mp_c4timer 40 — how long from when the C4 is armed until it blows`（2026-10-22） | VERIFIED |
| overtime.rounds | 6 回合（3+3） | 每一段加时的长度。tmm cfg 不覆盖 `mp_overtime_maxrounds` | convars.txt：`mp_overtime_maxrounds 6`。Valve 2023-09-27 同上：「with a 6 round overtime」 | VERIFIED |
| overtime.start_money | 每人 $10000 | 每个加时半场开始时**写成**这个数，不是在原有余额上相加，也不是 $12500 或 $16000 | convars.txt：`mp_overtime_startmoney 10000 — Money assigned to all players at start of every overtime half`（2026-10-22）。竞技 cfg、tmm cfg、Major 规则书都没有改它 | VERIFIED |
| overtime.limit_premier | 1 段 | Premier 最多打一段加时。15-15 可以是平局。FACEIT 帮助中心写的是 3-3 再打一段，那是赛事默认，不是 Premier | tmm cfg：`mp_overtime_enable 1`，`mp_overtime_limit 1`。[FACEIT，页内更新 2025-01-17](https://support.faceit.com/hc/en-us/articles/17063642043292-Setup-Game-settings-Counter-Strike-2)：「If both teams win three rounds, overtime will be played again.」起始金钱默认 10000，可选 12500 / 13000 / 16000 | VERIFIED |
| overtime.limit_major | 0（不封顶） | Major 在 Premier 默认之上把加时次数改为 0，打到分出胜负 | [Major 规则书，2026-10-07](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/621b7d91b0a236044aed62a357fddc863dfaea49/major-supplemental-rulebook.md)：`mp_overtime_limit 0` | VERIFIED |
| loss_bonus.table | 0 败 $1400；1 败 $1900；2 败 $2400；3 败 $2900；4 败及以上 $3400 | `1400 + 500 * min(连败计数, 4)`。底数、步长、上限三件 convar 在 2026 年的竞技 cfg 里仍是 1400 / 500 / 4 | [Valve，2019-03-13](https://blog.counter-strike.net/2019/03/23488/)：「With 0 Losses: $1400 — With 1 Loss: $1900 — With 2 Losses: $2400 — With 3 Losses: $2900 — With 4+ Losses: $3400」 | VERIFIED |
| loss_bonus.half_start_and_pistol | 半场起始计数 1；手枪局失败 $1900 | $1400 只在计数被赢回合降到 0 之后才会出现。先按当前计数发钱，再把计数加 1。若先加 1 再发钱，手枪局会变成 $2400，与 2018 年说明相反 | [Valve，2018-10-09](https://blog.counter-strike.net/2018/10/21333/)：「Instead of $1400, the Round 1 loser receives $1900, then $2400 for a subsequent loss, etc.」2019-03-13 保留半场起始计数 1 | VERIFIED |
| loss_bonus.win_steps_down | 赢一回合：计数减 1，最低 0。不归零 | `mp_consecutive_loss_aversion` 默认 1，竞技 cfg 不覆盖。0 才是赢了直接归零 | [Valve，2019-03-13](https://blog.counter-strike.net/2019/03/23488/)：「Previously, a win would reset the round loss bonus. Now, a win reduces the loss counter by one.」2026 convar：「0 = win fully resets loss bonus, 1 = first win steps down loss bonus, 2 = first win holds loss bonus and step down starting with second win」 | VERIFIED |
| loss_bonus.deep_streak_cap | 未定 | 计数若可以超过 4，长连败后再赢一回合，下一笔失败金仍是 $3400，要等计数掉回 4 以下才降档。若服务器把计数封顶在 4，则从满档赢一回合就会降到 $2900。2019 年原文是计数每次 +1，且「4+」只限制发放额。2026 年「steps down loss bonus」两种读法都说得通。社区口诀「赢一回合必降 $500」在计数大于 4 时没有官方句子 | [Valve，2019-03-13](https://blog.counter-strike.net/2019/03/23488/)：「The count increases by one after every loss, and decreases by one after every win (minimum 0). … With 4+ Losses: $3400」 | UNVERIFIED |
| round_win.elimination | $3250 | 爆破图歼灭获胜，双方相同 | cfg：`cash_team_elimination_bomb_map 3250`（2026-10-22） | VERIFIED |
| round_win.time_expired | $3250 | 时间耗尽、炸弹未爆炸，CT 获胜的队奖 | cfg：`cash_team_win_by_time_running_out_bomb 3250` | VERIFIED |
| round_win.bomb_detonation | $3500 | T 方炸弹爆炸获胜。这是队奖本身，不是 $3250，也不再叠加「下了但被拆」的 $600 | cfg：`cash_team_terrorist_win_bomb 3500`。队奖 convar 的名字是 `cash_team_planted_bomb_but_defused`，只覆盖被拆的情况 | VERIFIED |
| round_win.defuse | 竞技 $3500（裸默认值 $3250） | Premier 用 cfg 里的 3500。只读 convar 默认值会把拆包获胜写成 3250 | cfg：`cash_team_win_by_defusing_bomb 3500`。convars.txt 裸默认：`cash_team_win_by_defusing_bomb 3250`（2026-10-22） | VERIFIED |
| round_win.consecutive_winner_bonus | $0 | 连胜没有额外队奖。连胜只把失败计数往下减 | convars.txt：`cash_team_winner_bonus_consecutive_rounds 0`。竞技 cfg 不设置 | VERIFIED |
| objective.plant_personal | $300，只给下包的那个人 | 不是每个 T 都拿 $300 | cfg：`cash_player_bomb_planted 300`。`csgo_english.txt`：`Player_Cash_Award_Bomb_Planted = "+$%s1 for planting the C4"` | VERIFIED |
| objective.defuse_personal | $300，只给拆包的那个人 | 加在 $3500 拆包获胜队奖之上 | cfg：`cash_player_bomb_defused 300`。UI：「+$%s1 for defusing the C4」 | VERIFIED |
| objective.plant_team_if_defused | 每个 T $600 | 炸弹已下且被拆时的队奖。2024-05-23 从 $800 降到 $600。爆炸获胜不发这笔 | [Valve，2024-05-23](https://www.counter-strike.net/news/updates)：「Reduced the terrorist team award when bomb was planted but defused from $800 to $600, to decrease the impact of the first-round on subsequent rounds」cfg：`cash_team_planted_bomb_but_defused 600` | VERIFIED |
| objective.plant_team_stacks_with_loss_bonus | 是，两笔都发 | $600 加在失败奖金上。Valve 把 $800 降到 $600，是为了削弱手枪局对后面几回合的影响，指的是手枪失败 $1900 再加下包队奖，不是总共只给 $600 | 同上 2024-05-23 引文。2026 本地化里失败奖金与下包队奖是两条独立的 team income | VERIFIED |
| objective.plant_award_timing | 未写明 | $300 是下包瞬间入账（死后仍留在账户里），还是回合结束才入账，公告和 convar 说明都没有写 | cfg 只有金额：`cash_player_bomb_planted 300` | UNVERIFIED |
| kill.default | $300 | 武器未另写 `m_nKillAward` 时的击杀默认值 | cfg：`cash_player_killed_enemy_default 300` | VERIFIED |
| kill.by_class | 手枪（含 CZ）$300；冲锋枪 $600，P90 为 $300；霰弹枪 $900，XM1014 为 $600；步枪、SSG 08、连狙、机枪 $300；AWP $100；刀 $1500；电击枪 $100；投掷物 $300 | 2024-04-25 改过三件例外，2026-10-22 的 `weapons.vdata` 仍是改完后的数。休闲模式金额见公告，不用于竞技 | [Valve，2024-04-25](https://www.counter-strike.net/newsentry/4202497395513061959)：「Reduced XM1014 kill reward from $900 to $600 ($300 in Casual). Increased CZ75-Auto kill reward from $100 to $300 ($150 in Casual). Increased Zeus kill reward from $0 to $100 ($50 in Casual).」单件表在 JSON 的 `weaponKillAwards` | VERIFIED |
| kill.team_kill_penalty | -$300 | 击杀队友的个人罚金。竞技 cfg 开启友军伤害 | cfg：`cash_player_killed_teammate -300`。UI：「-$%s1 penalty for killing a friendly」 | VERIFIED |
| kill.ct_team_award_per_dead_t | 每名 CT、每死一名 T：$50 | 竞技模式，赢或输都发。五名 T 全死则每名 CT $250。与失败奖金一样，是每人拿到 $50，不是全队分一笔 $50 | [Valve，2025-07-16](https://www.counter-strike.net/newsentry/529852487375519749)：「In Competitive modes, Counter-Terrorists now receive a $50 team award for each Terrorist eliminated in a round」。同日赛季说明：「win or lose, CTs now receive a shared team award for each T eliminated in the round」。convar：`cash_team_per_dead_enemy 50` | VERIFIED |
| kill.t_team_award_per_dead_ct | 未宣布 | 本地化另有 `Team_Cash_Award_Dead_CTs`。公告只把 $50 给了 CT。只有一个 convar，cfg 里没有 T 方专用值。不要假定 T 每杀一名 CT 也拿 $50 | 同上 2025-07-16 引文，范围只写 Counter-Terrorists | UNVERIFIED |
| save.no_equipment_value_threshold | 没有这种阈值 | 2026-10-22 的 convar 列表里，没有「存活且装备价值超过某金额就取消失败奖金」。蓝图里的存枪罚金不是一条装备价值线。不要写成 $1000 或 $1500 | convars.txt 全文检索 equipment / loss bonus。相关但无关的一条是 `mp_equipment_reset_rounds 0`（「Reset all player equipment every N rounds (0 for never)」） | VERIFIED |
| save.timeout_zero_income_string | 结算行是 +$0 | 游戏有单独的「时间耗尽」收入行，金额为 0。字符串没有提装备价值 | `csgo_english.txt`（2026-10-22）：`Team_Cash_Award_no_income = "+$0 penalty for running out of time"` | VERIFIED |
| save.who_loses_income_on_timeout | 未定 | 社区说法是：炸弹没下、时间耗尽时，还活着的 T 失败奖金为 0，已经死亡的 T 仍拿满额，CT 在输的回合里活着也拿满额。2026 年另一条字符串是 `Team_Cash_Award_Loser_Zero = "-$%s1 team income for dead players on losing team"`，负号和「死者仍拿满额」对不上。论坛和百科不算核实。写存枪/强起之前应在当前版本服务器上看结算行 | 同上 `csgo_english.txt` 的 `Team_Cash_Award_Loser_Zero` | UNVERIFIED |
| save.suicide_round_income | 未定 | 2016 年 Valve 用「给一名存活敌人一笔等于错过击杀奖励的补偿」替换了自杀/掉线取消回合收入。2026 年文件里仍同时有 `+$0 penalty for suiciding` 和自杀补偿字符串。现在是只补偿敌人、只给受害者 $0，还是两件都发生，两段文字合在一起不能定 | [Valve，2016-06-09](https://blog.counter-strike.net/2016/06/14740/)：「Instead of the elimination of round-end income, a living enemy player now receives compensation equal to the missed kill reward opportunity.」 | UNVERIFIED |
| shorthanded.premier_amount_and_delay | Premier $1000；满 2 个先前回合才有资格。Major 为 $0 | 短手队奖。convar 裸默认是 0，竞技 cfg 改成 1000，Major 规则书再改回 0 | cfg：`cash_team_bonus_shorthanded 1000`。convars.txt：`mp_shorthanded_cash_bonus_round_delay 2 — number of previous rounds that a team needs to have been shorthanded before they are eligible for the short-handed bonus`。Major 规则书：`cash_team_bonus_shorthanded 0` | VERIFIED |
| shorthanded.multiplier_and_kicks | 未定 | $1000 是每人一笔，还是再乘缺少的人数，公告没有写。`mp_shorthanded_cash_bonus_ignore_kicked true` 的说明只说「决定被踢玩家是否计入」，没有写 true 是计入还是忽略。变量名是 ignore，不能单凭名字下结论 | convars.txt：「Determines whether kicked players are included in the assessment for short-handedness」 | UNVERIFIED |
| overtime.loss_count_reset | 未定 | 加时半场会把金钱设为 $10000（已核实）。会不会像常规半场一样把连败计数设回 1，convar 说明和更新说明都没有写 | convars.txt 只写金钱：「Money assigned to all players at start of every overtime half」 | UNVERIFIED |

## 购买价格（全部 VERIFIED）

来源：同一提交的 [`weapons.vdata`](https://github.com/SteamTracking/GameTracking-CS2/blob/04d3e4a67ac60168d0e79594c69a2116bb3b7278/game/csgo/pak01_dir/scripts/weapons.vdata) 里每个武器块的 `m_nPrice`（2026-10-22）。护甲：背心 `item_kevlar` $650，背心+头盔 `item_assaultsuit` $1000，拆包钳 `item_defuser` $400。

和旧表容易对不上、但文件里已经改过的标价：M4A4 与 M4A1 消音都是 $2900（2024-05-23 先到 $3000，2025-01-28 再到 $2900）；FAMAS $1950（2025-01-28）；燃烧弹 $500（2024-05-23，从 $600）；MP7 与 MP5-SD $1400、PP-野牛 $1300（2026-01-21 各降 $100）；加利尔 $1800；内格夫 $1700（2018-03-20 Valve：「Price lowered to $1700」）；双持贝瑞塔 $300。

击杀奖励的单件表与上表分类一致，写在 JSON 的 `weaponKillAwards`，不在这里再列一遍。

## 容易写错的数

这些是和现行 Premier 不一致的常见写法。引擎如果按它们实现，手枪局之后的经济会偏。

| 常见写法 | 现行数字 |
| --- | --- |
| 下包奖金是全队每人 $300，或仍是 $800 | 下包者个人 $300。队奖只在「下了但被拆」时发给每个 T，金额 $600（2024-05-23 起）。爆炸获胜是 $3500，不再加这 $600 |
| 任何获胜都是 $3250 | 歼灭和时间耗尽是 $3250。爆炸和竞技拆包获胜是 $3500。$3250 只是拆包队奖的裸默认值，被竞技 cfg 覆盖 |
| 赢一回合失败奖金回到 $1400 | 赢一回合只把计数减 1。从 4 档赢一回合，下一笔至少仍按减 1 后的计数计算，不是直接归零 |
| 半场第一笔失败奖金是 $1400 | 半场从计数 1 开始，手枪局失败是 $1900 |
| 存枪且装备超过某一金额就失去失败奖金 | 没有这条 convar。唯一写明的 $0 结算行是「时间耗尽」和「自杀」，谁适用见未核实行 |
| XM1014 击杀 $900，CZ $100，电击枪 $0 | 2024-04-25 之后分别是 $600、$300、$100 |
| 加时带着 $16000 进场，或 Valve 默认 $12500 | 每个加时半场写成 $10000。$12500 只是 FACEIT 等赛事的可选项 |
| 冻结时间 15 秒就是 Premier | competitive.cfg 是 15 秒，Premier 的 tmm cfg 覆盖为 20 秒 |
| CT 没有击杀队奖 | 2025-07-16 起，每名 CT 每死一名 T 得 $50，输赢都算 |

## 给引擎的失败奖金状态机（已核实部分）

```text
半场开始: lossCount = 1，金钱 = 800
失败:     发放 1400 + 500 * min(lossCount, 4)，然后 lossCount += 1
获胜:     lossCount = max(0, lossCount - 1)    # aversion 1
发放上限: min(lossCount, 4) 只限制这一笔钱
```

计数在大于 4 之后，赢一回合会不会立刻把下一笔从 $3400 降到 $2900，见 `loss_bonus.deep_streak_cap`，不要在没上服务器之前选其中一种当成事实。

人质图的队奖在竞技 cfg 里另有一套（例如人质图歼灭 $3000），Premier 爆破不用，JSON 里没有把它们混进爆破规则。
