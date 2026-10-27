import type { BuyClass, CompletedRound, FreezeAdvice, ReasonCode, RoundEndReason, Side, WarningCode } from "@roundmind/engine";

export type Lang = "zh" | "en";

export function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

const buyZh: Record<BuyClass, string> = {
  full: "满购",
  force: "强起",
  eco: "白给",
  save: "存枪",
};

const buyEn: Record<BuyClass, string> = {
  full: "Full",
  force: "Force",
  eco: "Eco",
  save: "Save",
};

export function buyLabel(lang: Lang, buy: BuyClass | null): string {
  if (!buy) return lang === "zh" ? "无建议" : "No call";
  return lang === "zh" ? buyZh[buy] : buyEn[buy];
}

export function reasonText(lang: Lang, advice: FreezeAdvice): string {
  const bonus = money(advice.reason.lossBonus);
  const band = `${money(advice.reason.enemyMin)}–${money(advice.reason.enemyMax)}`;
  const zh: Record<ReasonCode, string> = {
    pistol_full: "手枪局。把 $800 花在手枪和道具上。",
    overtime_full: "加时半场开始，每人 $10,000。直接满购。连败计数会不会归零还没核实，这条建议不靠它。",
    full_buy: `现金够步枪加头盔。对方大约 ${band}。`,
    eco_bank: `现金不够起枪。这一分输掉，负场奖金是 ${bonus}，留给下一分。`,
    force_punish: `对方大约 ${band}，上沿也不够满购。护甲加中档枪，惩罚他们的经济。`,
    force_default: "能强起。把钱省下来也凑不齐下一分的步枪加头盔。",
    save_hold: "多数人还拿着主武器。留着枪，不要卖掉重买。超时会不会扣光负场奖金还没核实，所以不按“死了拿奖金更值”来建议。",
    match_over: "这局已经分出胜负。",
    match_draw: "Premier 加时打成 15–15，比赛是平局。",
    empty_roster: "先填上己方现金。",
  };
  const en: Record<ReasonCode, string> = {
    pistol_full: "Pistol round. Spend the $800 on a pistol and utility.",
    overtime_full: "Overtime half starts at $10,000 each. Full buy. Whether the loss count resets is unverified, and this call does not depend on it.",
    full_buy: `Cash covers a rifle and helmet. Enemy band is about ${band}.`,
    eco_bank: `Not enough for a gun. Losing pays a ${bonus} loss bonus toward the next round.`,
    force_punish: `Enemy band is about ${band}, and even the rich edge is short of a full buy. Armor and a mid-tier gun punishes that.`,
    force_default: "A force is affordable. Saving still does not reach rifle and helmet next round.",
    save_hold: "Most of the roster still holds a primary. Keep it. Who loses round-end income on a timeout is unverified, so this does not say “die for the bonus.”",
    match_over: "The match is already decided.",
    match_draw: "Premier overtime finished 15–15. The match is a draw.",
    empty_roster: "Enter your team's cash first.",
  };
  return lang === "zh" ? zh[advice.reason.code] : en[advice.reason.code];
}

export function sideLabel(lang: Lang, side: Side): string {
  if (lang === "zh") return side === "T" ? "匪" : "警";
  return side;
}

export function reasonLabel(lang: Lang, reason: RoundEndReason): string {
  const zh: Record<RoundEndReason, string> = {
    elimination: "歼灭",
    bomb_explode: "爆炸",
    bomb_defuse: "拆包",
    time: "超时",
  };
  const en: Record<RoundEndReason, string> = {
    elimination: "Elimination",
    bomb_explode: "Detonation",
    bomb_defuse: "Defuse",
    time: "Time",
  };
  return lang === "zh" ? zh[reason] : en[reason];
}

