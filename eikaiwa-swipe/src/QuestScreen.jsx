/*
 * 冒険（ドラクエ風モード）の画面。進行と数値は src/quest.js（純粋関数）、絵はバトルと同じ src/battle-art.jsx。
 * - 準備: 主人公の Lv・能力値・装備（ガチャで集めた単語。7か所）を見て、場所ごとに付け替える
 * - 冒険: たたかう／じゅもん／SSR の特製の呪文（単語の4択に正解すると攻撃）・ぼうぎょ・やくそう。倒したら次の階か、街に帰る
 *   敵がちからをためたら、次のターンはぼうぎょ（大こうげきを受けとめて、はんげき）
 * - 演出: 攻撃の斬撃・爆発・粒・ダメージの数字、呪文の弾と属性の光、敵の突進と画面のゆれ、ためのオーラ、盾・回復の光（styles.css の qs-* と bt-*）
 * - 結果: 経験値・Lv・ガチャのポイント
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, Swords, Shield, Heart, Castle, X } from "lucide-react";
import { Monster, Dragon } from "./battle-art.jsx";
import { Art, CHEST_ART } from "./gacha-art.jsx";
import { SLOT_ART, SKILL_ART, FX_ART, QUEST_BACKDROP, QUEST_HERO, QuestIcon, ElementIcon } from "./quest-art.jsx";
import { makeChoices } from "./logic.js";
import {
  SLOTS,
  ELEMENTS,
  SKILLS,
  elementMultiplier,
  openChest,
  PRESETS,
  plusOf,
  PLUS_EXP,
  MAX_PLUS,
  ULTIMATE_PLUS,
  materialExp,
  spareCopies,
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

/** 相性の倍率（1.5 = ばつぐん、0.75 = いまひとつ） */
function MultBadge({ mult, long = false }) {
  if (mult === 1) return long ? <span className="whitespace-nowrap rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-black">×1 ふつう</span> : null;
  const good = mult > 1;
  return (
    <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-black ${good ? "bg-amber-400 text-slate-900" : "bg-slate-500 text-white"}`}>
      ×{mult}
      {long ? (good ? " ばつぐん！" : " いまひとつ") : ""}
    </span>
  );
}

/** 属性の相性表 */
export function AffinityChart({ dark = false }) {
  return (
    <p className={`text-[11px] leading-relaxed ${dark ? "text-white/70" : "text-slate-500"}`} data-testid="affinity-chart">
      相性: 🔥炎 → ❄️氷 → ⚡雷 → 🔥炎、✨光 ⇔ 🌑闇（矢印の先に <b>1.5倍</b>、逆は 0.75倍）
    </p>
  );
}

function RarityBadge({ rarity }) {
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-black ${RARITY_STYLE[rarity] || RARITY_STYLE.N}`}>{rarity}</span>;
}

