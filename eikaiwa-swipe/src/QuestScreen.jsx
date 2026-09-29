/*
 * 冒険（ドラクエ風モード）の画面。進行と数値は src/quest.js（純粋関数）、絵はバトルと同じ src/battle-art.jsx。
 * - 準備: 主人公の Lv・能力値・装備（ガチャで集めた単語）を見て、枠ごとに付け替える
 * - 冒険: たたかう／じゅもん（単語の4択に正解すると攻撃）・ぼうぎょ・やくそう。倒したら次の階か、街に帰る
 * - 結果: 経験値・Lv・ガチャのポイント
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Swords, Shield, Sparkles, Heart, Castle, X } from "lucide-react";
import { BattleBackdrop, Monster, Dragon } from "./battle-art.jsx";
import { makeChoices } from "./logic.js";
import {
  SLOTS,
  ELEMENTS,
  SPELL_MP,
  gearOf,
  slotBonus,
  statsOf,
  expToNext,
  createRun,
  act,
  nextFloor,
  retreat,
  startFloors,
  isBossFloor,
  effectText,
} from "./quest.js";

const RARITY_STYLE = {
  N: "bg-slate-200 text-slate-700",
  R: "bg-sky-100 text-sky-700",
  SR: "bg-violet-100 text-violet-700",
  SSR: "bg-gradient-to-r from-amber-300 to-pink-400 text-white",
};
const el = (key) => ELEMENTS[key] || ELEMENTS.none;
const bonusText = (b) =>
  Object.entries(b)
    .map(([k, v]) => `${{ atk: "攻撃", def: "守備", hp: "HP", mp: "MP" }[k]} +${v}`)
    .join("・");

function Bar({ value, max, color, label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <p className="flex justify-between text-[11px] font-bold tabular-nums">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-white/20">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RarityBadge({ rarity }) {
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${RARITY_STYLE[rarity] || RARITY_STYLE.N}`}>{rarity}</span>;
}

/** 装備を選ぶシート（持っている単語を強い順に） */
function GearPicker({ slot, owned, cards, current, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const info = SLOTS.find((s) => s.id === slot);
  const list = useMemo(
    () =>
      Object.entries(owned)
        .filter(([id, n]) => n > 0 && cards[id])
        .map(([id, n]) => gearOf(cards[id], n))
        .sort((a, b) => b.power - a.power || a.english.localeCompare(b.english)),
    [owned, cards]
  );
  const q = query.trim().toLowerCase();
  const shown = list.filter((g) => !q || g.english.toLowerCase().includes(q) || (g.japanese || "").includes(q)).slice(0, 120);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${info.name}をえらぶ`}
        data-testid="gear-picker"
        className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-t-3xl bg-white p-4 shadow-2xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold text-slate-900">
            {info.icon} {info.name}をえらぶ <span className="text-xs font-bold text-slate-400">（{info.stat}が上がる）</span>
          </p>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-1 text-slate-400">
            <X size={20} />
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${list.length}語から検索（英語・日本語）`}
          className="mt-2 w-full rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {current && (
            <li>
              <button type="button" onClick={() => onPick(null)} className="w-full rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-600">
                はずす
              </button>
            </li>
          )}
          {shown.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onPick(g.id)}
                className={`w-full rounded-xl p-2.5 text-left ring-1 ${g.id === current ? "bg-indigo-50 ring-indigo-400" : "bg-white ring-slate-200"}`}
              >
                <span className="flex items-center gap-1.5">
                  <RarityBadge rarity={g.rarity} />
                  <span className="font-bold text-slate-900">{g.english}</span>
                  <span className="text-[10px] font-bold text-slate-400">Lv{g.level}</span>
                  <span className="ml-auto text-xs" title={`${el(g.element).name}属性`}>
                    {el(g.element).icon}
                  </span>
                  <span className="text-xs font-black text-indigo-600 tabular-nums">{bonusText(slotBonus(slot, g.power))}</span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                  {g.japanese} ／ {g.effects.map(effectText).join("・")}
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="p-4 text-center text-xs text-slate-500">まだ単語を持っていません。ガチャで集めると装備にできます。</li>}
        </ul>
      </div>
    </div>
  );
}

