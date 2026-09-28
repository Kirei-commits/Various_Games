/*
 * バトルの絵（敵10種・ボス（ドラゴン）・主人公（魔法使い）・戦場の背景）。
 * - 絵は src/assets/battle/*.webp（tools/media/battle_art.py が Gemini で作ったもの）。
 *   ビルドで data URL として index.html に埋め込むので、index.html 1枚で動くのは変わらない
 * - 動き（ふわふわ・ぷにぷに・炎のゆらぎ）は styles.css の bt-* アニメーション
 */
import React from "react";
import slime from "./assets/battle/slime.webp";
import bat from "./assets/battle/bat.webp";
import ghost from "./assets/battle/ghost.webp";
import mushroom from "./assets/battle/mushroom.webp";
import goblin from "./assets/battle/goblin.webp";
import skull from "./assets/battle/skull.webp";
import eye from "./assets/battle/eye.webp";
import fire from "./assets/battle/fire.webp";
import golem from "./assets/battle/golem.webp";
import imp from "./assets/battle/imp.webp";
import dragon from "./assets/battle/dragon.webp";
import hero from "./assets/battle/hero.webp";
import backdrop from "./assets/battle/backdrop.webp";

/** 敵10種: [絵, 動き]。並び順は monsterKindOf の結果に効くので変えない（足すなら末尾に） */
const MONSTER_ART = {
  slime: [slime, "bt-squish"],
  bat: [bat, "bt-float"],
  ghost: [ghost, "bt-float"],
  mushroom: [mushroom, "bt-squish"],
  goblin: [goblin, "bt-float"],
  skull: [skull, "bt-float"],
  eye: [eye, "bt-float"],
  fire: [fire, "bt-flicker"],
  golem: [golem, "bt-squish"],
  imp: [imp, "bt-float"],
};

export const MONSTER_KINDS = Object.keys(MONSTER_ART);

/** 単語ごとにいつも同じ敵になるように、ID から種類を決める */
export function monsterKindOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return MONSTER_KINDS[h % MONSTER_KINDS.length];
}

function Sprite({ src, size, className = "" }) {
  return <img src={src} width={size} height={size} alt="" draggable={false} aria-hidden="true" className={`block select-none ${className}`} />;
}

export function Monster({ kind, size = 56 }) {
  const [src, motion] = MONSTER_ART[kind] || MONSTER_ART.slime;
  return <Sprite src={src} size={size} className={motion} />;
}

/** ボス: ドラゴン */
export function Dragon({ size = 110 }) {
  return <Sprite src={dragon} size={size} className="bt-float-slow" />;
}

/** 主人公: 魔法使い（後ろ姿）。casting のときは杖の玉（絵の右上）が強く光る */
export function Hero({ casting = false, size = 64 }) {
  const glow = casting ? size * 0.55 : size * 0.3;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <Sprite src={hero} size={size} />
      <span
        className="bt-glow pointer-events-none absolute block rounded-full"
        style={{
          left: size * 0.8 - glow / 2,
          top: size * 0.26 - glow / 2,
          width: glow,
          height: glow,
          background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(165,243,252,0.7) 35%, rgba(56,189,248,0) 70%)",
        }}
      />
    </div>
  );
}

/** 戦場の背景: 夜空・月・山・城・奥へ続く道 */
export function BattleBackdrop() {
  return <img src={backdrop} alt="" draggable={false} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" />;
}