/** 装備を選ぶシート（持っている単語を強い順に） */
function GearPicker({ slot, owned, cards, enhance = {}, current, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const info = SLOTS.find((s) => s.id === slot);
  const list = useMemo(
    () =>
      Object.entries(owned)
        .filter(([id, n]) => n > 0 && cards[id])
        .map(([id, n]) => gearOf(cards[id], n, plusOf(enhance?.[id])))
        .sort((a, b) => b.power - a.power || a.english.localeCompare(b.english)),
    [owned, cards, enhance]
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
            <QuestIcon src={SLOT_ART[slot]} size={24} /> {info.name}をえらぶ <span className="text-xs font-bold text-slate-400">（{info.stat}が上がる）</span>
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
                  {g.plus > 0 && <span className="text-[11px] font-black text-amber-500">+{g.plus}</span>}
                  <span className="text-[10px] font-bold text-slate-400">Lv{g.level}</span>
                  <span className="ml-auto text-xs" title={`${el(g.element).name}属性`}>
                    <ElementIcon element={g.element} size={16} />
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

/** 装備の強化（集めた単語のあまりを素材にする） */
function EnhanceSheet({ state, cards, targetId, onEnhance, onClose }) {
  const [picked, setPicked] = useState({});
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const target = cards[targetId];
  const exp = state.quest.enhance?.[targetId] || 0;
  const plus = plusOf(exp);
  const maxed = plus >= MAX_PLUS;
  const next = PLUS_EXP[Math.min(MAX_PLUS, plus + 1)];
  const list = useMemo(
    () =>
      Object.keys(state.gacha.cards || {})
        .filter((id) => cards[id] && spareCopies(state, id) > 0)
        .map((id) => ({ id, card: cards[id], spare: spareCopies(state, id), value: materialExp(cards[id], targetId) }))
        .sort((a, b) => (b.id === targetId) - (a.id === targetId) || b.value - a.value || a.card.english.localeCompare(b.card.english)),
    [state, cards, targetId]
  );
  const q = query.trim().toLowerCase();
  const shown = list.filter((m) => !q || m.card.english.toLowerCase().includes(q) || (m.card.japanese || "").includes(q)).slice(0, 150);
  const gain = list.reduce((n, m) => n + (picked[m.id] || 0) * m.value, 0);
  const after = plusOf(Math.min(PLUS_EXP[MAX_PLUS], exp + gain));
  const set = (id, n, max) => setPicked((p) => ({ ...p, [id]: Math.max(0, Math.min(max, n)) }));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50" onClick={onClose}>
      <div
        role="dialog"
        aria-label="装備を強化"
        data-testid="enhance-sheet"
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl bg-white p-4 shadow-2xl"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold text-slate-900">
            「{target.english}」を強化 <span className="text-amber-500">+{plus}</span>
            {plus >= ULTIMATE_PLUS && <span className="ml-1 text-xs font-black text-pink-500">ULTIMATE</span>}
          </p>
          <button type="button" onClick={onClose} aria-label="閉じる" className="rounded-full p-1 text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs ring-1 ring-slate-200">
          {maxed ? (
            <p className="font-bold text-amber-600">+10（最大）です！</p>
          ) : (
            <>
              <p className="flex justify-between font-bold text-slate-600">
                <span>強化ポイント</span>
                <span className="tabular-nums">
                  {exp} / {next}（+{plus + 1} まで あと {next - exp}）
                </span>
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${((exp - PLUS_EXP[plus]) / (next - PLUS_EXP[plus])) * 100}%` }} />
              </div>
            </>
          )}
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            素材1枚: N 1・R 4・SR 12・SSR 40pt、同じ単語は3倍。1つ強化するごとに強さ +10%・効果 +8%。+{ULTIMATE_PLUS} から
            <b>アルティメット</b>（効果さらに1.5倍・SSR の呪文は「極」）。素材は2枚目以降だけ使います（図鑑から消えません）。
          </p>
        </div>
        {!maxed && (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`素材 ${list.length}語から検索`}
              className="mt-2 w-full rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto" data-testid="enhance-materials">
              {shown.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-xl bg-white px-2 py-1.5 ring-1 ring-slate-200">
                  <RarityBadge rarity={m.card.rarity} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">
                    {m.card.english}
                    {m.id === targetId && <span className="ml-1 text-[10px] text-pink-500">同じ単語 ×3</span>}
                    <span className="block text-[10px] font-normal text-slate-400">
                      あまり {m.spare}枚・1枚 {m.value}pt
                    </span>
                  </span>
                  <button type="button" aria-label={`${m.card.english}を減らす`} onClick={() => set(m.id, (picked[m.id] || 0) - 1, m.spare)} className="h-7 w-7 rounded-full bg-slate-100 font-black">
                    −
                  </button>
                  <span className="w-5 text-center text-sm font-black tabular-nums">{picked[m.id] || 0}</span>
                  <button type="button" aria-label={`${m.card.english}を足す`} onClick={() => set(m.id, (picked[m.id] || 0) + 1, m.spare)} className="h-7 w-7 rounded-full bg-indigo-600 font-black text-white">
                    ＋
                  </button>
                  <button type="button" onClick={() => set(m.id, m.spare, m.spare)} className="rounded-full px-1.5 text-[10px] font-bold text-indigo-600">
                    全部
                  </button>
                </li>
              ))}
              {list.length === 0 && <li className="p-4 text-center text-xs text-slate-500">素材にできる単語がありません。ガチャで同じ単語が2枚以上になると素材にできます。</li>}
            </ul>
            <button
              type="button"
              disabled={!gain}
              onClick={() => {
                const r = onEnhance(targetId, picked);
                if (r?.error) setMessage(r.error);
                else {
                  setMessage(r.to > r.from ? `+${r.from} → +${r.to} に強化した！${r.to >= ULTIMATE_PLUS && r.from < ULTIMATE_PLUS ? "　アルティメット解放！" : ""}` : `強化ポイント +${r.gained}`);
                  setPicked({});
                }
              }}
              className="mt-2 w-full rounded-2xl bg-gradient-to-r from-amber-500 to-pink-500 py-3 text-sm font-extrabold text-white shadow disabled:opacity-40"
            >
              強化する（+{gain}pt{gain ? ` → +${after}` : ""}）
            </button>
          </>
        )}
        {message && (
          <p className="mt-2 text-center text-sm font-black text-amber-600" data-testid="enhance-message">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

/** 準備画面: 主人公と装備 */
function QuestHome({ state, cards, stats, header, onEquip, onAutoEquip, onSavePreset, onLoadPreset, onEnhance, onStart }) {
  const [picking, setPicking] = useState(null);
  const [enhancing, setEnhancing] = useState(null);
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
          <span className="flex items-center gap-1.5 text-lg font-black">
            <QuestIcon src={QUEST_HERO} size={40} className="-my-2" />
            ぼうけんしゃ
          </span>
          <span className="text-sm font-black text-amber-300" data-testid="quest-level">
            Lv {q.level}
          </span>
        </p>
        <div className="mt-2">
          <Bar value={q.exp} max={expToNext(q.level)} color="bg-amber-400" label="けいけんち" />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-xs" data-testid="quest-stats">
          {[
            ["HP", stats.hp],
            ["MP", stats.mp],
            ["攻撃", stats.atk],
            ["守備", stats.def],
            ["会心", `${stats.crit}%`],
            ["回避", `${stats.evade}%`],
            ["盾", stats.block],
            ["属性", <ElementIcon element={stats.element} size={20} fallback="－" />],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/10 py-1.5">
              <p className="text-[10px] text-white/60">{k}</p>
              <p className="font-black tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-white/80">
          攻撃の属性 <ElementIcon element={stats.element} size={14} />
          {el(stats.element).name}・盾の属性 <ElementIcon element={stats.guard} size={14} />
          {el(stats.guard).name}
          {stats.setBonus > 0 && <span className="ml-1 font-black text-amber-300">属性そろい！攻撃+{stats.setBonus}%</span>}
        </p>
        {effects.length > 0 && <p className="mt-1 text-[11px] text-emerald-300">{effects.map(effectText).join("・")}</p>}
        {stats.skills.length > 0 && (
          <div className="mt-2 rounded-xl bg-gradient-to-r from-amber-400/20 to-pink-500/20 p-2" data-testid="quest-skills">
            <p className="text-[10px] font-black text-amber-300">SSR の特製の呪文</p>
            {stats.skills.map((sk) => (
              <p key={sk.id} className="text-[11px]">
                <QuestIcon src={SKILL_ART[sk.element] || SKILL_ART.none} size={18} /> <b>{sk.name}</b>（MP{sk.mp}）{sk.text} <span className="text-white/50">← {sk.from}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">そうび（集めた単語・7か所）</p>
        <button
          type="button"
          onClick={onAutoEquip}
          disabled={!ownedCount}
          className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-600 disabled:opacity-40"
        >
          おまかせ装備
        </button>
      </div>
      <div className="mt-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200" data-testid="quest-presets">
        <p className="px-1 text-[10px] font-bold text-slate-400">装備のプリセット（今の装備を保存して、ワンタップで付け替え）</p>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {Array.from({ length: PRESETS }, (_, i) => {
            const p = q.presets?.[i];
            const count = p ? Object.values(p.equip).filter(Boolean).length : 0;
            return (
              <div key={i} className="rounded-xl bg-slate-50 p-1.5 text-center ring-1 ring-slate-200">
                <p className="text-[11px] font-black text-slate-700">
                  セット{i + 1}
                  <span className="ml-1 font-bold text-slate-400">{p ? `${count}か所` : "空"}</span>
                </p>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    disabled={!p}
                    onClick={() => onLoadPreset(i)}
                    aria-label={`セット${i + 1}を装備する`}
                    className="rounded-lg bg-indigo-600 py-1 text-[10px] font-bold text-white disabled:opacity-30"
                  >
                    装備
                  </button>
                  <button
                    type="button"
                    onClick={() => onSavePreset(i)}
                    aria-label={`今の装備をセット${i + 1}に保存`}
                    className="rounded-lg bg-white py-1 text-[10px] font-bold text-indigo-600 ring-1 ring-indigo-200"
                  >
                    保存
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-1.5" data-testid="quest-equip">
        {SLOTS.map((s) => {
          const g = stats.gear[s.id];
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setPicking(s.id)}
                aria-label={`${s.name}を変える`}
                className="flex w-full items-center gap-2.5 rounded-2xl bg-white px-3 py-2 text-left shadow-sm ring-1 ring-slate-200 active:scale-[0.99]"
              >
                <QuestIcon src={SLOT_ART[s.id]} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold text-slate-400">
                    {s.name}（{s.stat}）
                  </span>
                  {g ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <RarityBadge rarity={g.rarity} />
                        <span className="truncate text-sm font-bold text-slate-900">{g.english}</span>
                        {g.plus > 0 && <span className={`text-[11px] font-black ${g.ultimate ? "text-pink-500" : "text-amber-500"}`}>+{g.plus}</span>}
                        <span className="text-[10px] font-bold text-slate-400">Lv{g.level}</span>
                        <ElementIcon element={g.element} size={14} />
                        {g.rarity === "SSR" && (
                          <span className="flex items-center text-[10px] font-black text-amber-500">
                            <QuestIcon src={SKILL_ART[g.element] || SKILL_ART.none} size={14} />
                            呪文
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {bonusText(slotBonus(s.id, g.power))}／{g.effects.map(effectText).join("・")}
                      </span>
                    </>
                  ) : (
                    <span className="block text-sm font-bold text-slate-300">なし（タップで装備）</span>
                  )}
                </span>
                {g && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`${s.name}を強化`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setEnhancing(g.id);
                    }}
                    onKeyDown={(ev) => ev.key === "Enter" && (ev.stopPropagation(), setEnhancing(g.id))}
                    className="shrink-0 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 px-2.5 py-1 text-[10px] font-black text-white shadow"
                  >
                    強化
                  </span>
                )}
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
      <div className="mt-2">
        <AffinityChart />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        名詞は守り・動詞は攻め・形容詞はからめ手の効果。SSR は効果が2つと特製の呪文付き（呪文は SSR の装備だけ）。4か所の属性をそろえると攻撃+15%。
        5階ごとのボスを倒すと宝箱（冒険限定の単語など）。
        敵が「ちからをためた」ら、次は大こうげき。ぼうぎょで受けとめると、はんげきします（盾が強いほど減らせる）。
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

      {enhancing && <EnhanceSheet state={state} cards={cards} targetId={enhancing} onEnhance={onEnhance} onClose={() => setEnhancing(null)} />}
      {picking && (
        <GearPicker
          slot={picking}
          owned={owned}
          cards={cards}
          enhance={q.enhance}
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
          e.skill ? `${e.skill}！` : e.magic ? "じゅもんを となえた！" : "こうげき！",
          e.crit ? "かいしんの いちげき！" : "",
          e.weak ? "こうかは ばつぐんだ！" : e.resist ? "あまり きいていない…" : "",
          `${enemyName}に ${e.dmg}の ダメージ！`,
        ]
          .filter(Boolean)
          .join(" ");
      case "miss":
        return `ミス！ ${e.skill || (e.magic ? "じゅもん" : "こうげき")}は はずれた…（正解は「${answerText}」）`;
      case "drain":
        return `HPを ${e.heal} すいとった！`;
      case "heal":
        return `ひかりに つつまれ HPが ${e.heal} かいふくした！`;
      case "freeze":
        return `${enemyName}は こおりついた！`;
      case "frozen":
        return `${enemyName}は うごけない！`;
      case "defend":
        return "みを まもっている。MPが すこし かいふくした";
      case "herb":
        return `やくそうを つかった！ HPが ${e.heal} かいふくした`;
      case "win":
        return `${enemyName}を たおした！ けいけんち ${e.exp} を かくとく！`;
      case "charge":
        return `${enemyName}は ${e.boss ? "おおきく いきを すいこんだ" : "ちからを ためている"}…！ つぎは 大こうげきだ！ ぼうぎょ しよう！`;
      case "evade":
        return `${enemyName}の こうげき！ ひらりと かわした！`;
      case "hurt":
        return `${e.smash ? (e.boss ? `${enemyName}は はげしい ほのおを はいた！` : `${enemyName}の 大こうげき！`) : `${enemyName}の こうげき！`} ${e.dmg}の ダメージを うけた！${
          e.guarded ? (e.smash ? "（たてで うけとめた）" : "（ぼうぎょ）") : ""
        }${e.resist ? "（ぞくせいで けいげん）" : ""}`;
      case "counter":
        return `はんげき！ ${enemyName}に ${e.dmg}の ダメージ！`;
      case "regen":
        return `HPが ${e.heal} かいふくした`;
      case "lose":
        return "ちからつきた…";
      default:
        return "";
    }
  });
}

const ELEMENT_COLOR = { none: "#e2e8f0", fire: "#f97316", ice: "#38bdf8", thunder: "#facc15", light: "#fef08a", dark: "#a855f7" };
const FX_MS = 1300;

/** 冒険中の画面 */
function QuestRun({ stats, pool, chestWords, cards, speech, sound, dopamine, onEnd, active }) {
  const [run, setRun] = useState(() => createRun(stats, stats.startFloor));
  const [log, setLog] = useState(() => [`${stats.startFloor}階。${run.enemy.name}が あらわれた！`]);
  const [question, setQuestion] = useState(null); // { action, skillId, item, choices }
  const [fx, setFx] = useState([]); // 表示中の演出
  const [busy, setBusy] = useState(false); // 演出中はコマンドを受け付けない
  const [dying, setDying] = useState(null); // 倒した敵（消える演出）
  const [chestOpen, setChestOpen] = useState(false); // 宝箱の中身を見せている
  const enemyRef = useRef(null);
  const arenaRef = useRef(null);
  const fxId = useRef(0);
  const timers = useRef([]);
  const started = useRef(Date.now());
  const ended = useRef(false);
  const boss = run.enemy.boss;

  // BGM はこのタブを見ているあいだだけ（テスト画面は裏でも表示したままにしているため）
  useEffect(() => {
    sound.setBattleMusic(active ? (boss ? "boss" : "battle") : null);
  }, [boss, sound, active]);
  useEffect(() => {
    sound.play("appear");
    const list = timers.current;
    return () => {
      sound.setBattleMusic(null);
      list.forEach(clearTimeout);
    };
  }, [sound]);

  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  const addFx = (list) => {
    const items = list.map((f) => ({ ...f, id: ++fxId.current }));
    setFx((cur) => [...cur, ...items]);
    later(FX_MS, () => setFx((cur) => cur.filter((f) => !items.includes(f))));
  };
  const animate = (node, frames, ms) => node?.animate?.(frames, { duration: ms, easing: "ease-out" });
  const shakeArena = (big) =>
    animate(
      arenaRef.current,
      [{ transform: "translate(0,0)" }, { transform: `translate(${big ? -10 : -5}px,${big ? 4 : 2}px)` }, { transform: `translate(${big ? 9 : 4}px,${big ? -5 : -2}px)` }, { transform: `translate(${big ? -6 : -3}px,2px)` }, { transform: "translate(0,0)" }],
      big ? 500 : 320
    );

  const end = (r) => {
    if (ended.current) return;
    ended.current = true;
    sound.setBattleMusic(null);
    onEnd(r, (Date.now() - started.current) / 1000);
  };

  const ask = (action, skillId = null) => {
    const cost = skillId ? SKILLS[skillId].mp : 0;
    if (cost && run.mp < cost) {
      setLog(["MPが たりない！"]);
      return;
    }
    const item = pool[Math.floor(Math.random() * pool.length)];
    setQuestion({ action, skillId, item, choices: makeChoices(item, pool, Math.random, 4, "japanese") });
    // 単語は問題が出たときに読む（答えたあとに読むと、効果音や合いの手のあとになって遅れるため）
    speech.speak(item.english, null, item.id);
  };

  /** 主人公の行動の演出 */
  const playerFx = (e) => {
    const color = ELEMENT_COLOR[e.element] || ELEMENT_COLOR.none;
    const list = [];
    const art = FX_ART[e.element] || FX_ART.none;
    if (e.magic) list.push({ kind: "orb", color, skill: !!e.skill });
    if (e.skill) list.push({ kind: "flash", color }, { kind: "bigicon", src: art });
    else if (e.magic) list.push({ kind: "img", src: art, size: 150 });
    list.push({ kind: "slash", rot: -35 + Math.random() * 20 }, { kind: "slash", rot: 30 + Math.random() * 20, late: true });
    list.push({ kind: "burst", color: e.magic ? color : "#fff7ed", big: e.crit || !!e.skill });
    if (!e.magic || e.crit) list.push({ kind: "img", src: FX_ART.burst, size: e.crit ? 190 : 130, rot: Math.random() * 360 });
    const n = e.skill ? 18 : e.crit ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = (e.skill ? 110 : 60) + Math.random() * 40;
      list.push({ kind: "particle", dx: Math.cos(a) * d, dy: Math.sin(a) * d, color: i % 3 ? color : "#fde68a" });
    }
    list.push({ kind: "number", text: `${e.dmg}`, crit: e.crit, weak: e.weak });
    addFx(list);
    // 合いの手（声）は1回の行動で1つだけ（倒したときの声・正解の声）。ここの効果音では流さない
    sound.play(e.skill ? "spell" : "slash", 0, { cheer: false });
    if (e.crit || e.skill) later(120, () => sound.play("explode", 0, { cheer: false }));
    animate(
      enemyRef.current,
      [{ transform: "translateX(0)", filter: "brightness(1)" }, { transform: `translateX(${e.crit ? -14 : -7}px)`, filter: "brightness(4) saturate(0)" }, { transform: `translateX(${e.crit ? 12 : 6}px)` }, { transform: "translateX(0)", filter: "brightness(1)" }],
      e.crit ? 480 : 340
    );
    if (e.crit || e.skill) shakeArena(true);
  };

  /** 敵の行動の演出（主人公の演出のあとに少し遅らせて出す） */
  const enemyFx = (e) => {
    if (e.type === "charge") {
      sound.play("warn", 0, { cheer: false });
      addFx([{ kind: "warn" }]);
      return;
    }
    if (e.type === "frozen") {
      addFx([{ kind: "ice" }]);
      return;
    }
    // 突進してくる
    animate(
      enemyRef.current,
      [{ transform: "translateY(0) scale(1)" }, { transform: `translateY(${e.smash ? 50 : 30}px) scale(${e.smash ? 1.45 : 1.25})` }, { transform: "translateY(0) scale(1)" }],
      e.smash ? 520 : 380
    );
    if (e.type === "evade") {
      sound.play("slash", 0, { cheer: false });
      addFx([{ kind: "text", text: "かわした！", color: "#e0f2fe" }]);
      return;
    }
    if (e.type === "hurt") {
      later(e.smash ? 200 : 140, () => {
        if (e.guarded) sound.play("block", 0, { cheer: false });
        sound.play(e.smash ? "smash" : "hurt", 0, { cheer: false });
        shakeArena(e.smash);
        const list = [{ kind: "vignette", big: e.smash }, { kind: "playerHit", text: `-${e.dmg}` }];
        if (e.guarded) list.push({ kind: "shield" });
        if (e.smash) list.push({ kind: "flash", color: e.boss ? "#f97316" : "#ef4444" });
        addFx(list);
      });
    }
    if (e.type === "counter") {
      later(520, () => {
        sound.play("slash", 0, { cheer: false });
        addFx([{ kind: "text", text: "はんげき！", color: "#fde68a" }, { kind: "burst", color: "#93c5fd", big: true }, { kind: "number", text: `${e.dmg}` }]);
        animate(enemyRef.current, [{ filter: "brightness(4) saturate(0)" }, { filter: "brightness(1)" }], 300);
      });
    }
  };

  const doAct = (action, answer = null, item = null, skillId = null) => {
    let next = act(run, stats, action, answer, Math.random, skillId);
    if (next.error) {
      setLog([next.error]);
      return;
    }
    // 正解の音。倒したときは倒した声を流すので、ここでは声を出さない
    if (answer?.correct) sound.play("correct", 0, { cheer: !next.won });
    // ボスを倒したら宝箱
    const bossWin = next.won && next.events.some((x) => x.type === "win" && x.boss);
    if (bossWin) next = openChest(next, chestWords);
    const answerText = item ? item.japanese.split("／")[0] : "";
    setLog(messagesOf(next.events, run.enemy.name, answerText));
    setQuestion(null);
    setBusy(true);
    let wait = 0;
    for (const e of next.events) {
      if (e.type === "hit") playerFx(e);
      else if (e.type === "miss") {
        sound.play("wrong", 0, { cheer: false });
        addFx([{ kind: "text", text: "MISS", color: "#cbd5e1" }]);
      } else if (e.type === "defend") {
        sound.play("block", 0, { cheer: false });
        addFx([{ kind: "shield" }]);
      } else if (e.type === "herb" || e.type === "heal" || e.type === "drain" || e.type === "regen") {
        const at = e.type === "regen" ? 700 : 0;
        later(at, () => {
          sound.play("heal", 0, { cheer: false });
          addFx([{ kind: "heal", text: `+${e.heal}` }]);
        });
      } else if (e.type === "freeze") {
        addFx([{ kind: "ice" }]);
      } else if (["charge", "frozen", "evade", "hurt", "counter"].includes(e.type)) {
        wait = 450;
        later(wait, () => enemyFx(e));
      } else if (e.type === "win") {
        const killAt = next.events.some((x) => x.type === "counter") ? 800 : 250;
        later(killAt, () => {
          sound.play(e.boss ? "bonus" : "explode"); // 倒したときの合いの手はここの1つだけ
          setDying({ kind: run.enemy.kind, boss: run.enemy.boss, id: Date.now() });
          addFx([{ kind: "text", text: e.boss ? "BOSS DEFEATED!" : "VICTORY!", color: "#fde68a", big: true }]);
          if (e.boss) later(400, () => sound.play("levelup", 0, { cheer: false }));
          if (e.boss) later(1100, () => setChestOpen(true));
        });
      }
    }
    setRun(next);
    later(wait + 500, () => setBusy(false));
    if (next.over) later(1600, () => end(next));
  };

  const answerWith = (choice) => {
    const { action, item, skillId } = question;
    const correct = choice.id === item.id;
    dopamine.hit(correct);
    doAct(action, { id: item.id, correct }, item, skillId);
  };

  const e = run.enemy;
  const cmd = "flex items-center justify-center gap-1.5 rounded-xl border-2 border-white bg-slate-800 py-3 text-sm font-black active:scale-95 disabled:opacity-40";
  return (
    <div className="flex h-full flex-col bg-slate-950 text-white" data-testid="quest-run">
      <div ref={arenaRef} className="relative h-[42%] min-h-[220px] overflow-hidden">
        <img src={QUEST_BACKDROP} alt="" draggable={false} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-bottom" />
        <img
          src={QUEST_HERO}
          alt=""
          draggable={false}
          aria-hidden="true"
          className="qs-idle pointer-events-none absolute bottom-1 left-0 z-10 h-[80px] w-[80px] select-none"
          data-testid="quest-hero"
        />
        <p className="absolute left-3 top-2 z-10 rounded-full bg-black/60 px-2.5 py-1 text-xs font-black" data-testid="quest-floor">
          {run.floor}階{isBossFloor(run.floor) ? "（ボス）" : ""}
        </p>
        {e.charging && !run.won && (
          <p className="qs-warn-badge absolute right-3 top-2 z-10 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-black shadow-lg" data-testid="quest-charging">
            ⚠️ 大こうげきが来る！ ぼうぎょ！
          </p>
        )}
        <div className="absolute inset-x-0 bottom-3 flex flex-col items-center">
          <div className="relative flex h-[170px] items-end justify-center">
            {!run.won && (
              <div key={`${run.floor}`} className="qs-appear">
                <div className="qs-idle">
                  <div ref={enemyRef} className={e.charging ? "qs-charge" : ""}>
                    {e.boss ? <Dragon size={170} /> : <Monster kind={e.kind} size={120} />}
                  </div>
                </div>
              </div>
            )}
            {dying && run.won && (
              <div key={dying.id} className="bt-die absolute bottom-0 left-1/2">
                {dying.boss ? <Dragon size={170} /> : <Monster kind={dying.kind} size={120} />}
              </div>
            )}
          </div>
          <div className="mt-1 w-48 rounded-lg bg-black/60 px-2 py-1">
            <p className="flex justify-between text-[11px] font-bold">
              <span data-testid="quest-enemy">
                {e.name} <ElementIcon element={e.element} size={14} />
              </span>
              <span className="tabular-nums">
                {e.hp}/{e.maxHp}
              </span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-rose-500 transition-all duration-500" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
            </div>
            <p className="mt-1 flex items-center justify-between gap-1 text-[10px] font-bold" data-testid="quest-matchup">
              <span className="flex shrink-0 items-center whitespace-nowrap">
                こうげき <ElementIcon element={stats.element} size={13} fallback="無" />→<ElementIcon element={e.element} size={13} fallback="無" />
              </span>
              <MultBadge mult={elementMultiplier(stats.element, e.element)} long />
            </p>
          </div>
        </div>
        <FxLayer fx={fx} />
        {chestOpen && run.chests?.length > 0 && (
          <ChestModal chest={run.chests[run.chests.length - 1]} cards={cards} onClose={() => setChestOpen(false)} />
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        <div className="grid shrink-0 grid-cols-2 gap-3 rounded-xl border-2 border-white bg-slate-900 px-3 py-2" data-testid="quest-status">
          <Bar value={run.hp} max={stats.hp} color={run.hp / stats.hp < 0.3 ? "bg-rose-500" : "bg-emerald-400"} label="HP" />
          <Bar value={run.mp} max={stats.mp} color="bg-sky-400" label="MP" />
        </div>
        <div className="min-h-[64px] shrink-0 rounded-xl border-2 border-white bg-slate-900 px-3 py-2 text-sm leading-relaxed" data-testid="quest-log" aria-live="polite">
          {log.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>

        <AffinityChart dark />
        {question ? (
          <div className="shrink-0 rounded-xl border-2 border-amber-300 bg-slate-900 p-3" data-testid="quest-question">
            <p className="text-center text-[11px] font-bold text-amber-300">
              {question.skillId ? SKILLS[question.skillId].name : "こうげき"}: 意味をえらべ！
            </p>
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
            <button type="button" onClick={() => setQuestion(null)} className="mt-2 w-full text-center text-[11px] font-bold text-white/50">
              もどる
            </button>
          </div>
        ) : run.over ? (
          <p className="text-center text-sm font-bold text-white/70">…</p>
        ) : run.won ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const next = nextFloor(run, stats);
                setDying(null);
                setRun(next);
                setLog([`${next.floor}階へ すすんだ。${next.enemy.name}が あらわれた！`]);
                sound.play("appear");
              }}
              className="rounded-xl border-2 border-white bg-emerald-700 py-3 text-sm font-black disabled:opacity-40"
            >
              つぎの階へ
            </button>
            <button type="button" onClick={() => end(retreat(run))} className="rounded-xl border-2 border-white bg-slate-800 py-3 text-sm font-black">
              街に帰る
            </button>
          </div>
        ) : (
          <div className="grid shrink-0 grid-cols-2 gap-2" data-testid="quest-commands">
            <button type="button" disabled={busy} onClick={() => ask("attack")} className={cmd}>
              <Swords size={16} /> たたかう
            </button>
            {stats.skills.map((sk) => (
              <button
                key={sk.id}
                type="button"
                onClick={() => ask("skill", sk.id)}
                disabled={busy || run.mp < sk.mp}
                className={`${cmd} border-amber-300 bg-gradient-to-r from-amber-600/60 to-pink-600/60`}
                data-testid="quest-skill"
              >
                <QuestIcon src={SKILL_ART[sk.element] || SKILL_ART.none} size={20} /> {sk.name} <span className="text-[10px] text-sky-200">MP{sk.mp}</span>
                <MultBadge mult={elementMultiplier(sk.element, e.element)} />
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => doAct("defend")} className={`${cmd} ${e.charging ? "qs-defend-hint border-sky-300 bg-sky-800" : ""}`}>
              <Shield size={16} /> ぼうぎょ
            </button>
            <button type="button" onClick={() => doAct("herb")} disabled={busy || run.herbs <= 0} className={cmd}>
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

const LOOT_LABEL = { points: "ガチャのポイント", tickets: "レアチケット", srTickets: "SR チケット", medals: "メダル" };

/** 宝箱をあけた演出（ボスを倒したあと） */
function ChestModal({ chest, cards, onClose }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60" data-testid="quest-chest" onClick={onClose}>
      <div className="qs-appear flex flex-col items-center rounded-2xl border-2 border-amber-300 bg-slate-900/95 px-6 py-4 text-center shadow-2xl">
        <div className="qs-chest">
          <Art src={CHEST_ART} size={96} />
        </div>
        <p className="mt-1 text-sm font-black text-amber-300">{chest.floor}階の たからばこを あけた！</p>
        <ul className="mt-2 space-y-1 text-sm">
          {chest.items.map((it, i) =>
            it.kind === "word" ? (
              <li key={i} className="qs-heal-in flex items-center justify-center gap-1.5 font-black">
                <RarityBadge rarity={it.rarity} /> {cards[it.id]?.english || it.id}
                <span className="text-[10px] font-bold text-amber-300">冒険限定</span>
              </li>
            ) : (
              <li key={i} className="qs-heal-in font-bold">
                {LOOT_LABEL[it.kind]} +{it.amount}
              </li>
            )
          )}
        </ul>
        <p className="mt-2 text-[10px] text-white/50">街に帰ると受け取れます（負けても受け取れます）・タップで閉じる</p>
      </div>
    </div>
  );
}

/** 演出の重ね絵（敵の中心は戦場の 50%・58%） */
function FxLayer({ fx }) {
  const at = { left: "50%", top: "58%" };
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {fx.map((f) => {
        switch (f.kind) {
          case "orb":
            return (
              <span
                key={f.id}
                className="qs-orb absolute block rounded-full"
                style={{ ...at, width: f.skill ? 44 : 26, height: f.skill ? 44 : 26, background: `radial-gradient(circle, #fff 0%, ${f.color} 55%, transparent 72%)`, boxShadow: `0 0 24px 8px ${f.color}` }}
              />
            );
          case "flash":
            return <span key={f.id} className="qs-flash absolute inset-0 block" style={{ background: f.color }} />;
          case "bigicon":
            return (
              <img key={f.id} src={f.src} alt="" draggable={false} className="qs-bigicon absolute block h-[110px] w-[110px] select-none" style={at} />
            );
          case "slash":
            return (
              <img
                key={f.id}
                src={FX_ART.slash}
                alt=""
                draggable={false}
                className="bt-slash absolute block h-[150px] w-[150px] select-none"
                style={{ ...at, "--rot": `${f.rot + 45}deg`, animationDelay: f.late ? "0.22s" : undefined }}
              />
            );
          case "img":
            return (
              <img
                key={f.id}
                src={f.src}
                alt=""
                draggable={false}
                className="qs-fx absolute block select-none"
                style={{ ...at, width: f.size, height: f.size, "--rot": `${f.rot || 0}deg` }}
              />
            );
          case "burst":
            return (
              <span
                key={f.id}
                className="bt-burst absolute block rounded-full"
                style={{ ...at, width: f.big ? 150 : 90, height: f.big ? 150 : 90, background: `radial-gradient(circle, #fff 0%, ${f.color} 40%, transparent 70%)` }}
              />
            );
          case "particle":
            return <span key={f.id} className="bt-particle absolute block h-2 w-2 rounded-full" style={{ ...at, background: f.color, "--dx": `${f.dx}px`, "--dy": `${f.dy}px` }} />;
          case "number":
            return (
              <span
                key={f.id}
                className={`bt-score absolute block font-black ${f.crit ? "text-5xl text-amber-300" : f.weak ? "text-4xl text-orange-300" : "text-3xl text-white"}`}
                style={{ left: "50%", top: "22%", textShadow: "0 3px 0 #000, 0 0 10px #000" }}
              >
                {f.text}
                {f.crit && <span className="block text-center text-sm">CRITICAL!</span>}
              </span>
            );
          case "text":
            return (
              <span
                key={f.id}
                className={`bt-pop absolute inset-x-0 text-center font-black italic ${f.big ? "top-[18%] text-4xl" : "top-[30%] text-2xl"}`}
                style={{ color: f.color, textShadow: "0 3px 0 #000, 0 0 12px #000" }}
              >
                {f.text}
              </span>
            );
          case "vignette":
            return <span key={f.id} className="bt-vignette absolute inset-0 block" style={f.big ? { boxShadow: "inset 0 0 90px 36px rgba(239,68,68,0.95)" } : undefined} />;
          case "playerHit":
            return (
              <span key={f.id} className="bt-score absolute block text-3xl font-black text-rose-400" style={{ left: "50%", bottom: "4%", top: "auto", textShadow: "0 3px 0 #000" }}>
                {f.text}
              </span>
            );
          case "shield":
            return (
              <span key={f.id} className="qs-shield absolute bottom-2 left-1/2 flex h-28 w-28 items-center justify-center rounded-full">
                <img src={FX_ART.shield} alt="" draggable={false} className="h-full w-full select-none" />
              </span>
            );
          case "heal":
            return (
              <span key={f.id} className="qs-heal absolute bottom-6 left-1/2 block text-3xl font-black text-emerald-300" style={{ textShadow: "0 2px 0 #000, 0 0 12px #10b981" }}>
                ✨{f.text}
              </span>
            );
          case "ice":
            return <span key={f.id} className="qs-flash absolute inset-0 block" style={{ background: "#7dd3fc" }} />;
          case "warn":
            return <span key={f.id} className="qs-warn absolute inset-0 block" />;
          default:
            return null;
        }
      })}
    </div>
  );
}

