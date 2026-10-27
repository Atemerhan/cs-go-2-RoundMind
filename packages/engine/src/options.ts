import { forceBuyCash, fullBuyCash, opposite, utilityBuyCash } from "./money.js";
import { assessFreeze, type FreezeFeatures } from "./recommend.js";
import { LOSS_BONUS_STEP, POLICY } from "./rules.js";
import type { BuyClass, BuyOption, FreezeSnapshot, Side } from "./types.js";

/**
 * Every buy class the engine knows, in a stable order.
 * Adding a member to `BuyClass` fails this assignment.
 */
const BUY_CLASS_ORDER = {
  full: "full",
  force: "force",
  eco: "eco",
  save: "save",
} as const satisfies Record<BuyClass, BuyClass>;

/**
 * Score every buy class for one freeze.
 *
 * `expectedValue` is a relative policy score in loss-bonus steps
 * (`LOSS_BONUS_STEP`, $500). It is the slack on the rule `evaluateFreeze`
 * already fired, minus the threshold or loadout gap for any other class.
 * It is not estimated round-win dollars.
 *
 * On a live round the recommended class is the unique maximum, so
 * `chosen.expectedValue - max(expectedValue)` is the regret of a freeze.
 * When `evaluateFreeze` returns `buy: null`, every value is 0.
 */
export function evaluateBuyOptions(input: FreezeSnapshot): BuyOption[] {
  const { features } = assessFreeze(input);
  const quality = features.buy === null ? 0 : Math.round(qualityDollars(features));
  return [BUY_CLASS_ORDER.full, BUY_CLASS_ORDER.force, BUY_CLASS_ORDER.eco, BUY_CLASS_ORDER.save].map((buy) => ({
    buy,
    expectedValue: (quality - regretDollars(buy, features)) / LOSS_BONUS_STEP.value,
  }));
}

/**
 * Slack, in dollars, on the rule that selected `features.buy`.
 * Zero when cash sits on that line. The pistol rule's slack is the poor-path
 * pistol bundle `spendAmount` already spends.
 */
function qualityDollars(features: FreezeFeatures): number {
  if (features.buy === null) return 0;
  if (features.code === "pistol_full") return POLICY.pistolSpendLow.value;
  const fullLine = fullBuyCash(features.side);
  const forceLine = forceBuyCash(features.side);
  switch (features.buy) {
    case "full":
      return Math.max(0, features.averageCash - fullLine);
    case "force":
      return Math.max(0, features.averageCash - forceLine);
    case "eco":
      if (features.averageCash >= forceLine) {
        return Math.max(0, features.averageCash + features.lossBonus - fullLine);
      }
      return Math.max(0, forceLine - features.averageCash);
    case "save":
      return Math.max(0, utilityBuyCash(features.side) - features.averageCash);
    default: {
      const exhaustive: never = features.buy;
      return exhaustive;
    }
  }
}

/**
 * Dollars this class gives up versus the class the policy selected.
 * At least $1 on a live round, so rounding cannot create a second maximum.
 * That dollar is only the floor; the rest is a line, a loss bonus, or a bundle.
 */
function regretDollars(candidate: BuyClass, features: FreezeFeatures): number {
  if (features.buy === null || candidate === features.buy) return 0;
  return Math.max(1, Math.round(rawRegret(candidate, features)));
}

function rawRegret(candidate: BuyClass, features: FreezeFeatures): number {
  const chosen = features.buy;
  if (chosen === null || candidate === chosen) return 0;
  if (chosen === "full" && features.code === "pistol_full") return pistolRegret(candidate, features.primaryRatio);
  if (chosen === "full") return fullBuyRegret(candidate, features);
  if (chosen === "force") return forceRegret(candidate, features);
  if (chosen === "eco") return ecoRegret(candidate, features);
  return saveRegret(candidate, features);
}

/** Pistol bundles from `spendAmount`: poor path is the full pistol buy, rich path is the partial. */
function pistolRegret(candidate: BuyClass, primaryRatio: number): number {
  const committed = POLICY.pistolSpendLow.value;
  const partial = POLICY.pistolSpendHigh.value;
  if (candidate === "force") return committed - partial;
  const banked = committed - POLICY.ecoSpendHigh.value;
  if (candidate === "eco") return banked;
  return banked + missingPrimaryDollars(primaryRatio);
}

