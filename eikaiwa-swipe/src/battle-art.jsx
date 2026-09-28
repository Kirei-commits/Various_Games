/*
 * バトルの絵（SVG で描く。画像ファイルは使わない）。
 * - 敵10種・ボス（ドラゴン）・主人公（魔法使い）・戦場の背景
 * - グラデーションは <BattleArtDefs /> に1回だけ置き、各絵から url(#…) で使う
 * - 動き（ふわふわ・羽ばたき・炎のゆらぎ）は styles.css の bt-* アニメーション
 */
import React from "react";

/** 絵で使うグラデーション（戦場に1つだけ置く。display:none にするとグラデーションが効かないので大きさ0で置く） */
export function BattleArtDefs() {
  const radial = (id, stops, cx = "35%", cy = "30%") => (
    <radialGradient id={id} cx={cx} cy={cy} r="75%">
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </radialGradient>
  );
  const linear = (id, stops, x2 = "0", y2 = "1") => (
    <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {radial("bt-slime", [["0", "#bbf7d0"], ["0.45", "#4ade80"], ["1", "#15803d"]])}
        {radial("bt-bat", [["0", "#c4b5fd"], ["0.6", "#7c3aed"], ["1", "#3b0764"]])}
        {linear("bt-wing", [["0", "#6d28d9"], ["1", "#2e1065"]])}
        {linear("bt-ghost", [["0", "#ffffff"], ["0.7", "#e0e7ff"], ["1", "#a5b4fc"]])}
        {radial("bt-cap", [["0", "#fca5a5"], ["0.55", "#ef4444"], ["1", "#991b1b"]])}
        {linear("bt-stem", [["0", "#fffbeb"], ["1", "#fde68a"]])}
        {radial("bt-goblin", [["0", "#d9f99d"], ["0.55", "#84cc16"], ["1", "#3f6212"]])}
        {linear("bt-bone", [["0", "#ffffff"], ["1", "#cbd5e1"]])}
        {radial("bt-cyan", [["0", "#ecfeff"], ["0.4", "#22d3ee"], ["1", "rgba(34,211,238,0)"]], "50%", "50%")}
        {radial("bt-eyeball", [["0", "#ffffff"], ["0.75", "#f1f5f9"], ["1", "#c4b5fd"]])}
        {radial("bt-iris", [["0", "#6ee7b7"], ["0.7", "#059669"], ["1", "#064e3b"]], "50%", "50%")}
        {linear("bt-flame", [["0", "#fef08a"], ["0.45", "#fb923c"], ["1", "#dc2626"]])}
        {linear("bt-rock", [["0", "#cbd5e1"], ["0.6", "#64748b"], ["1", "#334155"]])}
        {radial("bt-imp", [["0", "#fecaca"], ["0.5", "#ef4444"], ["1", "#7f1d1d"]])}
        {radial("bt-dragon", [["0", "#fb7185"], ["0.5", "#be123c"], ["1", "#4c0519"]])}
        {linear("bt-dwing", [["0", "#7f1d1d"], ["1", "#1c0a0a"]])}
        {linear("bt-belly", [["0", "#fef3c7"], ["1", "#f59e0b"]])}
        {linear("bt-robe", [["0", "#6366f1"], ["1", "#1e1b4b"]])}
        {radial("bt-orb", [["0", "#ffffff"], ["0.35", "#a5f3fc"], ["0.7", "rgba(56,189,248,0.6)"], ["1", "rgba(56,189,248,0)"]], "50%", "50%")}
        {radial("bt-gold", [["0", "#fffbeb"], ["0.5", "#fbbf24"], ["1", "#b45309"]])}
      </defs>
    </svg>
  );
}

const eye = (cx, cy, r = 3.6, glint = true, color = "#0f172a") => (
  <g>
    <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.2} fill={color} />
    {glint && <circle cx={cx + r * 0.35} cy={cy - r * 0.45} r={r * 0.38} fill="#fff" />}
  </g>
);

