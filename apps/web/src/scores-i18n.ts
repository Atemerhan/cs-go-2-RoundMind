import type { Lang } from "./i18n";

export interface ScoresCopy {
  title: string;
  best: string;
  tied: string;
  behind: (steps: string) => string;
  note: string;
}

const zh: ScoresCopy = {
  title: "各买法评分",
  best: "最高",
  tied: "同分",
  behind: (steps) => `少 ${steps} 档`,
  note: "每条买法都有评分。最高分就是这条建议。一档等于 $500 连败奖金，不是这一分的胜率。",
};

const en: ScoresCopy = {
  title: "Score of each buy",
  best: "Best",
  tied: "Tied",
  behind: (steps) => `${steps} behind`,
  note: "Every buy the engine considers has a score. The highest score is the call. One step is a $500 loss bonus, not a round-win dollar.",
};

export function scoresCopy(lang: Lang): ScoresCopy {
  return lang === "zh" ? zh : en;
}