/** 準備画面: 主人公と装備 */
function QuestHome({ state, cards, stats, header, onEquip, onAutoEquip, onStart }) {
  const [picking, setPicking] = useState(null);
  const q = state.quest;
  const owned = state.gacha.cards || {};
  const ownedCount = Object.values(owned).filter((n) => n > 0).length;
  // 同じ種類の効果は合計して見せる
  const sums = {};
  for (const e of SLOTS.flatMap((s) => stats.gear[s.id]?.effects || [])) sums[e.key] = (sums[e.key] || 0) + e.value;
  const effects = Object.entries(sums).map(([key, value]) => ({ key, value }));
  return (
    <div className="h-full overflow-y-auto px-5 pt-4 pb-6" data-testid="quest-home">
      {header}
      <div className="mt-4 rounded-3xl bg-slate-900 p-4 text-white shadow-lg ring-2 ring-white/80">
        <p className="flex items-baseline justify-between">
          <span className="text-lg font-black">ぼうけんしゃ</span>
          <span className="text-sm font-black text-amber-300" data-testid="quest-level">
            Lv {q.level}
          </span>
        </p>
        <div className="mt-2">
          <Bar value={q.exp} max={expToNext(q.level)} color="bg-amber-400" label="けいけんち" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs" data-testid="quest-stats">
          {[
            ["HP", stats.hp],
            ["MP", stats.mp],
            ["攻撃", stats.atk],
            ["守備", stats.def],
            ["会心", `${stats.crit}%`],
            ["回避", `${stats.evade}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/10 py-1.5">
              <p className="text-[10px] text-white/60">{k}</p>
              <p className="font-black tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/80">
          攻撃の属性 {el(stats.element).icon}
          {el(stats.element).name}・守りの属性 {el(stats.guard).icon}
          {el(stats.guard).name}
          {stats.setBonus && <span className="ml-1 font-black text-amber-300">属性そろい！攻撃+15%</span>}
        </p>
        {effects.length > 0 && <p className="mt-1 text-[11px] text-emerald-300">{effects.map(effectText).join("・")}</p>}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">そうび（集めた単語）</p>
        <button
          type="button"
          onClick={onAutoEquip}
          disabled={!ownedCount}
          className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 disabled:opacity-40"
        >
          おまかせ装備
        </button>
      </div>
      <ul className="mt-2 space-y-2" data-testid="quest-equip">
        {SLOTS.map((s) => {
          const g = stats.gear[s.id];
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setPicking(s.id)}
                aria-label={`${s.name}を変える`}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200 active:scale-[0.99]"
              >
                <span className="text-2xl">{s.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold text-slate-400">
                    {s.name}（{s.stat}）
                  </span>
                  {g ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <RarityBadge rarity={g.rarity} />
                        <span className="truncate font-bold text-slate-900">{g.english}</span>
                        <span className="text-[10px] font-bold text-slate-400">Lv{g.level}</span>
                        <span className="text-xs">{el(g.element).icon}</span>
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {bonusText(slotBonus(s.id, g.power))}／{g.effects.map(effectText).join("・")}
                      </span>
                    </>
                  ) : (
                    <span className="block text-sm font-bold text-slate-400">なし（タップで装備）</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!ownedCount && (
        <p className="mt-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
          ガチャで単語を集めると、武器や防具として装備できます。レア度が高いほど強く、単語ごとに効果と属性があります。
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        名詞は守り・動詞は攻め・形容詞はからめ手の効果が付きます。SSR は効果が2つ。炎→氷→雷→炎、光⇔闇 の相性で1.5倍。3つの属性をそろえると攻撃+15%。
      </p>

      <p className="mt-5 text-sm font-bold text-slate-800">
        塔にいどむ <span className="text-xs font-bold text-slate-400">（最高 {q.best}階）</span>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {startFloors(q.best).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onStart(f)}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 text-sm font-extrabold text-white shadow active:scale-95"
          >
            <Castle size={16} /> {f}階から
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">5階ごとにボスがいます。ボスを倒すと、次からはその次の階から始められます。</p>

      {picking && (
        <GearPicker
          slot={picking}
          owned={owned}
          cards={cards}
          current={q.equip[picking]}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            onEquip(picking, id);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

/** 起きたことをメッセージにする（ドラクエ風の文） */
function messagesOf(events, enemyName, answerText) {
  return events.map((e) => {
    switch (e.type) {
      case "hit":
        return [
          e.spell ? "じゅもんを となえた！" : "こうげき！",
          e.crit ? "かいしんの いちげき！" : "",
          e.weak ? "こうかは ばつぐんだ！" : e.resist ? "あまり きいていない…" : "",
          `${enemyName}に ${e.dmg}の ダメージ！`,
        ]
          .filter(Boolean)
          .join(" ");
      case "miss":
        return `ミス！ こうげきは はずれた…（正解は「${answerText}」）`;
      case "drain":
        return `HPを ${e.heal} すいとった！`;
      case "defend":
        return "みを まもっている。MPが すこし かいふくした";
      case "herb":
        return `やくそうを つかった！ HPが ${e.heal} かいふくした`;
      case "win":
        return `${enemyName}を たおした！ けいけんち ${e.exp} を かくとく！`;
      case "evade":
        return `${e.breath ? `${enemyName}は ほのおを はいた！` : `${enemyName}の こうげき！`} ひらりと かわした！`;
      case "hurt":
        return `${e.breath ? `${enemyName}は ほのおを はいた！` : `${enemyName}の こうげき！`} ${e.dmg}の ダメージを うけた！${e.guarded ? "（ぼうぎょ）" : ""}${e.resist ? "（ぞくせいで けいげん）" : ""}`;
      case "regen":
        return `HPが ${e.heal} かいふくした`;
      case "lose":
        return "ちからつきた…";
      default:
        return "";
    }
  });
}

/** 冒険中の画面 */
function QuestRun({ stats, pool, speech, sound, dopamine, onEnd, active }) {
  const [run, setRun] = useState(() => createRun(stats, stats.startFloor));
  const [log, setLog] = useState(() => [`${stats.startFloor}階。${run.enemy.name}が あらわれた！`]);
  const [question, setQuestion] = useState(null); // { action, item, choices }
  const [pop, setPop] = useState(null); // ダメージの数字
  const enemyRef = useRef(null);
  const started = useRef(Date.now());
  const ended = useRef(false);
  const boss = run.enemy.boss;

  // BGM はこのタブを見ているあいだだけ（テスト画面は裏でも表示したままにしているため）
  useEffect(() => {
    sound.setBattleMusic(active ? (boss ? "boss" : "battle") : null);
  }, [boss, sound, active]);
  useEffect(() => () => sound.setBattleMusic(null), [sound]);

  const end = (r) => {
    if (ended.current) return;
    ended.current = true;
    sound.setBattleMusic(null);
    onEnd(r, (Date.now() - started.current) / 1000);
  };

  const shake = (node, big) =>
    node?.animate?.(
      [{ transform: "translateX(0)", filter: "brightness(1)" }, { transform: `translateX(${big ? -12 : -6}px)`, filter: "brightness(3)" }, { transform: `translateX(${big ? 10 : 5}px)` }, { transform: "translateX(0)", filter: "brightness(1)" }],
      { duration: big ? 420 : 300 }
    );

  const ask = (action) => {
    if (action === "spell" && run.mp < SPELL_MP) {
      setLog(["MPが たりない！"]);
      return;
    }
    const item = pool[Math.floor(Math.random() * pool.length)];
    setQuestion({ action, item, choices: makeChoices(item, pool, Math.random, 4, "japanese") });
  };

  const doAct = (action, answer = null, item = null) => {
    const next = act(run, stats, action, answer);
    if (next.error) {
      setLog([next.error]);
      return;
    }
    const answerText = item ? item.japanese.split("／")[0] : "";
    setLog(messagesOf(next.events, run.enemy.name, answerText));
    for (const e of next.events) {
      if (e.type === "hit") {
        sound.play(e.crit || e.spell ? "explode" : "slash");
        shake(enemyRef.current, e.crit);
        setPop({ id: Date.now(), text: `${e.dmg}`, crit: e.crit });
      } else if (e.type === "miss") sound.play("wrong");
      else if (e.type === "hurt") sound.play("hurt");
      else if (e.type === "herb" || e.type === "defend") sound.play("correct");
      else if (e.type === "win") sound.play(e.boss ? "bonus" : "complete");
    }
    setQuestion(null);
    setRun(next);
    if (next.over) setTimeout(() => end(next), 1400);
  };

  const answerWith = (choice) => {
    const { action, item } = question;
    const correct = choice.id === item.id;
    dopamine.hit(correct);
    if (correct) sound.play("correct");
    speech.speak(item.english, null, item.id);
    doAct(action, { id: item.id, correct }, item);
  };

  const e = run.enemy;
  return (
    <div className="flex h-full flex-col bg-slate-950 text-white" data-testid="quest-run">
      <div className="relative h-[40%] min-h-[210px] overflow-hidden">
        <BattleBackdrop />
        <p className="absolute left-3 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-black" data-testid="quest-floor">
          {run.floor}階{isBossFloor(run.floor) ? "（ボス）" : ""}
        </p>
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center">
          {!run.won && (
            <div ref={enemyRef} className="relative">
              {e.boss ? <Dragon size={170} /> : <Monster kind={e.kind} size={110} />}
              {pop && (
                <span
                  key={pop.id}
                  className={`bt-pop absolute inset-x-0 top-0 text-center font-black ${pop.crit ? "text-4xl text-amber-300" : "text-3xl text-white"}`}
                  style={{ textShadow: "0 2px 0 #000, 0 0 8px #000" }}
                >
                  {pop.text}
                </span>
              )}
            </div>
          )}
          <div className="mt-1 w-44 rounded-lg bg-black/60 px-2 py-1">
            <p className="flex justify-between text-[11px] font-bold">
              <span data-testid="quest-enemy">
                {e.name} {el(e.element).icon}
              </span>
              <span className="tabular-nums">
                {e.hp}/{e.maxHp}
              </span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-rose-500 transition-all duration-300" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="grid grid-cols-2 gap-3 rounded-xl border-2 border-white bg-slate-900 px-3 py-2" data-testid="quest-status">
          <Bar value={run.hp} max={stats.hp} color={run.hp / stats.hp < 0.3 ? "bg-rose-500" : "bg-emerald-400"} label="HP" />
          <Bar value={run.mp} max={stats.mp} color="bg-sky-400" label="MP" />
        </div>
        <div className="min-h-[64px] rounded-xl border-2 border-white bg-slate-900 px-3 py-2 text-sm leading-relaxed" data-testid="quest-log" aria-live="polite">
          {log.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>

        {question ? (
          <div className="rounded-xl border-2 border-amber-300 bg-slate-900 p-3" data-testid="quest-question">
            <p className="text-center text-[11px] font-bold text-amber-300">{question.action === "spell" ? "じゅもん" : "こうげき"}: 意味をえらべ！</p>
            <p className="mt-1 flex items-center justify-center gap-2 text-2xl font-black">
              {question.item.english}
              <button type="button" aria-label="読み上げる" onClick={() => speech.speak(question.item.english, null, question.item.id)} className="text-amber-300">
                <Volume2 size={20} />
              </button>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {question.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid="quest-choice"
                  data-correct={c.id === question.item.id ? "1" : "0"}
                  onClick={() => answerWith(c)}
                  className="rounded-lg bg-white/10 px-2 py-2.5 text-sm font-bold ring-1 ring-white/30 active:scale-95"
                >
                  {c.label.split("／")[0]}
                </button>
              ))}
            </div>
          </div>
        ) : run.over ? (
          <p className="text-center text-sm font-bold text-white/70">…</p>
        ) : run.won ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                const next = nextFloor(run, stats);
                setRun(next);
                setLog([`${next.floor}階へ すすんだ。${next.enemy.name}が あらわれた！`]);
              }}
              className="rounded-xl border-2 border-white bg-emerald-700 py-3 text-sm font-black"
            >
              つぎの階へ
            </button>
            <button type="button" onClick={() => end(retreat(run))} className="rounded-xl border-2 border-white bg-slate-800 py-3 text-sm font-black">
              街に帰る
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2" data-testid="quest-commands">
            <button type="button" onClick={() => ask("attack")} className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-white bg-slate-800 py-3 text-sm font-black active:scale-95">
              <Swords size={16} /> たたかう
            </button>
            <button
              type="button"
              onClick={() => ask("spell")}
              disabled={run.mp < SPELL_MP}
              className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-white bg-slate-800 py-3 text-sm font-black active:scale-95 disabled:opacity-40"
            >
              <Sparkles size={16} /> じゅもん <span className="text-[10px] text-sky-300">MP{SPELL_MP}</span>
            </button>
            <button type="button" onClick={() => doAct("defend")} className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-white bg-slate-800 py-3 text-sm font-black active:scale-95">
              <Shield size={16} /> ぼうぎょ
            </button>
            <button
              type="button"
              onClick={() => doAct("herb")}
              disabled={run.herbs <= 0}
              className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-white bg-slate-800 py-3 text-sm font-black active:scale-95 disabled:opacity-40"
            >
              <Heart size={16} /> やくそう ×{run.herbs}
            </button>
            <button type="button" onClick={() => end(retreat(run))} className="col-span-2 py-1 text-xs font-bold text-white/50">
              にげる（街に帰る）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestResult({ run, reward, onBack }) {
  return (
    <div className="h-full overflow-y-auto bg-slate-950 px-5 pt-8 pb-6 text-white" data-testid="quest-result">
      <p className="text-center text-2xl font-black">{run.lost ? "ちからつきた…" : "ぶじに 街へ もどった"}</p>
      <div className="mt-5 space-y-2 rounded-2xl border-2 border-white bg-slate-900 p-4 text-sm">
        <p>
          とうたつ: <b>{run.floor}階</b>（たおした敵 {run.cleared}）{reward.newBest && <span className="ml-1 font-black text-amber-300">最高記録！</span>}
        </p>
        <p>
          けいけんち: <b>+{reward.exp}</b>
          {reward.levels > 0 && <span className="ml-1 font-black text-amber-300">レベルアップ！ Lv{reward.level}</span>}
        </p>
        <p>
          ガチャのポイント: <b>+{reward.points}pt</b>
          {reward.boosted ? "（ブースト中）" : ""}
        </p>
        {run.lost && <p className="text-xs text-white/60">負けても、手に入れた経験値はなくなりません。</p>}
      </div>
      <button type="button" onClick={onBack} className="mt-5 w-full rounded-2xl bg-white py-3.5 text-sm font-extrabold text-slate-900">
        準備にもどる
      </button>
    </div>
  );
}

/**
 * 冒険の画面。
 * @param onFinish (run, seconds) → reward（経験値・ポイントの記録は App 側で行う）
 */
export default function QuestScreen({ state, cards, pool, speech, sound, dopamine, header, onEquip, onAutoEquip, onFinish, active = true }) {
  const stats = useMemo(() => statsOf(state.quest, cards, state.gacha.cards || {}), [state.quest, state.gacha.cards, cards]);
  const [running, setRunning] = useState(null); // { start, id }
  const [result, setResult] = useState(null);
  if (result) return <QuestResult run={result.run} reward={result.reward} onBack={() => setResult(null)} />;
  if (running) {
    return (
      <QuestRun
        key={running.id}
        stats={{ ...stats, startFloor: running.start }}
        pool={pool}
        speech={speech}
        sound={sound}
        dopamine={dopamine}
        active={active}
        onEnd={(run, seconds) => {
          const reward = onFinish(run, seconds);
          if (reward?.levels > 0) sound.play("levelup");
          setRunning(null);
          setResult({ run, reward });
        }}
      />
    );
  }
  return <QuestHome state={state} cards={cards} stats={stats} header={header} onEquip={onEquip} onAutoEquip={onAutoEquip} onStart={(start) => setRunning({ start, id: Date.now() })} />;
}