/** 敵10種（64×64） */
const MONSTER_ART = {
  slime: (
    <g className="bt-squish">
      <path d="M9 55 C7 40 17 17 32 15 C47 17 57 40 55 55 C55 59 50 60 46 59 L18 59 C14 60 9 59 9 55Z" fill="url(#bt-slime)" stroke="#14532d" strokeWidth="2" />
      <ellipse cx="22" cy="27" rx="6" ry="3" fill="#fff" opacity="0.65" transform="rotate(-35 22 27)" />
      <circle cx="44" cy="45" r="2" fill="#fff" opacity="0.35" />
      {eye(25, 40)}
      {eye(39, 40)}
      <path d="M27 48 Q32 52 37 48" stroke="#14532d" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <ellipse cx="21" cy="46" rx="3" ry="1.6" fill="#f472b6" opacity="0.5" />
      <ellipse cx="43" cy="46" rx="3" ry="1.6" fill="#f472b6" opacity="0.5" />
    </g>
  ),
  bat: (
    <g className="bt-float">
      <g className="bt-flap-l">
        <path d="M28 32 C21 18 9 16 2 21 C7 25 7 30 4 35 C11 32 13 36 13 41 C18 36 23 38 28 39Z" fill="url(#bt-wing)" stroke="#1e1b4b" strokeWidth="1.5" />
        <path d="M27 33 L8 22 M26 36 L11 34" stroke="#a78bfa" strokeWidth="1" opacity="0.6" />
      </g>
      <g className="bt-flap-r">
        <path d="M36 32 C43 18 55 16 62 21 C57 25 57 30 60 35 C53 32 51 36 51 41 C46 36 41 38 36 39Z" fill="url(#bt-wing)" stroke="#1e1b4b" strokeWidth="1.5" />
        <path d="M37 33 L56 22 M38 36 L53 34" stroke="#a78bfa" strokeWidth="1" opacity="0.6" />
      </g>
      <path d="M23 26 L20 12 L29 21Z M41 26 L44 12 L35 21Z" fill="#5b21b6" stroke="#1e1b4b" strokeWidth="1.2" />
      <circle cx="32" cy="34" r="12.5" fill="url(#bt-bat)" stroke="#1e1b4b" strokeWidth="1.5" />
      <circle cx="27" cy="32" r="3.4" fill="#fde047" />
      <circle cx="37" cy="32" r="3.4" fill="#fde047" />
      <ellipse cx="27" cy="32.4" rx="1.1" ry="2.4" fill="#7f1d1d" />
      <ellipse cx="37" cy="32.4" rx="1.1" ry="2.4" fill="#7f1d1d" />
      <path d="M26 39 Q32 42 38 39" stroke="#1e1b4b" strokeWidth="1.5" fill="none" />
      <path d="M28.5 39.8 l1.4 3.4 l1.4 -3 Z M33 39.8 l1.4 3.2 l1.4 -3.4 Z" fill="#fff" />
    </g>
  ),
  ghost: (
    <g className="bt-float" opacity="0.94">
      <path d="M14 30 C14 16 22 7 32 7 C42 7 50 16 50 30 L50 56 L45 51 L40 57 L35 51 L30 57 L25 51 L20 57 L14 51Z" fill="url(#bt-ghost)" stroke="#6366f1" strokeWidth="1.5" />
      <path d="M14 36 C8 38 6 44 9 46 C12 44 13 42 15 41Z M50 36 C56 38 58 44 55 46 C52 44 51 42 49 41Z" fill="#e0e7ff" stroke="#6366f1" strokeWidth="1.2" />
      <ellipse cx="25" cy="27" rx="3.4" ry="5" fill="#1e1b4b" />
      <ellipse cx="39" cy="27" rx="3.4" ry="5" fill="#1e1b4b" />
      <circle cx="26" cy="25" r="1.2" fill="#fff" />
      <circle cx="40" cy="25" r="1.2" fill="#fff" />
      <ellipse cx="32" cy="38" rx="3.5" ry="4.5" fill="#1e1b4b" />
      <ellipse cx="32" cy="40" rx="2" ry="2" fill="#f472b6" />
      <ellipse cx="20" cy="34" rx="3" ry="1.6" fill="#f9a8d4" opacity="0.6" />
      <ellipse cx="44" cy="34" rx="3" ry="1.6" fill="#f9a8d4" opacity="0.6" />
    </g>
  ),
  mushroom: (
    <g className="bt-squish">
      <path d="M20 35 L44 35 C47 46 46 54 42 59 L22 59 C18 54 17 46 20 35Z" fill="url(#bt-stem)" stroke="#a16207" strokeWidth="1.5" />
      <path d="M6 34 C6 15 20 7 32 7 C44 7 58 15 58 34 C58 38 54 39 50 37 L14 37 C10 39 6 38 6 34Z" fill="url(#bt-cap)" stroke="#7f1d1d" strokeWidth="1.8" />
      <circle cx="19" cy="21" r="4.2" fill="#fff" opacity="0.95" />
      <circle cx="34" cy="14" r="3.4" fill="#fff" opacity="0.95" />
      <circle cx="46" cy="24" r="4.6" fill="#fff" opacity="0.95" />
      <circle cx="29" cy="28" r="2.8" fill="#fff" opacity="0.95" />
      <circle cx="11" cy="31" r="2.2" fill="#fff" opacity="0.9" />
      <path d="M24 42 L30 44 M40 42 L34 44" stroke="#422006" strokeWidth="1.8" strokeLinecap="round" />
      {eye(27, 47, 2.4, true, "#422006")}
      {eye(37, 47, 2.4, true, "#422006")}
      <path d="M29 53 Q32 51 35 53" stroke="#422006" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  goblin: (
    <g className="bt-float">
      <path d="M48 58 L58 34" stroke="#78350f" strokeWidth="5" strokeLinecap="round" />
      <circle cx="58" cy="33" r="6" fill="#92400e" stroke="#451a03" strokeWidth="1.5" />
      <path d="M55 29 l-2 -3 M61 30 l3 -2 M59 38 l2 3" stroke="#e7e5e4" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17 61 C17 48 24 42 32 42 C40 42 47 48 47 61Z" fill="#a16207" stroke="#422006" strokeWidth="1.5" />
      <path d="M26 44 L32 52 L38 44" stroke="#422006" strokeWidth="1.5" fill="none" />
      <path d="M20 27 L3 18 L17 36Z M44 27 L61 18 L47 36Z" fill="url(#bt-goblin)" stroke="#365314" strokeWidth="1.5" />
      <ellipse cx="32" cy="29" rx="14.5" ry="13.5" fill="url(#bt-goblin)" stroke="#365314" strokeWidth="1.8" />
      <path d="M21 23 L29 26 M43 23 L35 26" stroke="#1a2e05" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="26" cy="29" rx="3.6" ry="3" fill="#facc15" />
      <ellipse cx="38" cy="29" rx="3.6" ry="3" fill="#facc15" />
      <rect x="25.3" y="26.8" width="1.4" height="4.4" rx="0.7" fill="#111" />
      <rect x="37.3" y="26.8" width="1.4" height="4.4" rx="0.7" fill="#111" />
      <ellipse cx="32" cy="33" rx="2.4" ry="1.8" fill="#4d7c0f" />
      <path d="M24 37 Q32 43 40 37" stroke="#1a2e05" strokeWidth="1.8" fill="#3f0d0d" />
      <path d="M27 38.4 l1.3 2.4 l1.3 -1.8 Z M35 39.2 l1.3 1.8 l1.3 -2.4 Z" fill="#fff" />
    </g>
  ),
  skull: (
    <g className="bt-float">
      <ellipse cx="32" cy="32" rx="26" ry="22" fill="#7c3aed" opacity="0.18" />
      <path d="M12 30 C12 15 21 7 32 7 C43 7 52 15 52 30 C52 38 48 42 46 44 L46 52 L18 52 L18 44 C16 42 12 38 12 30Z" fill="url(#bt-bone)" stroke="#475569" strokeWidth="1.8" />
      <path d="M40 12 C44 16 44 20 41 22" stroke="#94a3b8" strokeWidth="1.2" fill="none" />
      <ellipse cx="24" cy="30" rx="6" ry="7" fill="#0f172a" />
      <ellipse cx="40" cy="30" rx="6" ry="7" fill="#0f172a" />
      <circle cx="24" cy="31" r="5" fill="url(#bt-cyan)" className="bt-glow" />
      <circle cx="40" cy="31" r="5" fill="url(#bt-cyan)" className="bt-glow" />
      <path d="M32 36 L29 42 L35 42Z" fill="#0f172a" />
      <rect x="20" y="46" width="24" height="10" rx="3" fill="url(#bt-bone)" stroke="#475569" strokeWidth="1.5" />
      <path d="M26 46 V56 M32 46 V56 M38 46 V56" stroke="#475569" strokeWidth="1.3" />
    </g>
  ),
  eye: (
    <g className="bt-float">
      <path d="M22 42 C18 50 24 54 19 61 M32 45 C30 53 35 56 32 62 M42 42 C46 50 40 54 45 61" stroke="#7c3aed" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M22 42 C18 50 24 54 19 61 M32 45 C30 53 35 56 32 62 M42 42 C46 50 40 54 45 61" stroke="#c4b5fd" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <g className="bt-flap-l">
        <path d="M16 26 C10 16 4 16 1 20 C5 22 5 26 3 30 C8 28 11 30 14 33Z" fill="url(#bt-wing)" stroke="#1e1b4b" strokeWidth="1.2" />
      </g>
      <g className="bt-flap-r">
        <path d="M48 26 C54 16 60 16 63 20 C59 22 59 26 61 30 C56 28 53 30 50 33Z" fill="url(#bt-wing)" stroke="#1e1b4b" strokeWidth="1.2" />
      </g>
      <circle cx="32" cy="28" r="18" fill="url(#bt-eyeball)" stroke="#6d28d9" strokeWidth="2" />
      <path d="M16 24 C20 25 21 22 24 24 M47 21 C44 23 43 20 40 22 M18 36 C21 34 23 37 25 35" stroke="#ef4444" strokeWidth="0.9" fill="none" opacity="0.8" />
      <circle cx="32" cy="32" r="8.5" fill="url(#bt-iris)" />
      <circle cx="32" cy="33" r="4" fill="#020617" />
      <circle cx="29" cy="29" r="2" fill="#fff" />
      <path d="M14 20 Q32 4 50 20" stroke="#4c1d95" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </g>
  ),
  fire: (
    <g className="bt-flicker">
      <path d="M32 3 C36 14 49 18 49 35 C49 49 41 59 32 59 C23 59 15 49 15 35 C15 27 21 22 21 13 C26 19 28 22 30 22 C30 16 30 9 32 3Z" fill="url(#bt-flame)" stroke="#b91c1c" strokeWidth="1.2" />
      <path d="M32 20 C34 28 42 30 42 40 C42 49 37 54 32 54 C27 54 22 49 22 40 C22 34 26 32 27 27 C29 30 31 29 32 20Z" fill="#fef08a" opacity="0.9" />
      <ellipse cx="27" cy="40" rx="2.6" ry="3.6" fill="#7c2d12" />
      <ellipse cx="37" cy="40" rx="2.6" ry="3.6" fill="#7c2d12" />
      <circle cx="27.8" cy="38.8" r="0.9" fill="#fff" />
      <circle cx="37.8" cy="38.8" r="0.9" fill="#fff" />
      <path d="M28 47 Q32 50 36 47" stroke="#7c2d12" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="20" r="1.8" fill="#fb923c" className="bt-glow" />
      <circle cx="52" cy="14" r="1.4" fill="#fde047" className="bt-glow" />
    </g>
  ),
  golem: (
    <g className="bt-squish">
      <rect x="3" y="28" width="13" height="23" rx="5" fill="url(#bt-rock)" stroke="#1e293b" strokeWidth="1.5" />
      <rect x="48" y="28" width="13" height="23" rx="5" fill="url(#bt-rock)" stroke="#1e293b" strokeWidth="1.5" />
      <rect x="18" y="52" width="10" height="9" rx="2" fill="#475569" stroke="#1e293b" strokeWidth="1.3" />
      <rect x="36" y="52" width="10" height="9" rx="2" fill="#475569" stroke="#1e293b" strokeWidth="1.3" />
      <rect x="13" y="25" width="38" height="30" rx="7" fill="url(#bt-rock)" stroke="#1e293b" strokeWidth="1.8" />
      <rect x="21" y="7" width="22" height="19" rx="6" fill="url(#bt-rock)" stroke="#1e293b" strokeWidth="1.8" />
      <path d="M17 32 L23 36 L20 42 M46 30 L42 35 M40 48 L45 50" stroke="#1e293b" strokeWidth="1.2" fill="none" />
      <path d="M13 34 C16 31 20 33 22 30 M5 30 C8 28 11 30 14 29" stroke="#4d7c0f" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <rect x="25" y="14" width="5" height="3.6" rx="1" fill="#67e8f9" className="bt-glow" />
      <rect x="34" y="14" width="5" height="3.6" rx="1" fill="#67e8f9" className="bt-glow" />
      <circle cx="32" cy="40" r="6" fill="none" stroke="#22d3ee" strokeWidth="1.8" className="bt-glow" />
      <path d="M32 35 V45 M27.5 40 H36.5" stroke="#22d3ee" strokeWidth="1.4" className="bt-glow" />
    </g>
  ),
  imp: (
    <g className="bt-float">
      <path d="M42 52 C56 54 60 42 52 35" stroke="#7f1d1d" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M49 31 L56 32 L52 38Z" fill="#7f1d1d" />
      <g className="bt-flap-l">
        <path d="M22 38 C14 30 6 32 3 38 C8 39 9 42 8 46 C13 43 17 45 21 46Z" fill="#450a0a" stroke="#1c0a0a" strokeWidth="1.2" />
      </g>
      <g className="bt-flap-r">
        <path d="M42 38 C50 30 58 32 61 38 C56 39 55 42 56 46 C51 43 47 45 43 46Z" fill="#450a0a" stroke="#1c0a0a" strokeWidth="1.2" />
      </g>
      <ellipse cx="32" cy="49" rx="11" ry="10" fill="url(#bt-imp)" stroke="#450a0a" strokeWidth="1.5" />
      <path d="M22 22 C17 14 19 7 24 4 C23 11 25 16 28 19Z M42 22 C47 14 45 7 40 4 C41 11 39 16 36 19Z" fill="#fde68a" stroke="#92400e" strokeWidth="1.2" />
      <circle cx="32" cy="30" r="13" fill="url(#bt-imp)" stroke="#450a0a" strokeWidth="1.6" />
      <path d="M23 25 L29 28 M41 25 L35 28" stroke="#450a0a" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="27" cy="30" rx="3" ry="2.6" fill="#fde047" />
      <ellipse cx="37" cy="30" rx="3" ry="2.6" fill="#fde047" />
      <ellipse cx="27" cy="30" rx="0.9" ry="2.2" fill="#111" />
      <ellipse cx="37" cy="30" rx="0.9" ry="2.2" fill="#111" />
      <path d="M24 35 Q32 42 40 35 Q32 38 24 35Z" fill="#450a0a" />
      <path d="M27 36 l1.2 2.6 l1.2 -2 Z M34.6 36.6 l1.2 2 l1.2 -2.6 Z" fill="#fff" />
    </g>
  ),
};

export const MONSTER_KINDS = Object.keys(MONSTER_ART);

/** 単語ごとにいつも同じ敵になるように、ID から種類を決める */
export function monsterKindOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MONSTER_KINDS[h % MONSTER_KINDS.length];
}

