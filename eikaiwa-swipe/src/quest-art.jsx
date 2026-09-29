/*
 * 冒険の絵（装備7か所・属性・呪文のアイコン、攻撃・呪文のエフェクト、塔の背景、主人公の剣士）。
 * 絵は src/assets/quest/*.webp（tools/media/game_art.py が Gemini で 3×3 のまとめ絵を描き、切り分けたもの）。
 * ビルドで index.html に埋め込まれる。エフェクトは明るさ＝透明度の絵なので、どの背景の上でも光って見える。
 */
import React from "react";
import weapon from "./assets/quest/weapon.webp";
import shield from "./assets/quest/shield.webp";
import head from "./assets/quest/head.webp";
import body from "./assets/quest/body.webp";
import arms from "./assets/quest/arms.webp";
import feet from "./assets/quest/feet.webp";
import accessory from "./assets/quest/accessory.webp";
import elemFire from "./assets/quest/elem-fire.webp";
import elemIce from "./assets/quest/elem-ice.webp";
import elemThunder from "./assets/quest/elem-thunder.webp";
import elemLight from "./assets/quest/elem-light.webp";
import elemDark from "./assets/quest/elem-dark.webp";
import skillFire from "./assets/quest/skill-fire.webp";
import skillIce from "./assets/quest/skill-ice.webp";
import skillThunder from "./assets/quest/skill-thunder.webp";
import skillLight from "./assets/quest/skill-light.webp";
import skillDark from "./assets/quest/skill-dark.webp";
import skillNone from "./assets/quest/skill-none.webp";
import fxSlash from "./assets/quest/fx-slash.webp";
import fxBurst from "./assets/quest/fx-burst.webp";
import fxFire from "./assets/quest/fx-fire.webp";
import fxIce from "./assets/quest/fx-ice.webp";
import fxThunder from "./assets/quest/fx-thunder.webp";
import fxLight from "./assets/quest/fx-light.webp";
import fxDark from "./assets/quest/fx-dark.webp";
import fxMeteor from "./assets/quest/fx-meteor.webp";
import fxShield from "./assets/quest/fx-shield.webp";
import backdrop from "./assets/quest/backdrop.webp";
import hero from "./assets/quest/hero.webp";

/** 装備の場所（SLOTS の id）ごとのアイコン */
export const SLOT_ART = { weapon, shield, head, body, arms, feet, accessory };
/** 属性ごとのアイコン（none はなし） */
export const ELEMENT_ART = { fire: elemFire, ice: elemIce, thunder: elemThunder, light: elemLight, dark: elemDark };
/** 呪文（SKILLS の属性）ごとのアイコン */
export const SKILL_ART = { fire: skillFire, ice: skillIce, thunder: skillThunder, light: skillLight, dark: skillDark, none: skillNone };
/** 攻撃・呪文のエフェクト。呪文は属性で引く */
export const FX_ART = {
  slash: fxSlash,
  burst: fxBurst,
  shield: fxShield,
  fire: fxFire,
  ice: fxIce,
  thunder: fxThunder,
  light: fxLight,
  dark: fxDark,
  none: fxMeteor,
};
export const QUEST_BACKDROP = backdrop;
export const QUEST_HERO = hero;

/** 小さい飾りの絵（読み上げでは読まない）。size は px */
export function QuestIcon({ src, size = 20, className = "", title }) {
  if (!src) return null;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      title={title}
      draggable={false}
      aria-hidden="true"
      className={`inline-block shrink-0 select-none align-[-0.2em] ${className}`}
    />
  );
}

/** 属性のアイコン。属性がないときは fallback（文字）を出す */
export function ElementIcon({ element, size = 16, fallback = null }) {
  const src = ELEMENT_ART[element];
  return src ? <QuestIcon src={src} size={size} /> : fallback;
}
