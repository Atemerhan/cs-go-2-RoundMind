import type { BuyClass, FreezeAdvice, ReasonCode, RoundEndReason, Side, WarningCode } from "@roundmind/engine";

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
