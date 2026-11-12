import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateBuyOptions, evaluateFreeze } from "@roundmind/engine";
import { adaptEconomyEngine, EV_POINT_DOLLARS } from "./economy-engine.js";
import { blueprintMatch } from "./fixtures.js";
import { parseMatchJson } from "./match-file.js";
import { formatEv } from "./narrate.js";
import { reviewMatch, type PlayedRound } from "./review.js";

function readRounds(file: string): PlayedRound[] {
  const text = readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), "utf8");
  return parseMatchJson(text).rounds;
}

try {
  const args = process.argv.slice(2);
  if (args.length > 1) throw new Error("Usage: npm run review -w @roundmind/post-match -- [match.json]");
  const file = args[0];
  const rounds = file === undefined ? blueprintMatch : readRounds(file);
  const engine = adaptEconomyEngine({ evaluateFreeze, evaluateBuyOptions });
  const review = reviewMatch(rounds, engine);

  console.log("RoundMind post-match review");
  console.log(`Input: ${file ?? "built-in example"}. Score source: ${review.source}.`);
  console.log(`Leak cost = best - chosen, in loss-bonus steps (1 step = $${EV_POINT_DOLLARS} in the policy model).`);
  console.log(`Rounds: ${review.roundsConsidered}. Leaks: ${review.totalLeaks}. Showing ${review.leaks.length}.`);

  if (review.leaks.length === 0) console.log("No decision leaked expected value.");
  review.leaks.forEach((leak, index) => {
    console.log(`\n${index + 1}. Round ${leak.roundNumber}  ${leak.chosenBuy} → ${leak.betterBuy}  cost ${formatEv(leak.evCost)} steps  winner ${leak.winner}`);
    console.log(`   ${leak.summary.en}`);
    console.log(`   ${leak.summary.zh}`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
