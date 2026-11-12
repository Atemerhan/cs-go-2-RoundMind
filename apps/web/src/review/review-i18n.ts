import type { BuyClass } from "@roundmind/engine";
import { buyLabel, type Lang } from "../i18n";
import { formatPolicyScore } from "../format-score";

export interface ReviewCopy {
  docTitle: string;
  title: string;
  subtitle: string;
  loadTitle: string;
  drop: string;
  choose: string;
  sample: string;
  download: string;
  sampleNote: string;
  fileNote: (name: string) => string;
  readError: string;
  summary: string;
  rounds: string;
  aligned: string;
  leaks: string;
  totalCost: string;
  highlights: string;
  noLeaks: string;
  economy: string;
  played: string;
  recommended: string;
  winnerUs: string;
  winnerThem: string;
  noEconomy: string;
  loggedScores: string;
  engineScores: string;
  roundN: (n: number) => string;
  stepUnit: string;
  feedback: (input: FeedbackInput) => string;
  highlight: (roundNumber: number, chosen: BuyClass, better: BuyClass, evCost: number) => string;
}

export interface FeedbackInput {
  roundNumber: number;
  chosenBuy: BuyClass;
  recommendedBuy: BuyClass | null;
  evCost: number;
  saveEligibleCount?: number;
  matched: boolean;
}

const zh: ReviewCopy = {
  docTitle: "RoundMind · 赛后复盘",
  title: "赛后复盘",
  subtitle: "对照每一分的实际买法和引擎建议。文件在这台浏览器里解析，不上传，也不连接 GSI。",
  loadTitle: "载入比赛",
  drop: "把 match.json 拖到这里，或选择文件。",
  choose: "选择文件",
  sample: "载入样例",
  download: "下载样例 match.json",
  sampleNote: "正在显示内置样例。没有游戏、也没有本机监听，一样能看。",
  fileNote: (name) => `已载入 ${name}`,
  readError: "无法读取这份赛后记录。",
  summary: "全场",
  rounds: "回合",
  aligned: "与建议一致",
  leaks: "有差距",
  totalCost: "合计少掉",
  highlights: "差距最大的回合",
  noLeaks: "每一分的买法都和最高分一致。",
  economy: "这一分的经济",
  played: "实际买法",
  recommended: "建议买法",
  winnerUs: "己方胜",
  winnerThem: "对方胜",
  noEconomy: "这份记录没有冻结快照，只比较了文件里的评分。",
  loggedScores: "评分来自文件里记下的结果。",
  engineScores: "评分由经济引擎按冻结快照算出。",
  roundN: (n) => `第 ${n} 回合`,
  stepUnit: "档",
  feedback: (input) => feedbackZh(input),
  highlight: (roundNumber, chosen, better, evCost) =>
    `第 ${roundNumber} 回合买了${buyLabel("zh", chosen)}，建议${buyLabel("zh", better)}，少 ${formatPolicyScore(evCost)} 档`,
};

const en: ReviewCopy = {
  docTitle: "RoundMind · Post-match review",
  title: "Post-match review",
  subtitle: "Each round's played buy against the engine's call. The file stays in this browser. Nothing is uploaded, and GSI is not required.",
  loadTitle: "Load a match",
  drop: "Drop a match.json here, or choose a file.",
  choose: "Choose file",
  sample: "Load sample",
  download: "Download sample match.json",
  sampleNote: "Showing the bundled sample. No game and no local listener required.",
  fileNote: (name) => `Loaded ${name}`,
  readError: "Could not read this match file.",
  summary: "Match",
  rounds: "Rounds",
  aligned: "Matched the call",
  leaks: "Gaps",
  totalCost: "Total left behind",
  highlights: "Largest gaps",
  noLeaks: "Every played buy was the top score.",
  economy: "Economy this round",
  played: "Played",
  recommended: "Recommended",
  winnerUs: "We won",
  winnerThem: "They won",
  noEconomy: "This record has no freeze snapshot. Only the logged scores were compared.",
  loggedScores: "Scores came from the file.",
  engineScores: "Scores were computed from the freeze snapshot.",
  roundN: (n) => `Round ${n}`,
  stepUnit: "steps",
  feedback: (input) => feedbackEn(input),
  highlight: (roundNumber, chosen, better, evCost) =>
    `Round ${roundNumber} played ${buyLabel("en", chosen)}. ${buyLabel("en", better)} scores ${formatPolicyScore(evCost)} steps higher.`,
};

function feedbackZh(input: FeedbackInput): string {
  const played = buyLabel("zh", input.chosenBuy);
  if (input.recommendedBuy === null) return `第 ${input.roundNumber} 回合没有可比较的建议。`;
  const recommended = buyLabel("zh", input.recommendedBuy);
  if (input.matched) return `第 ${input.roundNumber} 回合的买法和建议一致，都是${played}。`;
  const gap = formatPolicyScore(input.evCost);
  const count = input.saveEligibleCount;
  if (input.chosenBuy === "full" && count !== undefined && count >= 4 && (input.recommendedBuy === "eco" || input.recommendedBuy === "save")) {
    return `第 ${input.roundNumber} 回合买了${played}。有 ${count} 人可以存枪，建议是${recommended}，少了 ${gap} 档（每档 $500）。`;
  }
  return `第 ${input.roundNumber} 回合买了${played}，建议是${recommended}，少了 ${gap} 档（每档 $500）。`;
}

function feedbackEn(input: FeedbackInput): string {
  const played = buyLabel("en", input.chosenBuy);
  if (input.recommendedBuy === null) return `Round ${input.roundNumber} has no comparable call.`;
  const recommended = buyLabel("en", input.recommendedBuy);
  if (input.matched) return `Round ${input.roundNumber}: the played ${played} matches the top score.`;
  const gap = formatPolicyScore(input.evCost);
  const count = input.saveEligibleCount;
  if (input.chosenBuy === "full" && count !== undefined && count >= 4 && (input.recommendedBuy === "eco" || input.recommendedBuy === "save")) {
    return `Round ${input.roundNumber}: with ${count} players able to save, ${recommended} scores ${gap} loss-bonus steps above the played ${played}.`;
  }
  return `Round ${input.roundNumber}: playing ${played} instead of ${recommended} left ${gap} loss-bonus steps on the table.`;
}

export function reviewCopy(lang: Lang): ReviewCopy {
  return lang === "zh" ? zh : en;
}