/**
 * Rifle round where the policy bought full. The gap is the loadout the
 * projector would spend for full, minus the bundle the other class spends.
 * Save spends nothing.
 */
function fullBuyRegret(candidate: BuyClass, features: FreezeFeatures): number {
  const brought = loadoutAverage("full", features.side, features.averageCash);
  if (candidate === "save") return brought;
  return brought - loadoutAverage(candidate, features.side, features.averageCash);
}

function forceRegret(candidate: BuyClass, features: FreezeFeatures): number {
  const fullLine = fullBuyCash(features.side);
  if (candidate === "full") return fullLine - features.averageCash;
  const brought = loadoutAverage("force", features.side, features.averageCash);
  const other = candidate === "save" ? 0 : loadoutAverage("eco", features.side, features.averageCash);
  let regret = brought - other;
  if (features.code === "force_punish") {
    regret += Math.max(0, fullBuyCash(opposite(features.side)) - features.enemyAverageHigh);
  } else {
    regret += Math.max(0, fullLine - (features.averageCash + features.lossBonus));
  }
  if (candidate === "save") regret += missingPrimaryDollars(features.primaryRatio);
  return regret;
}

function ecoRegret(candidate: BuyClass, features: FreezeFeatures): number {
  const forceLine = forceBuyCash(features.side);
  const fullLine = fullBuyCash(features.side);
  const banking = features.averageCash >= forceLine;
  if (!banking) {
    if (candidate === "force") return forceLine - features.averageCash;
    if (candidate === "full") return fullLine - features.averageCash;
    return missingPrimaryDollars(features.primaryRatio);
  }
  const burned = loadoutAverage("force", features.side, features.averageCash);
  if (candidate === "force") return burned;
  if (candidate === "full") return fullLine - features.averageCash + burned;
  return missingPrimaryDollars(features.primaryRatio);
}

/** Distance below the utility rebuy. A force also gives up the rifle-to-force tier. An eco gives up the rifle line. */
function saveRegret(candidate: BuyClass, features: FreezeFeatures): number {
  const shortfall = utilityBuyCash(features.side) - features.averageCash;
  if (candidate === "full") return shortfall;
  if (candidate === "force") return shortfall + (fullBuyCash(features.side) - forceBuyCash(features.side));
  return shortfall + fullBuyCash(features.side);
}

/**
 * A save/eco label miss when the money action is the same low spend.
 * Capped at `savePrimaryRatio` loss-bonus steps (0.6 × $500).
 */
function missingPrimaryDollars(primaryRatio: number): number {
  const missing = Math.max(0, POLICY.savePrimaryRatio.value - primaryRatio);
  return missing * LOSS_BONUS_STEP.value;
}

/**
 * Average of the poor-path and rich-path caps `spendAmount` uses for this
 * class, limited by the cash in hand. Counterfactual classes keep their own
 * bundle; they do not inherit the bundle the cash line would have selected.
 */
function loadoutAverage(kind: "full" | "force" | "eco", side: Side, cash: number): number {
  const cap = loadoutCap(kind, side);
  const affordable = Math.max(0, cash);
  return (Math.min(affordable, cap.low) + Math.min(affordable, cap.high)) / 2;
}

function loadoutCap(kind: "full" | "force" | "eco", side: Side): { low: number; high: number } {
  if (kind === "eco") return { low: POLICY.ecoSpendLow.value, high: POLICY.ecoSpendHigh.value };
  if (kind === "force") {
    return side === "T"
      ? { low: POLICY.tForceSpendLow.value, high: POLICY.tForceSpendHigh.value }
      : { low: POLICY.ctForceSpendLow.value, high: POLICY.ctForceSpendHigh.value };
  }
  return side === "T"
    ? { low: POLICY.tFullSpendLow.value, high: POLICY.tFullSpendHigh.value }
    : { low: POLICY.ctFullSpendLow.value, high: POLICY.ctFullSpendHigh.value };
}
