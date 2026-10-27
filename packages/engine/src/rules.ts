/**
 * Premier / competitive bomb-defusal constants.
 *
 * Statuses match docs/economy-rules.json from the sources pass
 * (branch cursor/economy-rules-sources-aa21, as of 2026-10-27).
 * This package does not own that file.
 *
 * verified   — Valve note, Liquipedia patch, or the cited game file.
 * unverified — the sources pass could not settle it. Not used as a fact.
 * policy     — a coaching choice. Not a game rule.
 *
 * Game files: SteamTracking/GameTracking-CS2 @ 04d3e4a67ac60168d0e79594c69a2116bb3b7278
 * (2026-10-22). Premier order is gamemode_competitive.cfg then
 * gamemode_competitive_tmm.cfg.
 */

export type Verification = "verified" | "unverified" | "policy";

export interface Rule<T> {
  id: string;
  value: T;
  verification: Verification;
  source: string;
}

function rule<T>(
  id: string,
  value: T,
  verification: Verification,
  source: string,
): Rule<T> {
  return { id, value, verification, source };
}

const GAME =
  "https://github.com/SteamTracking/GameTracking-CS2/blob/04d3e4a67ac60168d0e79594c69a2116bb3b7278";

const LOSS_2019 =
  "https://blog.counter-strike.net/2019/03/23488/ (2019-03-13): loss bonus $1400/$1900/$2400/$2900/$3400 for 0–4+ losses; a win reduces the count by one (minimum 0); halves begin at loss count 1.";

export const TEAM_SIZE = rule(
  "team_size",
  5,
  "policy",
  "5v5 Premier roster. Wingman is not modeled.",
);

export const START_MONEY = rule(
  "money.start",
  800,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — mp_startmoney 800. Pistol rounds and regulation half resets. Convar text: amount each player gets when they reset.`,
);

export const MAX_MONEY = rule(
  "money.cap",
  16_000,
  "verified",
  `${GAME}/DumpSource2/convars.txt — mp_maxmoney 16000, maximum amount of money allowed in a player's account. Also set in gamemode_competitive.cfg.`,
);

export const AFTER_ROUND_MONEY = rule(
  "money.after_round",
  0,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — mp_afterroundmoney 0. No flat cash after every round.`,
);

export const OVERTIME_START_MONEY = rule(
  "overtime.start_money",
  10_000,
  "verified",
  `${GAME}/DumpSource2/convars.txt — mp_overtime_startmoney 10000: money assigned to all players at the start of every overtime half. It replaces the previous balance. Not $12500. Neither competitive cfg overrides it.`,
);

export const LOSS_BONUS_BASE = rule(
  "loss_bonus.base",
  1400,
  "verified",
  `${LOSS_2019} 2026-10-22 gamemode_competitive.cfg still sets cash_team_loser_bonus 1400.`,
);

export const LOSS_BONUS_STEP = rule(
  "loss_bonus.step",
  500,
  "verified",
  `${LOSS_2019} cash_team_loser_bonus_consecutive_rounds 500 in the 2026-10-22 competitive cfg. Formula: 1400 + 500 * min(lossCount, 4).`,
);

export const LOSS_PAYOUT_CAP = rule(
  "loss_bonus.payout_cap",
  4,
  "verified",
  `${GAME}/DumpSource2/convars.txt — mp_consecutive_loss_max 4. Caps the payout only: min(lossCount, 4). The 4+ tier is $3400.`,
);

/**
 * Stored counter is not clamped. One win from a count above 4 still pays
 * $3400 next, because the count only falls by one. The sources pass says
 * not to hard-code "any win drops $500" for streaks deeper than 4.
 */
export const LOSS_COUNT_STORAGE_CAPPED = rule(
  "loss_bonus.deep_streak_cap",
  false,
  "unverified",
  "UNVERIFIED. 2019 says the count increases by one with no stored cap, and 4+ only caps the payout. A stored cap of 4 would drop the next payout from $3400 to $2900 after one win. This engine follows the uncapped-counter reading. Confirm on a current server before flipping this.",
);

export const HALF_START_LOSS_COUNT = rule(
  "loss_bonus.half_start",
  1,
  "verified",
  `${LOSS_2019} gamemode_competitive.cfg mp_starting_losses 1. The pistol loser is paid $1900, then $2400, so the count is paid first and incremented after. 2018-10-09: round-1 loser receives $1900 instead of $1400.`,
);

export const WIN_ELIMINATION = rule(
  "round_win.elimination",
  3250,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — cash_team_elimination_bomb_map 3250. Both sides.`,
);

