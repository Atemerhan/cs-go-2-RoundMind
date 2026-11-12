import type { BuyClass } from "@roundmind/engine";
import { formatPolicyScore } from "./format-score";
import { buyLabel, type Lang } from "./i18n";
import { scoresCopy } from "./scores-i18n";

const ORDER: readonly BuyClass[] = ["full", "force", "eco", "save"];

export interface ScoredBuy {
  buy: BuyClass;
  expectedValue: number;
}

/**
 * Every buy class passed in, with the policy score from `evaluateBuyOptions`.
 * `recommended` is the class the freeze call selected. Null when that call
 * has no buy (match over, draw, or an empty roster).
 */
export function BuyOptionScores(props: {
  lang: Lang;
  options: readonly ScoredBuy[];
  recommended: BuyClass | null;
}) {
  const text = scoresCopy(props.lang);
  const ranked = [...props.options].sort((a, b) => ORDER.indexOf(a.buy) - ORDER.indexOf(b.buy));
  if (ranked.length === 0) return null;

  const bestValue = Math.max(...ranked.map((row) => row.expectedValue));
  const floor = Math.min(0, ...ranked.map((row) => row.expectedValue));
  const span = Math.max(bestValue, 0) - floor || 1;

  return (
    <div className="scores-block">
      <h3>{text.title}</h3>
      <ul className="buy-scores" data-testid="buy-scores">
        {ranked.map((row) => {
          const best = props.recommended !== null && row.buy === props.recommended;
          const gap = bestValue - row.expectedValue;
          const width = ((row.expectedValue - floor) / span) * 100;
          let tag = "";
          if (props.recommended !== null) {
            if (best) tag = text.best;
            else if (gap <= 1e-9) tag = text.tied;
            else tag = text.behind(formatPolicyScore(gap));
          }
          return (
            <li key={row.buy} data-testid={`buy-score-${row.buy}`} data-buy={row.buy} data-best={best ? "true" : "false"}>
              <span className="score-name">{buyLabel(props.lang, row.buy)}</span>
              <span className="score-track" aria-hidden="true">
                <i style={{ width: `${Math.max(0, Math.min(100, width))}%` }} />
              </span>
              <span className="score-num">{formatPolicyScore(row.expectedValue)}</span>
              <span className="score-gap">{tag}</span>
            </li>
          );
        })}
      </ul>
      <p className="foot">{text.note}</p>
    </div>
  );
}
