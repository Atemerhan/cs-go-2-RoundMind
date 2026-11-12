/** Policy score in loss-bonus steps. One step is $500. Not a win-rate dollar. */
export function formatPolicyScore(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return "0";
  const negative = rounded < 0;
  const absolute = Math.abs(rounded);
  const body = Number.isInteger(absolute)
    ? String(absolute)
    : absolute.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return negative ? `-${body}` : body;
}