export const WIN_TIME = rule(
  "round_win.time_expired",
  3250,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — cash_team_win_by_time_running_out_bomb 3250. CT win when the clock expires.`,
);

export const WIN_BOMB_EXPLODE = rule(
  "round_win.bomb_detonation",
  3500,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — cash_team_terrorist_win_bomb 3500. Detonation does not also pay the $600 planted-but-defused award.`,
);

export const WIN_BOMB_DEFUSE = rule(
  "round_win.defuse",
  3500,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — cash_team_win_by_defusing_bomb 3500. The bare convar default is 3250; Premier uses the cfg value, not that default.`,
);

export const CONSECUTIVE_WIN_BONUS = rule(
  "round_win.consecutive_winner_bonus",
  0,
  "verified",
  "cash_team_winner_bonus_consecutive_rounds bare default 0. Win streaks do not add cash. They only step the loss count down.",
);

export const PLANT_PLAYER_AWARD = rule(
  "objective.plant_personal",
  300,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — cash_player_bomb_planted 300. Paid to the planter only, not to every Terrorist. UI: "+$%s1 for planting the C4".`,
);

export const DEFUSE_PLAYER_AWARD = rule(
  "objective.defuse_personal",
  300,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — cash_player_bomb_defused 300. Paid to the defuser, on top of the $3500 team defuse win.`,
);

export const PLANT_TEAM_AWARD = rule(
  "objective.plant_team_if_defused",
  600,
  "verified",
  "Valve release notes 2024-05-23 (https://www.counter-strike.net/news/updates): terrorist team award when the bomb was planted but defused reduced from $800 to $600. 2026-10-22 cfg: cash_team_planted_bomb_but_defused 600. Each Terrorist receives $600, in addition to the loss bonus. Not paid on detonation.",
);

export const PLANT_AWARD_TIMING = rule(
  "objective.plant_award_timing",
  "round_end_total",
  "unverified",
  "UNVERIFIED whether cash_player_bomb_planted is added at the plant or only at round end. Settlement includes it in the planter's end-of-round cash either way. Timing is not used to strip the award on death.",
);

export const CT_KILL_TEAM_AWARD = rule(
  "kill.ct_team_award_per_dead_t",
  50,
  "verified",
  "https://www.counter-strike.net/newsentry/529852487375519749 (2025-07-16): each CT receives $50 for each Terrorist eliminated that round, win or lose. cash_team_per_dead_enemy 50. Five dead Ts is $250 for each CT.",
);

export const T_KILL_TEAM_AWARD = rule(
  "kill.t_team_award_per_dead_ct",
  0,
  "unverified",
  "UNVERIFIED. Valve's 2025-07-16 note grants the $50 award to Counter-Terrorists only. A localization string mentions eliminated CTs, but there is no second convar. Terrorists are not paid $50 per dead CT.",
);

export const TEAMKILL_PENALTY = rule(
  "kill.team_kill_penalty",
  300,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — cash_player_killed_teammate -300.`,
);

export const CASH_FLOOR = rule(
  "money.floor",
  0,
  "unverified",
  "UNVERIFIED. No cited convar states that cash cannot go below zero. The engine still floors at $0 so a team-kill penalty cannot invent debt.",
);

export const REGULATION_ROUNDS_PER_HALF = rule(
  "match.rounds_per_half",
  12,
  "verified",
  "https://www.counter-strike.net/newsentry/3644028846252008595 (2023-09-27): maximum of 24 rounds in regulation. gamemode_competitive.cfg mp_maxrounds 24, mp_halftime 1. First to 13.",
);

export const REGULATION_WIN_TARGET = rule(
  "match.win_target",
  13,
  "verified",
  "Follows from mp_maxrounds 24 and mp_match_can_clinch 1 (a team clinches once it has won more than half of the regulation rounds).",
);

export const OVERTIME_ROUNDS_PER_HALF = rule(
  "overtime.rounds_per_half",
  3,
  "verified",
  "mp_overtime_maxrounds 6. Valve 2023-09-27: a 6 round overtime. MR3 is two halves of 3.",
);