function QuestResult({ run, reward, cards, onBack }) {
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
          {reward.levelBonus > 0 && <span className="ml-1 text-[11px] text-white/60">（とうたつボーナス {reward.levelBonus}pt を含む）</span>}
        </p>
        {reward.tickets > 0 && (
          <p>
            レアチケット: <b>+{reward.tickets}</b>
          </p>
        )}
        {(run.chests || []).length > 0 && (
          <div className="rounded-xl bg-amber-400/10 p-2" data-testid="quest-loot">
            <p className="text-xs font-black text-amber-300">たからばこ（{run.chests.length}こ）</p>
            {Object.entries(reward.loot || {})
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <p key={k} className="text-xs">
                  {LOOT_LABEL[k]} +{v}
                </p>
              ))}
            {(reward.words || []).map((w, i) => (
              <p key={i} className="flex items-center gap-1 text-xs font-bold">
                <RarityBadge rarity={w.rarity} /> {cards[w.id]?.english || w.id}（冒険限定）
              </p>
            ))}
          </div>
        )}
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
export default function QuestScreen({ state, cards, pool, chestWords = [], speech, sound, dopamine, header, onEquip, onAutoEquip, onSavePreset, onLoadPreset, onEnhance, onFinish, active = true }) {
  const stats = useMemo(() => statsOf(state.quest, cards, state.gacha.cards || {}), [state.quest, state.gacha.cards, cards]);
  const [running, setRunning] = useState(null); // { start, id }
  const [result, setResult] = useState(null);
  if (result) return <QuestResult run={result.run} reward={result.reward} cards={cards} onBack={() => setResult(null)} />;
  if (running) {
    return (
      <QuestRun
        key={running.id}
        stats={{ ...stats, startFloor: running.start }}
        pool={pool}
        chestWords={chestWords}
        cards={cards}
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
  return (
    <QuestHome
      state={state}
      cards={cards}
      stats={stats}
      header={header}
      onEquip={onEquip}
      onAutoEquip={onAutoEquip}
      onSavePreset={onSavePreset}
      onLoadPreset={onLoadPreset}
      onEnhance={onEnhance}
      onStart={(start) => setRunning({ start, id: Date.now() })}
    />
  );
}
