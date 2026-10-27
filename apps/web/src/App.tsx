import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_MONEY,
  PRICES,
  ecoSnapshot,
  evaluateFreeze,
  forceBuyCash,
  forceSnapshot,
  fullBuyCash,
  fullSnapshot,
  overtimeSnapshot,
  pistolSnapshot,
  saveSnapshot,
  type BuyClass,
  type CompletedRound,
  type FreezeSnapshot,
  type RoundEndReason,
  type Side,
} from "@roundmind/engine";
import {
  buyLabel,
  copy,
  enemyRead,
  extrasLine,
  isUnverifiedWarning,
  money,
  phaseLabel,
  reasonLabel,
  reasonText,
  roundPhase,
  scoreLine,
  sideLabel,
  warningText,
  type Lang,
} from "./i18n";
import { GSI_POLL_MS, fetchLiveBody, gameStateToFreeze, samePoll, type Poll } from "./gsi";
import {
  affordance,
  applyAlive,
  applyKillReward,
  applyReason,
  applyWinner,
  blankPlayers,
  draftToRound,
  emptyDraft,
  type Draft,
  type EditorPlayer,
} from "./manual";

function fromSnapshot(snapshot: FreezeSnapshot) {
  return {
    side: snapshot.ourSide,
    players: snapshot.ourPlayers.map((player, index) => ({
      id: player.id ?? String(index + 1),
      cash: player.cash,
      hasPrimary: player.hasPrimary,
    })),
    history: snapshot.history,
    overtimeLimit: snapshot.overtimeLimit ?? (1 as const),
  };
}

