import { useMemo, useState } from "react";
import {
  PRICES,
  ecoSnapshot,
  evaluateFreeze,
  forceSnapshot,
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
import { buyLabel, enemyRead, money, reasonLabel, reasonText, roundPhase, sideLabel, warningText, type Lang } from "./i18n";

const blank = (cash = 800, hasPrimary = false) =>
  Array.from({ length: 5 }, (_, index) => ({ id: String(index + 1), cash, hasPrimary }));

interface Draft {
  winner: Side;
  reason: RoundEndReason;
  aliveT: string;
  aliveCT: string;
  killT: string;
  killCT: string;
}

const emptyDraft: Draft = {
  winner: "T",
  reason: "elimination",
  aliveT: "",
  aliveCT: "",
  killT: "",
  killCT: "",
};

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
  const [side, setSide] = useState<Side>("T");
  const [players, setPlayers] = useState(blank());
  const [history, setHistory] = useState<CompletedRound[]>([]);
  const [overtimeLimit, setOvertimeLimit] = useState<0 | 1>(1);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [preset, setPreset] = useState<string>("");
  const zh = lang === "zh";

  const advice = useMemo(
    () =>
      evaluateFreeze({
        roundNumber: history.length + 1,
        ourSide: side,
        ourPlayers: players,
        history,
        overtimeLimit,
      }),
    [history, overtimeLimit, players, side],
  );

  function applyPreset(name: string, snapshot: FreezeSnapshot) {
    const next = fromSnapshot(snapshot);
    setPreset(name);
    setSide(next.side);
    setPlayers(next.players);
    setHistory(next.history);
    setOvertimeLimit(next.overtimeLimit);
  }

  function addRound() {
    const round: CompletedRound = { winner: draft.winner, reason: draft.reason };
    if (draft.reason === "bomb_explode" || draft.reason === "bomb_defuse") round.bombPlanted = true;
    const aliveT = draft.aliveT === "" ? undefined : Number(draft.aliveT);
    const aliveCT = draft.aliveCT === "" ? undefined : Number(draft.aliveCT);
    if (aliveT !== undefined || aliveCT !== undefined) {
      round.alive = {};
      if (aliveT !== undefined) round.alive.T = aliveT;
      if (aliveCT !== undefined) round.alive.CT = aliveCT;
    }
    const killT = draft.killT === "" ? undefined : Number(draft.killT);
    const killCT = draft.killCT === "" ? undefined : Number(draft.killCT);
    if (killT !== undefined || killCT !== undefined) {
      round.killRewardTotal = {};
      if (killT !== undefined) round.killRewardTotal.T = killT;
      if (killCT !== undefined) round.killRewardTotal.CT = killCT;
    }
    setHistory((current) => [...current, round]);
    setPreset("");
  }

  const bandWidth = Math.max(advice.enemy.band.maxTeam, 1);
  const bandStart = (advice.enemy.band.minTeam / bandWidth) * 100;

  return (
    <div className="app">
      <header>
        <div>
          <div className="mark">RoundMind</div>
          <h1>{zh ? "冻结时间经济" : "Freeze-time economy"}</h1>
          <p className="sub">
            {zh
              ? "满购、强起、白给、存枪。只根据公开回合和己方现金。"
              : "Full, force, eco, or save. Public rounds and your cash only."}
          </p>
        </div>
        <div className="lang" role="group" aria-label={zh ? "语言" : "Language"}>
          <button type="button" aria-pressed={zh} onClick={() => setLang("zh")}>中文</button>
          <button type="button" aria-pressed={!zh} onClick={() => setLang("en")}>EN</button>
        </div>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>{zh ? "这一冻结" : "This freeze"}</h2>
          <div className="row" role="group" aria-label={zh ? "阵营" : "Side"}>
            {(["T", "CT"] as const).map((item) => (
              <button key={item} type="button" className="side" aria-pressed={side === item} onClick={() => { setSide(item); setPreset(""); }}>
                {sideLabel(lang, item)}
              </button>
            ))}
          </div>

          <div className="presets" style={{ marginTop: 12 }}>
            <Preset name="pistol" current={preset} label={zh ? "手枪局" : "Pistol"} onClick={() => applyPreset("pistol", pistolSnapshot(side))} />
            <Preset name="eco" current={preset} label={zh ? "白给" : "Eco"} testId="preset-eco" onClick={() => applyPreset("eco", ecoSnapshot())} />
            <Preset name="force" current={preset} label={zh ? "强起" : "Force"} onClick={() => applyPreset("force", forceSnapshot())} />
            <Preset name="full" current={preset} label={zh ? "满购" : "Full"} onClick={() => applyPreset("full", fullSnapshot())} />
            <Preset name="save" current={preset} label={zh ? "存枪" : "Save"} onClick={() => applyPreset("save", saveSnapshot())} />
            <Preset name="ot" current={preset} label={zh ? "加时" : "Overtime"} onClick={() => applyPreset("ot", overtimeSnapshot())} />
          </div>

          <h2 style={{ marginTop: 18 }}>{zh ? "己方现金" : "Our cash"}</h2>
          {players.map((player, index) => (
            <div className="player" key={player.id}>
              <span>{zh ? `玩家 ${index + 1}` : `Player ${index + 1}`}</span>
              <input
                aria-label={zh ? `玩家 ${index + 1} 现金` : `Player ${index + 1} cash`}
                type="number"
                min={0}
                max={16000}
                value={player.cash}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  const cash = Number.isFinite(parsed) ? parsed : 0;
                  setPlayers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, cash } : item));
                  setPreset("");
                }}
              />
              <label className="chk">
                <input
                  type="checkbox"
                  checked={player.hasPrimary}
                  onChange={(event) => {
                    const hasPrimary = event.target.checked;
                    setPlayers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, hasPrimary } : item));
                    setPreset("");
                  }}
                />
                {zh ? "有主武器" : "Primary"}
              </label>
            </div>
          ))}

          <h2 style={{ marginTop: 18 }}>{zh ? "已结束的回合" : "Completed rounds"}</h2>
          <div className="draft">
            <select aria-label={zh ? "获胜方" : "Winner"} value={draft.winner} onChange={(event) => setDraft({ ...draft, winner: event.target.value as Side })}>
              <option value="T">T</option>
              <option value="CT">CT</option>
            </select>
            <select aria-label={zh ? "结束方式" : "End reason"} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value as RoundEndReason })}>
              <option value="elimination">{reasonLabel(lang, "elimination")}</option>
              <option value="bomb_explode">{reasonLabel(lang, "bomb_explode")}</option>
              <option value="bomb_defuse">{reasonLabel(lang, "bomb_defuse")}</option>
              <option value="time">{reasonLabel(lang, "time")}</option>
            </select>
            <details className="wide">
              <summary>{zh ? "可选：存活与击杀奖金" : "Optional: alive and kill reward"}</summary>
              <div className="draft" style={{ marginTop: 8 }}>
                <input aria-label={zh ? "匪存活" : "T alive"} placeholder={zh ? "匪存活" : "T alive"} value={draft.aliveT} onChange={(event) => setDraft({ ...draft, aliveT: event.target.value })} />
                <input aria-label={zh ? "警存活" : "CT alive"} placeholder={zh ? "警存活" : "CT alive"} value={draft.aliveCT} onChange={(event) => setDraft({ ...draft, aliveCT: event.target.value })} />
                <input aria-label={zh ? "匪击杀奖金合计" : "T kill reward"} placeholder={zh ? "匪击杀奖金" : "T kill $"} value={draft.killT} onChange={(event) => setDraft({ ...draft, killT: event.target.value })} />
                <input aria-label={zh ? "警击杀奖金合计" : "CT kill reward"} placeholder={zh ? "警击杀奖金" : "CT kill $"} value={draft.killCT} onChange={(event) => setDraft({ ...draft, killCT: event.target.value })} />
              </div>
            </details>
            <button type="button" className="add wide" onClick={addRound}>{zh ? "加入回合" : "Add round"}</button>
          </div>
          <ol className="history">
            {history.slice(history.length > 8 ? history.length - 6 : 0).map((round, offset) => {
              const index = (history.length > 8 ? history.length - 6 : 0) + offset;
              return (
                <li key={`${index}-${round.winner}-${round.reason}`}>
                  <span>{zh ? `回合 ${index + 1}` : `Round ${index + 1}`} · {round.winner} · {reasonLabel(lang, round.reason)}</span>
                  <button type="button" className="ghost" onClick={() => { setHistory((current) => current.filter((_, item) => item !== index)); setPreset(""); }}>
                    {zh ? "删除" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ol>
          {history.length > 8 && <p className="foot">{zh ? `只显示最近 6 回合，共 ${history.length} 回合。` : `Showing the last 6 of ${history.length} rounds.`}</p>}
          {history.length > 0 && (
            <button type="button" className="ghost" onClick={() => { setHistory([]); setPreset(""); }}>{zh ? "清空历史" : "Clear history"}</button>
          )}
        </section>

        <section className="panel result">
          <p className="kicker">{roundPhase(lang, advice)}</p>
          <div className="call" data-testid="recommendation" data-buy={advice.buy ?? "none"}>
            {buyLabel(lang, advice.buy)}
          </div>
          <p className="sentence">{reasonText(lang, advice)}</p>
          <div className="stats">
            <div className="stat">
              <span>{zh ? "己方人均" : "Our average"}</span>
              <strong>{money(advice.our.averageCash)}</strong>
            </div>
            <div className="stat">
              <span>{zh ? "负场奖金" : "Loss bonus"}</span>
              <strong>{money(advice.our.lossBonusIfLose)}</strong>
            </div>
            <div className="stat">
              <span>{zh ? "己方连败计数" : "Our loss count"}</span>
              <strong>{advice.our.lossCount}</strong>
            </div>
            <div className="stat">
              <span>{zh ? "对方连败计数" : "Enemy loss count"}</span>
              <strong>{advice.enemy.lossCount}</strong>
            </div>
          </div>
          <p className="sentence" style={{ marginTop: 14, fontSize: 16 }}>
            {zh ? "对方人均" : "Enemy per player"} {money(advice.enemy.band.averageLow)}–{money(advice.enemy.band.averageHigh)}
            <br />
            {enemyRead(lang, advice)}
          </p>
          <div className="band" aria-hidden="true"><i style={{ width: `${Math.max(8, 100 - bandStart)}%`, marginLeft: `${Math.min(bandStart, 92)}%` }} /></div>
          {advice.warnings.length > 0 && (
            <ul className="warn">
              {advice.warnings.map((code) => <li key={code}>{warningText(lang, code)}</li>)}
            </ul>
          )}
          <p className="foot">
            {zh
              ? "超时 +$0 的对象、深连败的计数是否封顶、加时连败计数会不会归零，都还没核实。建议不会把这些当成事实。"
              : "Who gets the +$0 timeout line, whether a deep loss count is stored capped, and whether overtime resets that count are unverified. The call does not treat them as facts."}
          </p>
          <div className="prices">
            <span>AK {money(PRICES.ak47)}</span>
            <span>M4 {money(PRICES.m4a4)}</span>
            <span>{zh ? "头甲" : "Helmet"} {money(PRICES.helmet)}</span>
            <span>{zh ? "拆弹器" : "Kit"} {money(PRICES.kit)}</span>
          </div>
        </section>
      </div>

      <footer className="compliance">
        {zh
          ? "RoundMind 只做赛前和冻结时间的决策辅助。以后只接官方 Game State Integration。不读内存，不注入，不模拟键鼠，不提供敌人位置或准星。玩家自己下单。"
          : "RoundMind is coaching for the buy phase and review. A later build may read official Game State Integration only. No memory reading, no injection, no input automation, no enemy positions or crosshair help. The player makes every action."}
      </footer>
    </div>
  );
}

function Preset(props: { name: string; current: string; label: string; onClick: () => void; testId?: string }) {
  return (
    <button type="button" data-testid={props.testId} aria-pressed={props.current === props.name} onClick={props.onClick}>
      {props.label}
    </button>
  );
}

export type { BuyClass };
