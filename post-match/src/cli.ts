import { adaptEconomyEngine, EV_POINT_DOLLARS } from "./economy-engine.js";
import { blueprintMatch } from "./fixtures.js";
import { formatEv } from "./narrate.js";
import { reviewMatch } from "./review.js";

const engineUrl = new URL("../vendor/engine/src/index.ts", import.meta.url).href;
const loaded = await import(engineUrl);
const engine = adaptEconomyEngine({
  evaluateFreeze: loaded.evaluateFreeze,
  evaluateBuyOptions: loaded.evaluateBuyOptions,
});
const review = reviewMatch(blueprintMatch, engine);

console.log("RoundMind post-match review");
console.log(`Source: zhasi evaluateBuyOptions. Leak cost = best - chosen, in loss-bonus steps (1 = $${EV_POINT_DOLLARS}).`);
console.log("zhasi regret = chosen - best, which is the negation of that cost.");
console.log(`Rounds: ${review.roundsConsidered}. Leaks: ${review.totalLeaks}. Showing ${review.leaks.length}.`);
console.log("");

if (review.leaks.length === 0) {
  console.log("No decision leaked expected value.");
} else {
  review.leaks.forEach((leak, index) => {
    console.log(
      `${index + 1}. Round ${leak.roundNumber}  ${leak.chosenBuy} → ${leak.betterBuy}  cost ${formatEv(leak.evCost)} steps  winner ${leak.winner}`,
    );
    console.log(`   ${leak.summary.en}`);
    console.log(`   ${leak.summary.zh}`);
    console.log("");
  });
}

const played = blueprintMatch.map((round) => `${round.roundNumber}:${round.chosenBuy}`).join(", ");
console.log(`Played buys in the fixture: ${played}.`);
