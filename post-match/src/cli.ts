import { createFixtureLookupEngine } from "./fixture-engine.js";
import { blueprintEngineTable, blueprintMatch, blueprintRoundsForEngine } from "./fixtures.js";
import { reviewMatch } from "./review.js";

const engine = createFixtureLookupEngine(blueprintEngineTable);
const review = reviewMatch(blueprintRoundsForEngine(), engine);

console.log("RoundMind post-match review");
console.log("Source: fixture lookup. zhasi's evaluateFreeze returns one buy and enemy.band, not per-class expected value.");
console.log(`Rounds: ${review.roundsConsidered}. Leaks: ${review.totalLeaks}. Showing ${review.leaks.length}.`);
console.log("");

if (review.leaks.length === 0) {
  console.log("No decision leaked expected value.");
} else {
  review.leaks.forEach((leak, index) => {
    console.log(
      `${index + 1}. Round ${leak.roundNumber}  ${leak.chosenBuy} → ${leak.betterBuy}  EV cost ${leak.evCost.toFixed(2)}  winner ${leak.winner}`,
    );
    console.log(`   ${leak.summary.en}`);
    console.log(`   ${leak.summary.zh}`);
    console.log("");
  });
}

const played = blueprintMatch.map((round) => `${round.roundNumber}:${round.chosenBuy}`).join(", ");
console.log(`Played buys in the fixture: ${played}.`);