export function Monster({ kind, size = 56 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="overflow-visible" aria-hidden="true">
      {MONSTER_ART[kind] || MONSTER_ART.slime}
    </svg>
  );
}

/** ボス: ドラゴン（120×100） */
export function Dragon({ size = 110 }) {
  return (
    <svg viewBox="0 0 120 100" width={size} height={(size * 100) / 120} className="overflow-visible" aria-hidden="true">
      <g className="bt-float-slow">
        <g className="bt-flap-l">
          <path d="M46 50 C34 24 14 14 1 20 C9 26 9 34 5 43 C13 39 19 45 21 54 C27 48 35 51 40 58Z" fill="url(#bt-dwing)" stroke="#1c0a0a" strokeWidth="1.8" />
          <path d="M44 50 L6 22 M41 54 L12 40 M40 57 L22 53" stroke="#be123c" strokeWidth="1.2" opacity="0.7" />
        </g>
        <g className="bt-flap-r">
          <path d="M74 50 C86 24 106 14 119 20 C111 26 111 34 115 43 C107 39 101 45 99 54 C93 48 85 51 80 58Z" fill="url(#bt-dwing)" stroke="#1c0a0a" strokeWidth="1.8" />
          <path d="M76 50 L114 22 M79 54 L108 40 M80 57 L98 53" stroke="#be123c" strokeWidth="1.2" opacity="0.7" />
        </g>
        <path d="M78 80 C92 84 100 78 104 70 L110 72 L104 64 C100 74 90 78 80 74Z" fill="url(#bt-dragon)" stroke="#4c0519" strokeWidth="1.5" />
        <ellipse cx="60" cy="72" rx="22" ry="21" fill="url(#bt-dragon)" stroke="#4c0519" strokeWidth="2" />
        <ellipse cx="60" cy="76" rx="12" ry="15" fill="url(#bt-belly)" stroke="#b45309" strokeWidth="1.2" />
        <path d="M50 68 H70 M49 74 H71 M50 80 H70 M52 86 H68" stroke="#d97706" strokeWidth="1" opacity="0.7" />
        <path d="M42 88 C40 94 44 97 48 96 L52 92Z M78 88 C80 94 76 97 72 96 L68 92Z" fill="url(#bt-dragon)" stroke="#4c0519" strokeWidth="1.5" />
        <path d="M44 96 l-2 3 M48 96 l0 3 M72 96 l0 3 M76 96 l2 3" stroke="#fef3c7" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M45 30 C38 17 41 8 46 4 C47 13 50 21 53 27Z M75 30 C82 17 79 8 74 4 C73 13 70 21 67 27Z" fill="url(#bt-bone)" stroke="#78716c" strokeWidth="1.3" />
        <path d="M54 25 L57 18 L60 24 L63 18 L66 25" fill="#9f1239" stroke="#4c0519" strokeWidth="1.2" />
        <ellipse cx="60" cy="39" rx="18" ry="15" fill="url(#bt-dragon)" stroke="#4c0519" strokeWidth="2" />
        <ellipse cx="60" cy="50" rx="12.5" ry="8.5" fill="url(#bt-dragon)" stroke="#4c0519" strokeWidth="1.8" />
        <ellipse cx="55" cy="48" rx="1.6" ry="1.1" fill="#1c0a0a" />
        <ellipse cx="65" cy="48" rx="1.6" ry="1.1" fill="#1c0a0a" />
        <path d="M49 54 Q60 60 71 54" stroke="#1c0a0a" strokeWidth="1.6" fill="#450a0a" />
        <path d="M52 55 l1.6 3.4 l1.6 -2.8Z M66 55.6 l1.6 2.8 l1.6 -3.4Z M58 56.8 l1 2.4 l1 -2.4Z" fill="#fff" />
        <path d="M44 33 L55 37 M76 33 L65 37" stroke="#1c0a0a" strokeWidth="2.6" strokeLinecap="round" />
        <ellipse cx="51" cy="39" rx="4.4" ry="3.2" fill="#fde047" className="bt-glow" />
        <ellipse cx="69" cy="39" rx="4.4" ry="3.2" fill="#fde047" className="bt-glow" />
        <ellipse cx="51" cy="39" rx="1.1" ry="2.8" fill="#1c0a0a" />
        <ellipse cx="69" cy="39" rx="1.1" ry="2.8" fill="#1c0a0a" />
      </g>
    </svg>
  );
}

/** 主人公: 魔法使い（64×72）。casting のときは杖の玉が強く光る */
export function Hero({ casting = false, size = 58 }) {
  return (
    <svg viewBox="0 0 64 72" width={size} height={(size * 72) / 64} className="overflow-visible" aria-hidden="true">
      <circle cx="51" cy="15" r={casting ? 15 : 10} fill="url(#bt-orb)" className="bt-glow" />
      <path d="M51 20 L51 70" stroke="#78350f" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M47 16 C47 10 55 10 55 16" stroke="#92400e" strokeWidth="2" fill="none" />
      <circle cx="51" cy="15" r="4.4" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="1.2" />
      <path d="M19 40 C16 52 12 62 10 70 L50 70 C48 62 45 52 43 40 C39 44 23 44 19 40Z" fill="url(#bt-robe)" stroke="#1e1b4b" strokeWidth="1.5" />
      <path d="M17 54 H45" stroke="#fbbf24" strokeWidth="2.5" />
      <circle cx="31" cy="54" r="2.4" fill="url(#bt-gold)" />
      <path d="M43 44 C46 46 48 44 50 40" stroke="url(#bt-robe)" strokeWidth="6" strokeLinecap="round" fill="none" />
      <circle cx="50" cy="40" r="3" fill="#fcd9b6" />
      <circle cx="31" cy="31" r="8.5" fill="#fcd9b6" stroke="#b45309" strokeWidth="0.8" />
      <path d="M23 33 C23 46 31 51 31 51 C31 51 39 46 39 33 C36 37 26 37 23 33Z" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
      <circle cx="28" cy="30" r="1.2" fill="#1e293b" />
      <circle cx="34" cy="30" r="1.2" fill="#1e293b" />
      <path d="M13 26 L31 1 C34 8 39 17 49 26Z" fill="url(#bt-robe)" stroke="#1e1b4b" strokeWidth="1.5" />
      <ellipse cx="31" cy="26" rx="19" ry="4.2" fill="#4338ca" stroke="#1e1b4b" strokeWidth="1.5" />
      <path d="M29 12 l1 2 l2.2 0.3 l-1.6 1.5 l0.4 2.2 l-2 -1 l-2 1 l0.4 -2.2 l-1.6 -1.5 l2.2 -0.3Z" fill="#fde047" />
      <circle cx="37" cy="19" r="1.1" fill="#fde047" />
      <circle cx="23" cy="21" r="0.9" fill="#fde047" />
    </svg>
  );
}

/** 星の位置（毎回同じにするため固定の式で作る） */
const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 97 + 13) % 400,
  y: (i * 53 + 7) % 330,
  r: 0.6 + ((i * 7) % 5) * 0.28,
  d: ((i * 37) % 30) / 10,
}));

