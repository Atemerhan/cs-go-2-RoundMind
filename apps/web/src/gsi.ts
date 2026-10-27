import type { CompletedRound, FreezeSnapshot, RoundEndReason, Side } from "@roundmind/engine";

/**
 * Read the local listener's `GET /state` body and turn it into `evaluateFreeze` input.
 *
 * PR #4 (`@roundmind/gsi`) serves a normalized GameState at
 * http://127.0.0.1:3000/state. This file does not listen, does not normalize
 * raw Valve payloads, and does not copy that package. Enemy cash is dropped.
 */

/** Documented loopback URL. Shown in the UI. */
export const GSI_STATE_URL = "http://127.0.0.1:3000/state";

/**
 * Same-origin path. Vite proxies it to the loopback listener so the page can
 * read the body. The listener does not send a CORS header.
 */
export const GSI_PROXY_PATH = "/gsi/state";

export const GSI_POLL_MS = 1000;

const PRIMARY_TYPES = new Set([
  "rifle",
  "sniperrifle",
  "submachine gun",
  "smg",
  "shotgun",
  "machine gun",
  "heavy",
]);

/** Used only when the listener omitted `type`. Matches the listener's primary check. */
const PRIMARY_NAMES = new Set([
  "weapon_ak47",
  "weapon_m4a1",
  "weapon_m4a1_silencer",
  "weapon_famas",
  "weapon_galilar",
  "weapon_aug",
  "weapon_sg556",
  "weapon_awp",
  "weapon_ssg08",
  "weapon_g3sg1",
  "weapon_scar20",
  "weapon_mac10",
  "weapon_mp9",
  "weapon_mp7",
  "weapon_mp5sd",
  "weapon_ump45",
  "weapon_p90",
  "weapon_bizon",
  "weapon_nova",
  "weapon_xm1014",
  "weapon_sawedoff",
  "weapon_mag7",
  "weapon_negev",
  "weapon_m249",
]);

const REASONS = new Set<RoundEndReason>(["elimination", "bomb_explode", "bomb_defuse", "time"]);

export type Poll =
  | { state: "idle" | "connecting" | "down" }
  | { state: "payload"; body: unknown };

export type FreezeParse =
  | { ok: true; snapshot: FreezeSnapshot; phase: string; usedFallbackSide: boolean }
  | { ok: false; reason: "waiting" | "invalid" | "needs-side" };

type FetchLike = (input: string, init?: RequestInit) => Promise<{ ok: boolean; text: () => Promise<string> }>;

interface ParseOptions {
  fallbackSide?: Side;
  overtimeLimit?: 0 | 1;
}

export function samePoll(prev: Poll, next: Poll): boolean {
  if (prev.state !== "payload" || next.state !== "payload") return prev.state === next.state;
  return JSON.stringify(prev.body) === JSON.stringify(next.body);
}

export async function fetchLiveBody(signal?: AbortSignal, fetchImpl: FetchLike = fetch): Promise<Poll> {
  const proxied = await tryGet(fetchImpl, GSI_PROXY_PATH, signal);
  if (proxied.hit) return { state: "payload", body: proxied.body };
  const direct = await tryGet(fetchImpl, GSI_STATE_URL, signal);
  if (direct.hit) return { state: "payload", body: direct.body };
  return { state: "down" };
}

export function gameStateToFreeze(body: unknown, options: ParseOptions = {}): FreezeParse {
  if (body === null) return { ok: false, reason: "waiting" };
  if (!isRecord(body)) return { ok: false, reason: "invalid" };

  const match = isRecord(body.match) ? body.match : null;
  const round = isRecord(body.round) ? body.round : null;
  const score = isRecord(body.score) ? body.score : null;
  const roundNumberRaw = match?.round;
  const phase = round?.phase;
  const ct = score?.ct;
  const t = score?.t;
  if (typeof roundNumberRaw !== "number" || !Number.isFinite(roundNumberRaw)) return { ok: false, reason: "invalid" };
  if (typeof phase !== "string" || phase.length === 0) return { ok: false, reason: "invalid" };
  if (typeof ct !== "number" || typeof t !== "number" || !Number.isFinite(ct) || !Number.isFinite(t)) {
    return { ok: false, reason: "invalid" };
  }
  if (!score || !Array.isArray(body.recentRoundOutcomes)) return { ok: false, reason: "invalid" };

  const playerSide = asSide(body.playerSide);
  const fallback = asSide(options.fallbackSide);
  const ourSide = playerSide ?? fallback;
  if (!ourSide) return { ok: false, reason: "needs-side" };

  const overtimeLimit = options.overtimeLimit === 0 ? 0 : 1;
  const snapshot: FreezeSnapshot = {
    roundNumber: roundAboutToBePlayed(roundNumberRaw, phase),
    ourSide,
    overtimeLimit,
    ourPlayers: ourPlayers(body.economies, ourSide),
    history: completedHistory(body.recentRoundOutcomes),
    score: { CT: ct, T: t },
    ...lossCount(score),
  };

  return {
    ok: true,
    snapshot,
    phase,
    usedFallbackSide: playerSide === null,
  };
}

