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
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
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
 * Narration only. The buy class comes from `evaluateBuyOptions`.
 * Cost is in loss-bonus steps (1 point = $500).
 * The 4-man-save wording is the blueprint's post-match example
 * (Master Blueprint v1.0, Part 3.3), used when that situation is
 * what the engine's best line actually is.
 */
export function narrateLeak(input: LeakNarrativeInput): BilingualText {
  const count = input.saveEligibleCount;
  const ev = formatEv(input.evCost);
  const lightOrSave = input.betterBuy === "eco" || input.betterBuy === "save";
  if (
    input.chosenBuy === "full" &&
    count !== undefined &&
    count >= 4 &&
    lightOrSave
  ) {
    return {
      en: `Round ${input.roundNumber}: with a ${count}-man save available, the model scores ${buyLabel(input.betterBuy, "en")} ${ev} loss-bonus steps above the full buy.`,
      zh: `第 ${input.roundNumber} 回合：有 ${count} 人可以存枪时，模型给${buyLabel(input.betterBuy, "zh")}的评分比全装高 ${ev} 个连败奖励档。`,
    };
  }

  const extraEn = input.betterReason.en ? ` ${input.betterReason.en}` : "";
  const extraZh = input.betterReason.zh ? `${input.betterReason.zh}` : "";
  return {
    en: `Round ${input.roundNumber}: choosing ${buyLabel(input.chosenBuy, "en")} instead of ${buyLabel(input.betterBuy, "en")} left ${ev} loss-bonus steps on the table.${extraEn}`,
    zh: `第 ${input.roundNumber} 回合：选择${buyLabel(input.chosenBuy, "zh")}而不是${buyLabel(input.betterBuy, "zh")}，少了 ${ev} 个连败奖励档（每档 $500）。${extraZh}`,
  };
}