export function warningText(lang: Lang, code: WarningCode): string {
  const zh: Record<WarningCode, string> = {
    missing_history: "历史比回合数短，对方经济带会偏宽。",
    history_ignored: "多出来的历史回合被忽略了。",
    cash_clamped: "现金被限制在 $0 到 $16,000。下限尚未在官方文本里确认。",
    score_mismatch: "比分和历史不一致。胜负用你填的比分，金钱仍按历史推。",
    alive_clamped: "存活人数被限制在 0 到 5。",
    empty_roster: "没有己方玩家。",
    non_integer_cash: "现金按整数美元计算。",
    overtime_loss_count_unverified: "加时金钱重置已核实。连败计数会不会一起归零，没有核实。",
    ot_cash_differs_from_reset: "加时半场开始时游戏会把每人设成 $10,000。你填的现金不一样，建议仍按你填的数。",
    half_cash_differs_from_reset: "手枪局或下半场开始时应是 $800。你填的现金不一样，建议仍按你填的数。",
  };
  const en: Record<WarningCode, string> = {
    missing_history: "History is shorter than the round number, so the enemy band is wide.",
    history_ignored: "Extra history rows were ignored.",
    cash_clamped: "Cash is clamped to $0–$16,000. The floor is not confirmed in an official note.",
    score_mismatch: "Score and history disagree. Match status uses the score; money follows history.",
    alive_clamped: "Alive counts were clamped to 0–5.",
    empty_roster: "No players on our side.",
    non_integer_cash: "Cash is treated as whole dollars.",
    overtime_loss_count_unverified: "Overtime money reset is verified. A loss-count reset is not.",
    ot_cash_differs_from_reset: "An overtime half sets every player to $10,000. Your figure differs; the call uses what you typed.",
    half_cash_differs_from_reset: "A pistol or new half starts at $800. Your figure differs; the call uses what you typed.",
  };
  return lang === "zh" ? zh[code] : en[code];
}

export function roundPhase(lang: Lang, advice: FreezeAdvice): string {
  const round = advice.round.roundNumber;
  if (advice.round.phase === "overtime") {
    const period = advice.round.overtimePeriod ?? 1;
    return lang === "zh"
      ? `第 ${round} 回合 · 加时 ${period} · 半场 ${advice.round.half}`
      : `Round ${round} · OT ${period} · half ${advice.round.half}`;
  }
  const half = advice.round.half === 1 ? (lang === "zh" ? "上半场" : "first half") : lang === "zh" ? "下半场" : "second half";
  return lang === "zh" ? `第 ${round} 回合 · ${half}` : `Round ${round} · ${half}`;
}

function confidenceLabel(lang: Lang, confidence: FreezeAdvice["enemy"]["readConfidence"]): string {
  if (lang === "en") return confidence;
  if (confidence === "high") return "高";
  if (confidence === "medium") return "中";
  return "低";
}

export function enemyRead(lang: Lang, advice: FreezeAdvice): string {
  const poor = buyLabel(lang, advice.enemy.poorerBuy);
  const rich = buyLabel(lang, advice.enemy.richerBuy);
  const confidence = confidenceLabel(lang, advice.enemy.readConfidence);
  if (poor === rich) {
    return lang === "zh" ? `对方更像${poor}（信心${confidence}）` : `Enemy reads ${poor} (${confidence})`;
  }
  return lang === "zh"
    ? `对方从${poor}到${rich}，信心${confidence}`
    : `Enemy spans ${poor} to ${rich}, ${confidence} confidence`;
}

const UNVERIFIED_WARNINGS = new Set<WarningCode>(["overtime_loss_count_unverified"]);

export function isUnverifiedWarning(code: WarningCode): boolean {
  return UNVERIFIED_WARNINGS.has(code);
}

export function scoreLine(lang: Lang, score: { T: number; CT: number }): string {
  return lang === "zh" ? `匪 ${score.T} · 警 ${score.CT}` : `T ${score.T} · CT ${score.CT}`;
}