export function App() {
  const [lang, setLang] = useState<Lang>("zh");
  const [mode, setMode] = useState<"manual" | "live">("manual");
  const [poll, setPoll] = useState<Poll>({ state: "idle" });
  const [side, setSide] = useState<Side>("T");
  const [players, setPlayers] = useState<EditorPlayer[]>(blankPlayers());
  const [history, setHistory] = useState<CompletedRound[]>([]);
  const [overtimeLimit, setOvertimeLimit] = useState<0 | 1>(1);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [preset, setPreset] = useState("");
  const [openRound, setOpenRound] = useState<number | null>(null);
  const text = copy(lang);
  const manualRef = useRef<HTMLDetailsElement>(null);
  const historyRef = useRef<HTMLOListElement>(null);
  const wasLive = useRef(false);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = text.docTitle;
  }, [lang, text.docTitle]);

  useEffect(() => {
    if (mode !== "live") return;
    const controller = new AbortController();
    let stopped = false;
    let timer = 0;
    const loop = async () => {
      const next = await fetchLiveBody(controller.signal);
      if (stopped) return;
      setPoll((prev) => (samePoll(prev, next) ? prev : next));
      timer = window.setTimeout(() => {
        void loop();
      }, GSI_POLL_MS);
    };
    setPoll({ state: "connecting" });
    void loop();
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      setPoll({ state: "idle" });
    };
  }, [mode]);

  const parsed = useMemo(() => {
    if (mode !== "live" || poll.state !== "payload") return null;
    return gameStateToFreeze(poll.body, { fallbackSide: side, overtimeLimit });
  }, [mode, overtimeLimit, poll, side]);

  const liveSnapshot = parsed?.ok ? parsed.snapshot : null;

  useEffect(() => {
    const now = Boolean(liveSnapshot);
    if (wasLive.current !== now && manualRef.current) manualRef.current.open = !now;
    wasLive.current = now;
  }, [liveSnapshot]);

  const advice = useMemo(() => {
    if (liveSnapshot) return evaluateFreeze(liveSnapshot);
    return evaluateFreeze({
      roundNumber: history.length + 1,
      ourSide: side,
      ourPlayers: players,
      history,
      overtimeLimit,
    });
  }, [history, liveSnapshot, overtimeLimit, players, side]);

  const activeSide = liveSnapshot?.ourSide ?? side;
  const activePlayers = liveSnapshot?.ourPlayers ?? players;

  function selectMode(next: "manual" | "live") {
    setMode(next);
    if (next === "live") setPreset("");
  }

  function applyPreset(name: string, snapshot: FreezeSnapshot) {
    const next = fromSnapshot(snapshot);
    setMode("manual");
    setPreset(name);
    setSide(next.side);
    setPlayers(next.players);
    setHistory(next.history);
    setOvertimeLimit(next.overtimeLimit);
    setOpenRound(null);
  }

  function touchManual() {
    setPreset("");
  }

  function addRound() {
    setHistory((current) => [...current, draftToRound(draft)]);
    setDraft((current) => ({ ...current, aliveT: "", aliveCT: "", killT: "", killCT: "" }));
    setPreset("");
    requestAnimationFrame(() => {
      const list = historyRef.current;
      if (list) list.scrollTop = list.scrollHeight;
    });
  }

  function patchRound(index: number, update: (round: CompletedRound) => CompletedRound) {
    setHistory((current) => current.map((round, item) => (item === index ? update(round) : round)));
    setPreset("");
  }

  function removeRound(index: number) {
    setHistory((current) => current.filter((_, item) => item !== index));
    setOpenRound((current) => {
      if (current === null) return null;
      if (current === index) return null;
      return current > index ? current - 1 : current;
    });
    setPreset("");
  }

  const status = liveStatus(lang, mode, poll, parsed);

  return (
    <div className="app" lang={lang === "zh" ? "zh-CN" : "en"}>
      <a className="skip" href="#recommendation">{text.skip}</a>
      <header>
        <div>
          <p className="mark">RoundMind</p>
          <h1>{text.title}</h1>
          <p className="sub">{text.subtitle}</p>
        </div>
        <div className="lang" role="group" aria-label={text.language}>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
        </div>
      </header>

      <div className="layout">
        <Recommendation lang={lang} advice={advice} live={Boolean(liveSnapshot)} />

        <section className="panel work" aria-labelledby="freeze-title">
          <div className="source">
            <h2 id="freeze-title">{text.thisFreeze}</h2>
            <div className="segment" role="group" aria-label={text.source}>
              <button type="button" aria-pressed={mode === "manual"} onClick={() => selectMode("manual")}>{text.manual}</button>
              <button type="button" aria-pressed={mode === "live"} onClick={() => selectMode("live")}>{text.live}</button>
            </div>
            <p className="local">{text.localOnly}</p>
            {status && <p className="status" data-testid="gsi-status" role="status">{status}</p>}
            {parsed?.ok && parsed.usedFallbackSide && <p className="status">{text.statusFallbackSide}</p>}
          </div>

          <div className="presets" role="group" aria-label={text.presets}>
            <Preset name="pistol" current={preset} label={text.pistol} onClick={() => applyPreset("pistol", pistolSnapshot(side))} />
            <Preset name="eco" current={preset} label={text.eco} testId="preset-eco" onClick={() => applyPreset("eco", ecoSnapshot())} />
            <Preset name="force" current={preset} label={text.force} onClick={() => applyPreset("force", forceSnapshot())} />
            <Preset name="full" current={preset} label={text.full} onClick={() => applyPreset("full", fullSnapshot())} />
            <Preset name="save" current={preset} label={text.save} onClick={() => applyPreset("save", saveSnapshot())} />
            <Preset name="ot" current={preset} label={text.overtime} onClick={() => applyPreset("ot", overtimeSnapshot())} />
          </div>

          {liveSnapshot && (
            <LiveReadout lang={lang} snapshot={liveSnapshot} side={activeSide} players={activePlayers} />
          )}

          <details className="manual" ref={manualRef} open>
            <summary>{liveSnapshot ? text.fallbackSummary : text.manualSummary}</summary>
            <div className="manual-body">
              <div className="row" role="group" aria-label={text.side}>
                {(["T", "CT"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="side"
                    aria-pressed={side === item}
                    onClick={() => {
                      setSide(item);
                      touchManual();
                    }}
                  >
                    {sideLabel(lang, item)}
                  </button>
                ))}
              </div>

              <h3>{text.ourCash}</h3>
              {!liveSnapshot && <BuyingPower lang={lang} side={activeSide} players={activePlayers} />}
              <ul className="roster">
                {players.map((player, index) => (
                  <PlayerRow
                    key={player.id}
                    lang={lang}
                    index={index}
                    player={player}
                    side={side}
                    onCash={(cash) => {
                      setPlayers((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, cash } : item)));
                      touchManual();
                    }}
                    onPrimary={(hasPrimary) => {
                      setPlayers((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, hasPrimary } : item)));
                      touchManual();
                    }}
                  />
                ))}
              </ul>

              <h3>{text.historyTitle(history.length)}</h3>
              <RoundComposer lang={lang} draft={draft} onDraft={setDraft} onAdd={addRound} />
              {history.length === 0 ? <p className="empty">{text.historyEmpty}</p> : null}
              <ol className="history" ref={historyRef} aria-label={text.historyTitle(history.length)}>
                {history.map((round, index) => (
                  <HistoryRow
                    key={index}
                    lang={lang}
                    index={index}
                    round={round}
                    open={openRound === index}
                    onToggle={() => setOpenRound((current) => (current === index ? null : index))}
                    onWinner={(winner) => patchRound(index, (item) => applyWinner(item, winner))}
                    onReason={(reason) => patchRound(index, (item) => applyReason(item, reason))}
                    onAlive={(which, raw) => patchRound(index, (item) => applyAlive(item, which, raw))}
                    onKill={(which, raw) => patchRound(index, (item) => applyKillReward(item, which, raw))}
                    onRemove={() => removeRound(index)}
                  />
                ))}
              </ol>
              {history.length > 0 && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setHistory([]);
                    setOpenRound(null);
                    touchManual();
                  }}
                >
                  {text.clearHistory}
                </button>
              )}
            </div>
          </details>
        </section>
      </div>

      <footer className="compliance">{text.compliance}</footer>
    </div>
  );
}

