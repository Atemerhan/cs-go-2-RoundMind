import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { parseMatchJson, type ParsedMatch } from "@roundmind/post-match";
import { BuyOptionScores } from "../BuyOptionScores";
import { formatPolicyScore } from "../format-score";
import {
  buyLabel,
  copy,
  enemyRead,
  money,
  reasonText,
  roundPhase,
  scoreLine,
  warningText,
  type Lang,
} from "../i18n";
import { LanguageSwitch, ViewNav } from "../view-nav";
import { buildMatchReview, type BuiltReview, type RoundReview } from "./build-review";
import { reviewCopy } from "./review-i18n";
import { sampleDocument } from "./sample";
import "./review.css";

function sampleParsed(): ParsedMatch {
  const document = sampleDocument();
  return { shape: "document", document, rounds: document.rounds };
}

export function ReviewPage() {
  const [lang, setLang] = useState<Lang>("zh");
  const [parsed, setParsed] = useState<ParsedMatch>(sampleParsed);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const text = reviewCopy(lang);
  const review = useMemo(() => buildMatchReview(parsed.rounds), [parsed]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = text.docTitle;
  }, [lang, text.docTitle]);

  async function loadFile(file: File) {
    try {
      const next = parseMatchJson(await file.text());
      setParsed(next);
      setFileName(file.name);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function loadSample() {
    setParsed(sampleParsed());
    setFileName(null);
    setError(null);
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragOver(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  const sampleUrl = `${import.meta.env.BASE_URL}sample-match.json`;

  return (
    <div className="app" lang={lang === "zh" ? "zh-CN" : "en"}>
      <header>
        <div>
          <p className="mark">RoundMind</p>
          <h1>{text.title}</h1>
          <p className="sub">{text.subtitle}</p>
        </div>
        <div className="header-tools">
          <ViewNav lang={lang} current="review" />
          <LanguageSwitch lang={lang} onChange={setLang} />
        </div>
      </header>

      <section className="panel" aria-labelledby="load-title">
        <h2 id="load-title">{text.loadTitle}</h2>
        <div
          className={dragOver ? "drop drop-on" : "drop"}
          data-testid="match-drop"
          onDragEnter={onDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <p className="drop-lead">{text.drop}</p>
          <div className="drop-actions">
            <label className="file-choice">
              {text.choose}
              <input
                type="file"
                accept="application/json,.json"
                aria-label={text.choose}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            <button type="button" className="ghost" onClick={loadSample}>{text.sample}</button>
            <a className="ghost download" href={sampleUrl} download="match.json">{text.download}</a>
          </div>
        </div>
        <p className="local" data-testid="match-source">{fileName ? text.fileNote(fileName) : text.sampleNote}</p>
        {fileName && (parsed.document.label || parsed.document.map) && (
          <p className="local" data-testid="match-label">{[parsed.document.label, parsed.document.map].filter(Boolean).join(" · ")}</p>
        )}
        {error && <p className="match-error" role="alert" data-testid="match-error">{text.readError} {error}</p>}
      </section>

      <MatchSummary lang={lang} review={review} />

      <ol className="review-list">
        {review.rounds.map((round) => (
          <RoundCard key={round.roundNumber} lang={lang} round={round} />
        ))}
      </ol>

      <footer className="compliance">{copy(lang).compliance}</footer>
    </div>
  );
}

function MatchSummary(props: { lang: Lang; review: BuiltReview }) {
  const text = reviewCopy(props.lang);
  const { review } = props;
  return (
    <section className="panel" aria-labelledby="summary-title" data-testid="match-summary">
      <h2 id="summary-title">{text.summary}</h2>
      <dl className="stats">
        <div><dt>{text.rounds}</dt><dd>{review.roundsConsidered}</dd></div>
        <div><dt>{text.aligned}</dt><dd>{review.aligned}</dd></div>
        <div><dt>{text.leaks}</dt><dd>{review.totalLeaks}</dd></div>
        <div><dt>{text.totalCost}</dt><dd>{formatPolicyScore(review.totalEvCost)} {text.stepUnit}</dd></div>
      </dl>
      <h3>{text.highlights}</h3>
      {review.highlights.length === 0 ? <p className="empty">{text.noLeaks}</p> : (
        <ol className="highlights">
          {review.highlights.map((leak) => (
            <li key={leak.roundNumber}>
              <button
                type="button"
                onClick={() => {
                  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
                  document.getElementById(`round-${leak.roundNumber}`)?.scrollIntoView({ behavior, block: "start" });
                }}
              >
                {text.highlight(leak.roundNumber, leak.chosenBuy, leak.betterBuy, leak.evCost)}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RoundCard(props: { lang: Lang; round: RoundReview }) {
  const text = reviewCopy(props.lang);
  const { round } = props;
  const advice = round.economy;
  return (
    <li>
      <article
        id={`round-${round.roundNumber}`}
        className="panel round-card"
        data-testid={`round-${round.roundNumber}`}
        data-matched={round.matched ? "true" : "false"}
        data-buy={round.recommendedBuy ?? "none"}
      >
        <div className="round-head">
          <h2>{text.roundN(round.roundNumber)}</h2>
          <p className={round.winner === "us" ? "result result-us" : "result result-them"}>
            {round.winner === "us" ? text.winnerUs : text.winnerThem}
          </p>
        </div>
        {advice && <p className="kicker">{roundPhase(props.lang, advice)} · {scoreLine(props.lang, advice.score)}</p>}

        {advice ? (
          <div className="economy">
            <p className="eyebrow">{text.economy}</p>
            <dl className="stats">
              <div><dt>{copy(props.lang).ourAverage}</dt><dd>{money(advice.our.averageCash)}</dd></div>
              <div><dt>{copy(props.lang).lossBonus}</dt><dd>{money(advice.our.lossBonusIfLose)}</dd></div>
              <div><dt>{copy(props.lang).enemyEconomy}</dt><dd>{money(advice.enemy.band.averageLow)}–{money(advice.enemy.band.averageHigh)}</dd></div>
              <div><dt>{copy(props.lang).ourLosses}</dt><dd>{advice.our.lossCount}</dd></div>
            </dl>
            <p className="band-note">{enemyRead(props.lang, advice)}</p>
          </div>
        ) : <p className="empty">{text.noEconomy}</p>}

        <div className="decision">
          <div data-role="played" data-matched={round.matched ? "true" : "false"}>
            <p className="eyebrow">{text.played}</p>
            <p className="call compact" data-buy={round.chosenBuy}>{buyLabel(props.lang, round.chosenBuy)}</p>
            <p className="score-num">{round.chosenExpectedValue === null ? "—" : formatPolicyScore(round.chosenExpectedValue)} {text.stepUnit}</p>
          </div>
          <div data-role="recommended">
            <p className="eyebrow">{text.recommended}</p>
            <p className="call compact" data-buy={round.recommendedBuy ?? "none"}>{buyLabel(props.lang, round.recommendedBuy)}</p>
            <p className="score-num">{round.bestExpectedValue === null ? "—" : formatPolicyScore(round.bestExpectedValue)} {text.stepUnit}</p>
          </div>
        </div>

        <BuyOptionScores lang={props.lang} options={round.options} recommended={round.recommendedBuy} />
        <p className="sentence" data-testid={`feedback-${round.roundNumber}`}>{text.feedback(round)}</p>
        {advice && <p className="band-note">{reasonText(props.lang, advice)}</p>}
        <p className="foot">{round.scoreSource === "logged" ? text.loggedScores : text.engineScores}</p>
        {advice && advice.warnings.length > 0 && (
          <ul className="warn">
            {advice.warnings.map((code) => <li key={code}>{warningText(props.lang, code)}</li>)}
          </ul>
        )}
      </article>
    </li>
  );
}