export function extrasLine(lang: Lang, round: CompletedRound): string {
  const parts: string[] = [];
  if (round.alive?.T !== undefined) parts.push(lang === "zh" ? `匪存活 ${round.alive.T}` : `T alive ${round.alive.T}`);
  if (round.alive?.CT !== undefined) parts.push(lang === "zh" ? `警存活 ${round.alive.CT}` : `CT alive ${round.alive.CT}`);
  if (round.killRewardTotal?.T !== undefined) {
    parts.push(lang === "zh" ? `匪击杀奖金 ${money(round.killRewardTotal.T)}` : `T kill reward ${money(round.killRewardTotal.T)}`);
  }
  if (round.killRewardTotal?.CT !== undefined) {
    parts.push(lang === "zh" ? `警击杀奖金 ${money(round.killRewardTotal.CT)}` : `CT kill reward ${money(round.killRewardTotal.CT)}`);
  }
  return parts.join(" · ");
}

export function phaseLabel(lang: Lang, phase: string): string {
  const zh: Record<string, string> = {
    freezetime: "冻结",
    live: "进行中",
    bomb: "已下包",
    defuse: "拆包中",
    over: "回合结束",
    halftime: "半场",
    timeout: "暂停",
    paused: "暂停",
    warmup: "热身",
    gameover: "比赛结束",
    unknown: "未知",
  };
  const en: Record<string, string> = {
    freezetime: "Freeze",
    live: "Live",
    bomb: "Planted",
    defuse: "Defuse",
    over: "Round over",
    halftime: "Halftime",
    timeout: "Timeout",
    paused: "Paused",
    warmup: "Warmup",
    gameover: "Game over",
    unknown: "Unknown",
  };
  const table = lang === "zh" ? zh : en;
  return table[phase] ?? phase;
}

export interface Copy {
  skip: string;
  docTitle: string;
  title: string;
  subtitle: string;
  language: string;
  recommendation: string;
  thisFreeze: string;
  side: string;
  presets: string;
  pistol: string;
  eco: string;
  force: string;
  full: string;
  save: string;
  overtime: string;
  ourCash: string;
  player: (n: number) => string;
  playerCash: (n: number) => string;
  primary: string;
  primaryYes: string;
  primaryNo: string;
  primaryYesName: (n: number) => string;
  primaryNoName: (n: number) => string;
  teamCash: string;
  atFull: string;
  atForce: string;
  holding: string;
  fullLine: string;
  forceLine: string;
  affordFull: string;
  affordForce: string;
  affordShort: string;
  historyTitle: (n: number) => string;
  historyEmpty: string;
  newRound: string;
  winner: string;
  winnerName: (round: number, side: string) => string;
  newWinnerName: (side: string) => string;
  newReason: string;
  endReason: string;
  reasonName: (round: number) => string;
  optional: string;
  details: string;
  remove: string;
  aliveT: string;
  aliveCT: string;
  killT: string;
  killCT: string;
  addRound: string;
  roundN: (n: number) => string;
  removeRound: (n: number) => string;
  detailsRound: (n: number) => string;
  clearHistory: string;
  enemyEconomy: string;
  perPlayer: string;
  teamRange: string;
  axisLow: string;
  axisHigh: string;
  ourAverage: string;
  lossBonus: string;
  ourLosses: string;
  enemyLosses: string;
  unverified: string;
  disclaimer: string;
  compliance: string;
  helmet: string;
  kit: string;
  source: string;
  manual: string;
  live: string;
  localOnly: string;
  statusConnecting: string;
  statusDown: string;
  statusWaiting: string;
  statusInvalid: string;
  statusNeedsSide: string;
  statusReady: (round: number, phase: string, side: string) => string;
  statusFallbackSide: string;
  callFromLive: string;
  callFromManual: string;
  manualSummary: string;
  fallbackSummary: string;
  liveRoster: (n: number) => string;
  liveHistory: string;
  reportedShort: string;
}