function liveStatus(lang: Lang, mode: "manual" | "live", poll: Poll, parsed: ReturnType<typeof gameStateToFreeze> | null): string | null {
  if (mode !== "live") return null;
  const text = copy(lang);
  if (poll.state === "connecting" || poll.state === "idle") return text.statusConnecting;
  if (poll.state === "down") return text.statusDown;
  if (!parsed || !parsed.ok) {
    if (parsed?.reason === "waiting") return text.statusWaiting;
    if (parsed?.reason === "needs-side") return text.statusNeedsSide;
    return text.statusInvalid;
  }
  return text.statusReady(parsed.snapshot.roundNumber, phaseLabel(lang, parsed.phase), sideLabel(lang, parsed.snapshot.ourSide));
}

function Recommendation(props: { lang: Lang; advice: ReturnType<typeof evaluateFreeze>; live: boolean }) {
  const text = copy(props.lang);
  const { advice } = props;
  const scale = Math.max(MAX_MONEY.value, 1);
  const low = advice.enemy.band.averageLow;
  const high = Math.max(advice.enemy.band.averageHigh, low);
  const left = Math.min(100, (low / scale) * 100);
  const width = Math.max(1.5, Math.min(100 - left, ((high - low) / scale) * 100));
  const tick = Math.min(98, (fullBuyCash(advice.enemy.side) / scale) * 100);
  const bandText = `${money(low)}–${money(high)}`;

  return (
    <section className="panel hero" id="recommendation" aria-labelledby="recommendation-title" data-source={props.live ? "live" : "manual"}>
      <h2 id="recommendation-title" className="sr-only">{text.recommendation}</h2>
      <p className="kicker">{roundPhase(props.lang, advice)} · {scoreLine(props.lang, advice.score)}</p>
      <p className="source-chip" data-testid="call-source">{props.live ? text.callFromLive : text.callFromManual}</p>
      <div aria-live="polite" aria-atomic="true">
        <p className="call" data-testid="recommendation" data-buy={advice.buy ?? "none"}>{buyLabel(props.lang, advice.buy)}</p>
        <p className="sentence">{reasonText(props.lang, advice)}</p>
      </div>
      <div className="enemy">
        <p className="eyebrow">{text.enemyEconomy}</p>
        <p className="band-figure" data-testid="enemy-band">{bandText}</p>
        <p className="band-note">{text.perPlayer} · {enemyRead(props.lang, advice)}</p>
        <p className="band-note">{text.teamRange} {money(advice.enemy.band.minTeam)}–{money(advice.enemy.band.maxTeam)}</p>
        <div className="band" aria-hidden="true">
          <i className="band-range" style={{ left: `${left}%`, width: `${width}%` }} />
          <i className="band-tick" style={{ left: `${tick}%` }} />
        </div>
        <div className="axis" aria-hidden="true"><span>{text.axisLow}</span><span>{money(MAX_MONEY.value)}</span></div>
      </div>
      <dl className="stats">
        <div><dt>{text.ourAverage}</dt><dd>{money(advice.our.averageCash)}</dd></div>
        <div><dt>{text.lossBonus}</dt><dd>{money(advice.our.lossBonusIfLose)}</dd></div>
        <div><dt>{text.ourLosses}</dt><dd>{advice.our.lossCount}</dd></div>
        <div><dt>{text.enemyLosses}</dt><dd>{advice.enemy.lossCount}</dd></div>
      </dl>
      {advice.warnings.length > 0 && (
        <ul className="warn" data-testid="warnings">
          {advice.warnings.map((code) => (
            <li key={code} data-unverified={isUnverifiedWarning(code) ? "true" : "false"}>
              {isUnverifiedWarning(code) && <span className="tag">{text.unverified}</span>}
              {warningText(props.lang, code)}
            </li>
          ))}
        </ul>
      )}
      <p className="foot">{text.disclaimer}</p>
    </section>
  );
}