function roundAboutToBePlayed(current: number, phase: string): number {
  if (phase === "over" || phase === "halftime") return Math.max(1, current + 1);
  if (current <= 0) return 1;
  return current;
}

function ourPlayers(economies: unknown, ourSide: Side): FreezeSnapshot["ourPlayers"] {
  const team = isRecord(economies) ? economies[ourSide] : undefined;
  const roster = isRecord(team) && Array.isArray(team.players) ? team.players : [];
  const used = new Set<string>();
  const players: FreezeSnapshot["ourPlayers"] = [];

  roster.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.money !== "number" || !Number.isFinite(entry.money)) return;
    const steamId = typeof entry.steamId === "string" && entry.steamId ? entry.steamId : undefined;
    const name = typeof entry.name === "string" && entry.name ? entry.name : undefined;
    const base = steamId ?? name ?? `player-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    const equipmentValue = typeof entry.equipmentValue === "number" && Number.isFinite(entry.equipmentValue)
      ? entry.equipmentValue
      : undefined;
    players.push({
      id,
      cash: entry.money,
      hasPrimary: hasPrimary(entry.weapons),
      ...(equipmentValue !== undefined ? { equipmentValue } : {}),
    });
  });

  return players;
}

function hasPrimary(weapons: unknown): boolean {
  if (!Array.isArray(weapons)) return false;
  return weapons.some((weapon) => {
    if (!isRecord(weapon) || typeof weapon.name !== "string") return false;
    const type = typeof weapon.type === "string" ? weapon.type.toLowerCase() : "";
    if (type && PRIMARY_TYPES.has(type)) return true;
    return PRIMARY_NAMES.has(weapon.name.toLowerCase());
  });
}

function completedHistory(outcomes: readonly unknown[]): CompletedRound[] {
  const history: CompletedRound[] = [];
  for (const outcome of outcomes) {
    if (!isRecord(outcome)) break;
    const winner = asSide(outcome.winner);
    const reason = asReason(outcome.reason);
    if (!winner || !reason) break;
    const round: CompletedRound = { winner, reason };
    if (outcome.bombPlanted === true) round.bombPlanted = true;
    const alive = aliveCounts(outcome.alive);
    if (alive) round.alive = alive;
    history.push(round);
  }
  return history;
}

function aliveCounts(value: unknown): CompletedRound["alive"] | undefined {
  if (!isRecord(value)) return undefined;
  const alive: NonNullable<CompletedRound["alive"]> = {};
  if (typeof value.CT === "number" && Number.isFinite(value.CT)) alive.CT = value.CT;
  if (typeof value.T === "number" && Number.isFinite(value.T)) alive.T = value.T;
  return alive.CT === undefined && alive.T === undefined ? undefined : alive;
}

function lossCount(score: Record<string, unknown>): { lossCount?: Partial<Record<Side, number>> } {
  const loss: Partial<Record<Side, number>> = {};
  if (typeof score.ctConsecutiveLosses === "number" && Number.isFinite(score.ctConsecutiveLosses)) {
    loss.CT = score.ctConsecutiveLosses;
  }
  if (typeof score.tConsecutiveLosses === "number" && Number.isFinite(score.tConsecutiveLosses)) {
    loss.T = score.tConsecutiveLosses;
  }
  return Object.keys(loss).length > 0 ? { lossCount: loss } : {};
}

function asSide(value: unknown): Side | null {
  return value === "CT" || value === "T" ? value : null;
}

function asReason(value: unknown): RoundEndReason | null {
  return typeof value === "string" && REASONS.has(value as RoundEndReason) ? (value as RoundEndReason) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function tryGet(fetchImpl: FetchLike, url: string, signal?: AbortSignal): Promise<{ hit: true; body: unknown } | { hit: false }> {
  try {
    const response = await fetchImpl(url, { signal, cache: "no-store" });
    if (!response.ok) return { hit: false };
    const text = await response.text();
    return { hit: true, body: JSON.parse(text) as unknown };
  } catch {
    return { hit: false };
  }
}