const zhCopy: Copy = {
  skip: "跳到建议",
  docTitle: "RoundMind · 冻结时间经济",
  title: "冻结时间经济",
  subtitle: "满购、强起、白给、存枪。只根据公开回合和己方现金。",
  language: "语言",
  recommendation: "这一冻结的建议",
  thisFreeze: "这一冻结",
  side: "阵营",
  presets: "局面",
  pistol: "手枪局",
  eco: "白给",
  force: "强起",
  full: "满购",
  save: "存枪",
  overtime: "加时",
  ourCash: "己方现金",
  player: (n) => `玩家 ${n}`,
  playerCash: (n) => `玩家 ${n} 现金`,
  primary: "主武器",
  primaryYes: "有",
  primaryNo: "无",
  primaryYesName: (n) => `玩家 ${n} 有主武器`,
  primaryNoName: (n) => `玩家 ${n} 无主武器`,
  teamCash: "团队现金",
  atFull: "达到满购线",
  atForce: "达到强起线",
  holding: "有主武器",
  fullLine: "满购线",
  forceLine: "强起线",
  affordFull: "够满购",
  affordForce: "够强起",
  affordShort: "未到线",
  historyTitle: (n) => `已结束的回合 · ${n}`,
  historyEmpty: "还没有已结束的回合。",
  newRound: "新回合",
  winner: "获胜方",
  winnerName: (round, side) => `回合 ${round} ${side}获胜`,
  newWinnerName: (side) => `新回合 ${side}获胜`,
  newReason: "新回合结束方式",
  endReason: "结束方式",
  reasonName: (round) => `回合 ${round} 结束方式`,
  optional: "可选：存活与击杀奖金",
  details: "细节",
  remove: "删除",
  aliveT: "匪存活",
  aliveCT: "警存活",
  killT: "匪击杀奖金合计",
  killCT: "警击杀奖金合计",
  addRound: "加入回合",
  roundN: (n) => `回合 ${n}`,
  removeRound: (n) => `删除回合 ${n}`,
  detailsRound: (n) => `回合 ${n} 细节`,
  clearHistory: "清空历史",
  enemyEconomy: "对方经济",
  perPlayer: "人均",
  teamRange: "全队",
  axisLow: "$0",
  axisHigh: "上限",
  ourAverage: "己方人均",
  lossBonus: "负场奖金",
  ourLosses: "己方连败计数",
  enemyLosses: "对方连败计数",
  unverified: "未核实",
  disclaimer: "超时加钱扣给谁、连败计数会不会封顶、加时连败计数会不会归零，都还没核实。建议不把这些当成事实。",
  compliance: "RoundMind 只做赛前和冻结时间的决策辅助。以后只接官方 Game State Integration。不读内存，不注入，不模拟键鼠，不提供敌人位置或准星。玩家自己下单。",
  helmet: "头甲",
  kit: "拆弹器",
  source: "建议来源",
  manual: "手动",
  live: "本机直播（GSI）",
  localOnly: "只读本机 http://127.0.0.1:3000/state。不上传，不读内存。监听不在时用手动表。",
  statusConnecting: "正在连接本机监听…",
  statusDown: "监听没开，正在用手动表。",
  statusWaiting: "监听在，还没有对局，正在用手动表。",
  statusInvalid: "收到的内容不是对局状态，正在用手动表。",
  statusNeedsSide: "这场没有阵营。先在手动表里选匪或警。",
  statusReady: (round, phase, side) => `已连上 · 第 ${round} 回合 · ${phase} · ${side}`,
  statusFallbackSide: "这场没有标明阵营，沿用手动表的选择。",
  callFromLive: "来自本机 GSI",
  callFromManual: "来自手动表",
  manualSummary: "手动表",
  fallbackSummary: "手动表（断线后用这张）",
  liveRoster: (n) => `己方现金 ${n} 人`,
  liveHistory: "监听记下的回合",
  reportedShort: "没送来现金的人不算进人均，也不当成 $0。",
};