function BuyingPower(props: { lang: Lang; side: Side; players: readonly { cash: number; hasPrimary: boolean }[] }) {
  const text = copy(props.lang);
  const fullLine = fullBuyCash(props.side);
  const forceLine = forceBuyCash(props.side);
  const total = props.players.reduce((sum, player) => sum + player.cash, 0);
  const count = props.players.length;
  const canFull = props.players.filter((player) => player.cash >= fullLine).length;
  const canForce = props.players.filter((player) => player.cash >= forceLine).length;
  const holding = props.players.filter((player) => player.hasPrimary).length;
  return (
    <div className="power" data-testid="buying-power">
      <dl>
        <div><dt>{text.teamCash}</dt><dd>{money(total)}</dd></div>
        <div><dt>{text.atFull}</dt><dd>{canFull}/{count}</dd></div>
        <div><dt>{text.atForce}</dt><dd>{canForce}/{count}</dd></div>
        <div><dt>{text.holding}</dt><dd>{holding}/{count}</dd></div>
      </dl>
      <p className="lines">{text.fullLine} {money(fullLine)} · {text.forceLine} {money(forceLine)}</p>
      <p className="prices">
        <span>AK {money(PRICES.ak47)}</span>
        <span>M4 {money(PRICES.m4a4)}</span>
        <span>{text.helmet} {money(PRICES.helmet)}</span>
        <span>{text.kit} {money(PRICES.kit)}</span>
      </p>
    </div>
  );
}