/** 戦場の背景: 夜空・月・山・城・奥へ続く道 */
export function BattleBackdrop() {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="bt-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#020617" />
          <stop offset="0.35" stopColor="#1e1b4b" />
          <stop offset="0.62" stopColor="#581c87" />
          <stop offset="0.78" stopColor="#be185d" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <radialGradient id="bt-moonglow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fef3c7" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fef3c7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bt-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b0764" />
          <stop offset="1" stopColor="#1c1917" />
        </linearGradient>
        <linearGradient id="bt-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1033" />
          <stop offset="1" stopColor="#0c0a09" />
        </linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#bt-sky)" />
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" className="bt-twinkle" style={{ animationDelay: `${s.d}s` }} />
      ))}
      <circle cx="318" cy="96" r="70" fill="url(#bt-moonglow)" />
      <circle cx="318" cy="96" r="30" fill="#fef9c3" />
      <circle cx="306" cy="88" r="5" fill="#fde68a" opacity="0.7" />
      <circle cx="326" cy="106" r="7" fill="#fde68a" opacity="0.6" />
      <circle cx="330" cy="84" r="3" fill="#fde68a" opacity="0.7" />
      <path d="M0 380 L50 320 L95 360 L150 290 L205 350 L250 300 L300 350 L350 310 L400 345 L400 600 L0 600Z" fill="#2e1065" opacity="0.85" />
      <path d="M232 318 V292 H238 V282 H244 V292 H256 V276 L262 266 L268 276 V292 H280 V282 H286 V292 H292 V318Z" fill="#1e0b3a" />
      <rect x="259" y="282" width="6" height="8" fill="#fbbf24" opacity="0.8" />
      <path d="M0 420 L70 380 L130 410 L200 372 L270 408 L340 382 L400 400 L400 600 L0 600Z" fill="#1e1033" />
      <rect y="430" width="400" height="170" fill="url(#bt-ground)" />
      <path d="M185 430 L215 430 L330 600 L70 600Z" fill="url(#bt-road)" opacity="0.9" />
      <path d="M200 440 V455 M200 475 V500 M200 525 V560" stroke="#a78bfa" strokeWidth="3" opacity="0.25" />
      <ellipse cx="80" cy="470" rx="90" ry="10" fill="#fff" opacity="0.05" />
      <ellipse cx="320" cy="520" rx="110" ry="12" fill="#fff" opacity="0.05" />
    </svg>
  );
}