const enCopy: Copy = {
  skip: "Skip to the call",
  docTitle: "RoundMind · Freeze-time economy",
  title: "Freeze-time economy",
  subtitle: "Full, force, eco, or save. Public rounds and your cash only.",
  language: "Language",
  recommendation: "This freeze",
  thisFreeze: "This freeze",
  side: "Side",
  presets: "Situations",
  pistol: "Pistol",
  eco: "Eco",
  force: "Force",
  full: "Full",
  save: "Save",
  overtime: "Overtime",
  ourCash: "Our cash",
  player: (n) => `Player ${n}`,
  playerCash: (n) => `Player ${n} cash`,
  primary: "Primary",
  primaryYes: "Yes",
  primaryNo: "No",
  primaryYesName: (n) => `Player ${n} has a primary`,
  primaryNoName: (n) => `Player ${n} has no primary`,
  teamCash: "Team cash",
  atFull: "At full-buy line",
  atForce: "At force line",
  holding: "Holding a primary",
  fullLine: "Full-buy line",
  forceLine: "Force line",
  affordFull: "Can full-buy",
  affordForce: "Can force",
  affordShort: "Short",
  historyTitle: (n) => `Completed rounds · ${n}`,
  historyEmpty: "No completed rounds yet.",
  newRound: "New round",
  winner: "Winner",
  winnerName: (round, side) => `Round ${round} ${side} won`,
  newWinnerName: (side) => `New round ${side} won`,
  newReason: "New round end reason",
  endReason: "End reason",
  reasonName: (round) => `Round ${round} end reason`,
  optional: "Optional: alive and kill reward",
  details: "Details",
  remove: "Remove",
  aliveT: "T alive",
  aliveCT: "CT alive",
  killT: "T kill reward",
  killCT: "CT kill reward",
  addRound: "Add round",
  roundN: (n) => `Round ${n}`,
  removeRound: (n) => `Remove round ${n}`,
  detailsRound: (n) => `Round ${n} details`,
  clearHistory: "Clear history",
  enemyEconomy: "Enemy economy",
  perPlayer: "Per player",
  teamRange: "Team",
  axisLow: "$0",
  axisHigh: "Cap",
  ourAverage: "Our average",
  lossBonus: "Loss bonus",
  ourLosses: "Our loss count",
  enemyLosses: "Enemy loss count",
  unverified: "Unverified",
  disclaimer: "Who gets the +$0 timeout line, whether a deep loss count is stored capped, and whether overtime resets that count are unverified. The call does not treat them as facts.",
  compliance: "RoundMind is coaching for the buy phase and review. A later build may read official Game State Integration only. No memory reading, no injection, no input automation, no enemy positions or crosshair help. The player makes every action.",
  helmet: "Helmet",
  kit: "Kit",
  source: "Call source",
  manual: "Manual",
  live: "Live (GSI)",
  localOnly: "Read-only http://127.0.0.1:3000/state on this machine. Nothing is uploaded. No memory reading. If the listener is down, the manual form is the call.",
  statusConnecting: "Connecting to the local listener…",
  statusDown: "Listener is down. Using the manual form.",
  statusWaiting: "Listener is up, but no match yet. Using the manual form.",
  statusInvalid: "That payload is not a match state. Using the manual form.",
  statusNeedsSide: "This match has no side. Pick T or CT on the manual form.",
  statusReady: (round, phase, side) => `Connected · round ${round} · ${phase} · ${side}`,
  statusFallbackSide: "This match did not name a side. Using the manual form's side.",
  callFromLive: "From local GSI",
  callFromManual: "From the manual form",
  manualSummary: "Manual form",
  fallbackSummary: "Manual form (used if the listener drops)",
  liveRoster: (n) => `${n} on our side with cash`,
  liveHistory: "Rounds the listener kept",
  reportedShort: "Players with no cash in the payload are left out. They are not treated as $0.",
};

export function copy(lang: Lang): Copy {
  return lang === "zh" ? zhCopy : enCopy;
}