function LiveReadout(props: {
  lang: Lang;
  snapshot: FreezeSnapshot;
  side: Side;
  players: readonly { cash: number; hasPrimary: boolean }[];
}) {
  const text = copy(props.lang);
  return (
    <div className="live-card">
      <p className="eyebrow">{text.liveRoster(props.players.length)}</p>
      <BuyingPower lang={props.lang} side={props.side} players={props.players} />
      {props.players.length < 5 && <p className="empty">{text.reportedShort}</p>}
      <ul className="roster live-roster">
        {props.players.map((player, index) => {
          const level = affordance(player.cash, props.side);
          return (
            <li key={`${index}-${player.cash}`}>
              <span>{text.player(index + 1)}</span>
              <span className="cash-read">{money(player.cash)}</span>
              <span>{player.hasPrimary ? text.primaryYes : text.primaryNo}</span>
              <span className="affordance" data-level={level}>{affordanceText(props.lang, level)}</span>
            </li>
          );
        })}
      </ul>
      <h3>{text.liveHistory}</h3>
      {props.snapshot.history.length === 0 ? <p className="empty">{text.historyEmpty}</p> : null}
      <ol className="history">
        {props.snapshot.history.map((round, index) => {
          const extra = extrasLine(props.lang, round);
          return (
            <li key={`${index}-${round.winner}-${round.reason}`}>
              <span>{text.roundN(index + 1)} · {sideLabel(props.lang, round.winner)} · {reasonLabel(props.lang, round.reason)}{extra ? ` · ${extra}` : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PlayerRow(props: {
  lang: Lang;
  index: number;
  player: EditorPlayer;
  side: Side;
  onCash: (cash: number) => void;
  onPrimary: (hasPrimary: boolean) => void;
}) {
  const text = copy(props.lang);
  const n = props.index + 1;
  const level = affordance(props.player.cash, props.side);
  const inputId = `player-cash-${n}`;
  return (
    <li className="player">
      <label htmlFor={inputId}>
        <span>{text.player(n)}</span>
        <span className="affordance" data-level={level}>{affordanceText(props.lang, level)}</span>
      </label>
      <input
        id={inputId}
        aria-label={text.playerCash(n)}
        type="number"
        inputMode="numeric"
        min={0}
        max={16000}
        autoComplete="off"
        value={props.player.cash}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          props.onCash(Number.isFinite(parsed) ? parsed : 0);
        }}
      />
      <div className="primary" role="group" aria-label={`${text.player(n)} ${text.primary}`}>
        <span>{text.primary}</span>
        <div className="yn">
          <button type="button" aria-pressed={!props.player.hasPrimary} aria-label={text.primaryNoName(n)} onClick={() => props.onPrimary(false)}>
            {text.primaryNo}
          </button>
          <button type="button" aria-pressed={props.player.hasPrimary} aria-label={text.primaryYesName(n)} onClick={() => props.onPrimary(true)}>
            {text.primaryYes}
          </button>
        </div>
      </div>
    </li>
  );
}

function RoundComposer(props: { lang: Lang; draft: Draft; onDraft: (draft: Draft) => void; onAdd: () => void }) {
  const text = copy(props.lang);
  return (
    <div className="composer">
      <div className="segment" role="group" aria-label={text.winner}>
        {(["T", "CT"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={props.draft.winner === item}
            aria-label={text.newWinnerName(sideLabel(props.lang, item))}
            onClick={() => props.onDraft({ ...props.draft, winner: item })}
          >
            {sideLabel(props.lang, item)}
          </button>
        ))}
      </div>
      <label className="field">
        <span>{text.endReason}</span>
        <select aria-label={text.newReason} value={props.draft.reason} onChange={(event) => props.onDraft({ ...props.draft, reason: event.target.value as RoundEndReason })}>
          <ReasonOptions lang={props.lang} />
        </select>
      </label>
      <details className="optional">
        <summary>{text.optional}</summary>
        <div className="optional-grid">
          <OptionalNumber lang={props.lang} label={text.aliveT} value={props.draft.aliveT} onChange={(aliveT) => props.onDraft({ ...props.draft, aliveT })} />
          <OptionalNumber lang={props.lang} label={text.aliveCT} value={props.draft.aliveCT} onChange={(aliveCT) => props.onDraft({ ...props.draft, aliveCT })} />
          <OptionalNumber lang={props.lang} label={text.killT} value={props.draft.killT} onChange={(killT) => props.onDraft({ ...props.draft, killT })} />
          <OptionalNumber lang={props.lang} label={text.killCT} value={props.draft.killCT} onChange={(killCT) => props.onDraft({ ...props.draft, killCT })} />
        </div>
      </details>
      <button type="button" className="add" onClick={props.onAdd}>{text.addRound}</button>
    </div>
  );
}

function HistoryRow(props: {
  lang: Lang;
  index: number;
  round: CompletedRound;
  open: boolean;
  onToggle: () => void;
  onWinner: (winner: Side) => void;
  onReason: (reason: RoundEndReason) => void;
  onAlive: (side: Side, raw: string) => void;
  onKill: (side: Side, raw: string) => void;
  onRemove: () => void;
}) {
  const text = copy(props.lang);
  const n = props.index + 1;
  const extra = extrasLine(props.lang, props.round);
  return (
    <li className="round">
      <div className="round-main">
        <span className="round-index">{text.roundN(n)}</span>
        <div className="segment" role="group" aria-label={`${text.roundN(n)} ${text.winner}`}>
          {(["T", "CT"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={props.round.winner === item}
              aria-label={text.winnerName(n, sideLabel(props.lang, item))}
              onClick={() => props.onWinner(item)}
            >
              {sideLabel(props.lang, item)}
            </button>
          ))}
        </div>
        <label className="field grow">
          <select aria-label={text.reasonName(n)} value={props.round.reason} onChange={(event) => props.onReason(event.target.value as RoundEndReason)}>
            <ReasonOptions lang={props.lang} />
          </select>
        </label>
        <button type="button" className="ghost" aria-expanded={props.open} aria-label={text.detailsRound(n)} onClick={props.onToggle}>
          {text.details}
        </button>
        <button type="button" className="ghost" aria-label={text.removeRound(n)} onClick={props.onRemove}>
          {text.remove}
        </button>
      </div>
      {extra && <p className="extras">{extra}</p>}
      {props.open && (
        <div className="optional-grid">
          <OptionalNumber lang={props.lang} label={`${text.roundN(n)} ${text.aliveT}`} value={props.round.alive?.T ?? ""} onChange={(raw) => props.onAlive("T", raw)} />
          <OptionalNumber lang={props.lang} label={`${text.roundN(n)} ${text.aliveCT}`} value={props.round.alive?.CT ?? ""} onChange={(raw) => props.onAlive("CT", raw)} />
          <OptionalNumber lang={props.lang} label={`${text.roundN(n)} ${text.killT}`} value={props.round.killRewardTotal?.T ?? ""} onChange={(raw) => props.onKill("T", raw)} />
          <OptionalNumber lang={props.lang} label={`${text.roundN(n)} ${text.killCT}`} value={props.round.killRewardTotal?.CT ?? ""} onChange={(raw) => props.onKill("CT", raw)} />
        </div>
      )}
    </li>
  );
}

function OptionalNumber(props: { lang: Lang; label: string; value: string | number; onChange: (raw: string) => void }) {
  const id = `opt-${props.label.replace(/\s+/g, "-")}`;
  return (
    <label className="field" htmlFor={id}>
      <span>{props.label}</span>
      <input id={id} aria-label={props.label} type="number" inputMode="numeric" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function ReasonOptions(props: { lang: Lang }) {
  return (
    <>
      {(["elimination", "bomb_explode", "bomb_defuse", "time"] as const).map((reason) => (
        <option key={reason} value={reason}>{reasonLabel(props.lang, reason)}</option>
      ))}
    </>
  );
}

function Preset(props: { name: string; current: string; label: string; onClick: () => void; testId?: string }) {
  return (
    <button type="button" data-testid={props.testId} aria-pressed={props.current === props.name} onClick={props.onClick}>
      {props.label}
    </button>
  );
}

function affordanceText(lang: Lang, level: ReturnType<typeof affordance>): string {
  const text = copy(lang);
  if (level === "full") return text.affordFull;
  if (level === "force") return text.affordForce;
  return text.affordShort;
}

export type { BuyClass };