export const OVERTIME_WINS_TO_CLOSE = rule(
  "overtime.wins_to_close",
  4,
  "verified",
  "A 6-round block is won by taking 4 rounds. A 3–3 block does not crown a winner.",
);

export const OVERTIME_LIMIT_PREMIER = rule(
  "overtime.limit_premier",
  1,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive_tmm.cfg — mp_overtime_enable 1 and mp_overtime_limit 1. A 15–15 score is a draw. Default for this engine.`,
);

export const OVERTIME_LIMIT_MAJOR = rule(
  "overtime.limit_major",
  0,
  "verified",
  "Valve Major supplemental rulebook sets mp_overtime_limit 0 on top of Premier defaults, so overtime repeats until a team wins a block. Pass overtimeLimit: 0 to use it.",
);

export const OVERTIME_LOSS_COUNT_RESET = rule(
  "overtime.loss_count_reset",
  false,
  "unverified",
  "UNVERIFIED. Overtime money is replaced at each OT half. Whether the loss count also returns to mp_starting_losses (1) is not in the convar text. This engine keeps the count earned in the rounds already simulated.",
);

export const TIMEOUT_ZERO_LINE = rule(
  "save.timeout_zero_income_string",
  0,
  "verified",
  `${GAME}/game/csgo/pak01_dir/resource/csgo_english.txt — Team_Cash_Award_no_income = "+$0 penalty for running out of time". The string does not name an equipment threshold.`,
);

export const NO_EQUIPMENT_SAVE_THRESHOLD = rule(
  "save.no_equipment_value_threshold",
  true,
  "verified",
  "No competitive convar cancels the loss bonus because saved equipment is worth more than a dollar threshold. Do not invent a $1000 or $1500 save penalty.",
);

/**
 * Who receives the +$0 timeout line is not settled. The buy recommendation
 * must not tell a player to die for loss bonus. The enemy cash band still
 * spans "living Ts get $0" and "everyone gets the loss bonus".
 */
export const TIMEOUT_SURVIVOR_FORFEIT_IS_FACT = rule(
  "save.who_loses_income_on_timeout",
  false,
  "unverified",
  "UNVERIFIED. Community guides say a living Terrorist gets $0 on a no-plant time loss and dead Terrorists still get the loss bonus. The 2026 token Team_Cash_Award_Loser_Zero reads \"-$%s1 team income for dead players on losing team\" and does not confirm that. Not used as the save/force rule.",
);

export const SHORTHANDED_BONUS = rule(
  "shorthanded.premier_amount",
  1000,
  "verified",
  `${GAME}/game/csgo/cfg/gamemode_competitive.cfg — cash_team_bonus_shorthanded 1000 after mp_shorthanded_cash_bonus_round_delay 2. Not applied: the per-missing-player multiplier is unverified, and Majors set the award to 0.`,
);

export const REGULATION_ROUNDS = rule(
  "match.max_rounds",
  24,
  "verified",
  "Valve 2023-09-27 and mp_maxrounds 24.",
);

export type WeaponId =
  | "knife"
  | "pistol"
  | "cz75"
  | "smg"
  | "p90"
  | "shotgun"
  | "xm1014"
  | "rifle"
  | "awp"
  | "grenade"
  | "zeus";

const KILL_SOURCE =
  "weapons.vdata m_nKillAward at GameTracking-CS2 04d3e4a (2026-10-22). Valve 2024-04-25 (https://www.counter-strike.net/newsentry/4202497395513061959) set CZ75 to $300 (was $100), Zeus to $100 (was $0), XM1014 to $600 (was $900). Casual halves are not used.";

/** Competitive kill rewards. Casual is not modeled. */
export const KILL_REWARDS: Record<WeaponId, Rule<number>> = {
  knife: rule("kill.knife", 1500, "verified", KILL_SOURCE),
  pistol: rule(
    "kill.pistol",
    300,
    "verified",
    `${KILL_SOURCE} Glock, P2000, USP-S, P250, Dual Berettas, Five-SeveN, Tec-9, Desert Eagle, R8. cash_player_killed_enemy_default is 300.`,
  ),
  cz75: rule("kill.cz75", 300, "verified", KILL_SOURCE),
  smg: rule(
    "kill.smg",
    600,
    "verified",
    `${KILL_SOURCE} MAC-10, MP9, MP7, MP5-SD, UMP-45, PP-Bizon. P90 is not in this class.`,
  ),
  p90: rule("kill.p90", 300, "verified", KILL_SOURCE),
  shotgun: rule("kill.shotgun", 900, "verified", `${KILL_SOURCE} Nova, MAG-7, Sawed-Off.`),
  xm1014: rule("kill.xm1014", 600, "verified", KILL_SOURCE),
  rifle: rule(
    "kill.rifle",
    300,
    "verified",
    `${KILL_SOURCE} Galil, FAMAS, AK-47, M4A4, M4A1-S, SG 553, AUG, SSG 08, SCAR-20, G3SG1, Negev, M249.`,
  ),
  awp: rule("kill.awp", 100, "verified", KILL_SOURCE),
  grenade: rule(
    "kill.grenade",
    300,
    "verified",
    `${KILL_SOURCE} HE, flash, smoke, Molotov, incendiary, and decoy are all 300 in weapons.vdata.`,
  ),
  zeus: rule("kill.zeus", 100, "verified", KILL_SOURCE),
};

const PRICE_SOURCE =
  "weapons.vdata m_nPrice at GameTracking-CS2 04d3e4a (2026-10-22). M4A4 moved $3100 → $3000 on 2024-05-23 and to $2900 in the 2025-01-28 Premier update. FAMAS is $1950. Incendiary is $500.";

/** Prices the coaching thresholds are built from. Verified as a table. */
export const PRICES = {
  glock: 200,
  p250: 300,
  cz75: 500,
  deagle: 700,
  mac10: 1050,
  mp9: 1250,
  galil: 1800,
  famas: 1950,
  ak47: 2700,
  m4a4: 2900,
  m4a1s: 2900,
  awp: 4750,
  kevlar: 650,
  helmet: 1000,
  kit: 400,
  flash: 200,
  smoke: 300,
  he: 300,
  molotov: 400,
  incendiary: 500,
} as const;

export const WEAPON_PRICES_VERIFIED = rule(
  "weaponPrices",
  true,
  "verified",
  PRICE_SOURCE,
);

/**
 * Coaching bundles. The prices inside them are verified; choosing the
 * bundle as "full" or "force" is policy.
 */
export const POLICY = {
  pistolSpendLow: rule("policy.pistol_spend_low", PRICES.p250 + PRICES.flash + PRICES.smoke, "policy", "Poor pistol path spends a P250, a flash, and a smoke ($800)."),
  pistolSpendHigh: rule("policy.pistol_spend_high", PRICES.p250, "policy", "Rich pistol path spends a P250 ($300) and banks the rest."),
  tFullSpendLow: rule(
    "policy.t_full_spend_low",
    PRICES.ak47 + PRICES.helmet + PRICES.molotov + PRICES.smoke + PRICES.flash * 2,
    "policy",
    "Poor T full buy: AK, helmet, Molotov, smoke, two flashes.",
  ),
  tFullSpendHigh: rule("policy.t_full_spend_high", PRICES.ak47 + PRICES.helmet, "policy", "Rich T full buy: AK and helmet only."),
  ctFullSpendLow: rule(
    "policy.ct_full_spend_low",
    PRICES.m4a4 + PRICES.helmet + PRICES.incendiary + PRICES.smoke + PRICES.flash * 2 + PRICES.kit,
    "policy",
    "Poor CT full buy: M4A4, helmet, incendiary, smoke, two flashes, kit.",
  ),
  ctFullSpendHigh: rule("policy.ct_full_spend_high", PRICES.m4a4 + PRICES.helmet, "policy", "Rich CT full buy: M4A4 and helmet only."),
  tForceSpendLow: rule("policy.t_force_spend_low", PRICES.galil + PRICES.helmet, "policy", "Poor T force: Galil and helmet."),
  tForceSpendHigh: rule("policy.t_force_spend_high", PRICES.deagle + PRICES.kevlar, "policy", "Rich T force: Deagle and Kevlar."),
  ctForceSpendLow: rule("policy.ct_force_spend_low", PRICES.famas + PRICES.helmet, "policy", "Poor CT force: FAMAS and helmet."),
  ctForceSpendHigh: rule("policy.ct_force_spend_high", PRICES.mp9 + PRICES.kevlar, "policy", "Rich CT force: MP9 and Kevlar."),
  ecoSpendLow: rule("policy.eco_spend_low", PRICES.p250, "policy", "Poor eco still buys a P250."),
  ecoSpendHigh: rule("policy.eco_spend_high", 0, "policy", "Rich eco spends nothing."),
  tFullCash: rule("policy.t_full_cash", PRICES.ak47 + PRICES.helmet, "policy", "T can full-buy at AK + helmet ($3700)."),
  ctFullCash: rule("policy.ct_full_cash", PRICES.m4a4 + PRICES.helmet, "policy", "CT can full-buy at M4A4 + helmet ($3900)."),
  tForceCash: rule("policy.t_force_cash", PRICES.mac10 + PRICES.kevlar, "policy", "T can force at MAC-10 + Kevlar ($1700)."),
  ctForceCash: rule("policy.ct_force_cash", PRICES.mp9 + PRICES.kevlar, "policy", "CT can force at MP9 + Kevlar ($1900)."),
  tFullUtility: rule(
    "policy.t_full_utility",
    PRICES.ak47 + PRICES.helmet + PRICES.molotov + PRICES.smoke + PRICES.flash,
    "policy",
    "Cash below this, while already holding a primary, stays on the save.",
  ),
  ctFullUtility: rule(
    "policy.ct_full_utility",
    PRICES.m4a4 + PRICES.helmet + PRICES.incendiary + PRICES.smoke + PRICES.flash + PRICES.kit,
    "policy",
    "Cash below this, while already holding a primary, stays on the save.",
  ),
  unknownKillReward: rule(
    "policy.unknown_kill_reward",
    600,
    "policy",
    "When kills are missing, the rich path adds one SMG kill ($600, a verified award) per player. The poor path adds $0. Pass kills or killRewardTotal to remove it.",
  ),
  savePrimaryRatio: rule("policy.save_primary_ratio", 0.6, "policy", "60% of the listed roster already holding a primary is a save."),
  bandTight: rule("policy.band_tight", 1500, "policy", "Per-player average gap at or below this is high confidence."),
  bandMedium: rule("policy.band_medium", 3500, "policy", "Per-player average gap at or below this is medium confidence."),
  otFullCash: rule("policy.ot_full_cash", 8000, "policy", "Input cash at or above this on an overtime reset is treated as the $10000 full buy."),
} as const;

export const RULE_CATALOG: readonly Rule<number | boolean | string>[] = [
  TEAM_SIZE,
  START_MONEY,
  MAX_MONEY,
  AFTER_ROUND_MONEY,
  OVERTIME_START_MONEY,
  LOSS_BONUS_BASE,
  LOSS_BONUS_STEP,
  LOSS_PAYOUT_CAP,
  LOSS_COUNT_STORAGE_CAPPED,
  HALF_START_LOSS_COUNT,
  WIN_ELIMINATION,
  WIN_TIME,
  WIN_BOMB_EXPLODE,
  WIN_BOMB_DEFUSE,
  CONSECUTIVE_WIN_BONUS,
  PLANT_PLAYER_AWARD,
  DEFUSE_PLAYER_AWARD,
  PLANT_TEAM_AWARD,
  PLANT_AWARD_TIMING,
  CT_KILL_TEAM_AWARD,
  T_KILL_TEAM_AWARD,
  TEAMKILL_PENALTY,
  CASH_FLOOR,
  REGULATION_ROUNDS_PER_HALF,
  REGULATION_WIN_TARGET,
  REGULATION_ROUNDS,
  OVERTIME_ROUNDS_PER_HALF,
  OVERTIME_WINS_TO_CLOSE,
  OVERTIME_LIMIT_PREMIER,
  OVERTIME_LIMIT_MAJOR,
  OVERTIME_LOSS_COUNT_RESET,
  TIMEOUT_ZERO_LINE,
  NO_EQUIPMENT_SAVE_THRESHOLD,
  TIMEOUT_SURVIVOR_FORFEIT_IS_FACT,
  SHORTHANDED_BONUS,
  WEAPON_PRICES_VERIFIED,
  ...Object.values(KILL_REWARDS),
  ...Object.values(POLICY),
];

export function rulesByVerification(
  verification: Verification,
): Rule<number | boolean | string>[] {
  return RULE_CATALOG.filter((entry) => entry.verification === verification);
}
