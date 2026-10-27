import type { BilingualText, BuyClass } from "./economy-engine.js";

const BUY_LABEL: Record<BuyClass, BilingualText> = {
  full: { en: "full buy", zh: "全装" },
  force: { en: "force", zh: "强起" },
  eco: { en: "eco", zh: "ECO" },
  save: { en: "save", zh: "存枪" },
};

export function buyLabel(buyClass: BuyClass, locale: "en" | "zh"): string {
  return BUY_LABEL[buyClass][locale];
}

export function formatEv(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export interface LeakNarrativeInput {
  roundNumber: number;
  chosenBuy: BuyClass;
  betterBuy: BuyClass;
  evCost: number;
  betterReason: BilingualText;
  saveEligibleCount?: number;
}

/**
 * Narration only. The buy class comes from zhasi's option table.
 * The 4-man-save wording is the blueprint's post-match example
 * (Master Blueprint v1.0, Part 3.3), used when that situation is
 * what the engine's best line actually is.
 */
export function narrateLeak(input: LeakNarrativeInput): BilingualText {
  const count = input.saveEligibleCount;
  const lightOrSave = input.betterBuy === "eco" || input.betterBuy === "save";
  if (
    input.chosenBuy === "full" &&
    count !== undefined &&
    count >= 4 &&
    lightOrSave
  ) {
    const men = count === 4 ? "4" : String(count);
    return {
      en: `Round ${input.roundNumber}: full-buying into a ${men}-man save cost you the round and your next-round economy. A light buy or save wins the series of rounds.`,
      zh: `第 ${input.roundNumber} 回合：${men} 人可以存枪时选择全装，输掉了这一分，也输掉了下一分的经济。轻装或存枪才能赢下这一串回合。`,
    };
  }

  const ev = formatEv(input.evCost);
  return {
    en: `Round ${input.roundNumber}: choosing ${buyLabel(input.chosenBuy, "en")} instead of ${buyLabel(input.betterBuy, "en")} left ${ev} expected value on the table. ${input.betterReason.en}`,
    zh: `第 ${input.roundNumber} 回合：选择${buyLabel(input.chosenBuy, "zh")}而不是${buyLabel(input.betterBuy, "zh")}，少了 ${ev} 的期望价值。${input.betterReason.zh}`,
  };
}
