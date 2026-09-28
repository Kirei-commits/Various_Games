/*
 * ガチャ画面の絵（台・宝箱・カードの裏・財布のアイコン・ショップの道具）。
 * 絵は src/assets/gacha/*.webp（tools/media/game_art.py が Gemini で作ったもの）。ビルドで index.html に埋め込まれる。
 */
import React from "react";
import machinePoints from "./assets/gacha/machine-points.webp";
import machineTicket from "./assets/gacha/machine-ticket.webp";
import machineSr from "./assets/gacha/machine-sr.webp";
import machineSsr from "./assets/gacha/machine-ssr.webp";
import chest from "./assets/gacha/chest.webp";
import cardBack from "./assets/gacha/card-back.webp";
import iconPoints from "./assets/gacha/icon-points.webp";
import iconTicket from "./assets/gacha/icon-ticket.webp";
import iconSr from "./assets/gacha/icon-sr.webp";
import iconSsr from "./assets/gacha/icon-ssr.webp";
import iconEx from "./assets/gacha/icon-ex.webp";
import iconMedal from "./assets/gacha/icon-medal.webp";
import itemBoost from "./assets/gacha/item-boost.webp";
import itemFreeze from "./assets/gacha/item-freeze.webp";
import itemSpecial from "./assets/gacha/item-special.webp";

/** ガチャの種類（currency）ごとの台の絵 */
export const MACHINE_ART = { points: machinePoints, ticket: machineTicket, sr: machineSr, ssr: machineSsr };
/** 財布のアイコン（Wallet の data-testid の末尾で引く） */
export const WALLET_ICON = { points: iconPoints, tickets: iconTicket, sr: iconSr, ssr: iconSsr, ex: iconEx, medals: iconMedal };
/** ショップの道具 */
export const SHOP_ART = { boost: itemBoost, freeze: itemFreeze, special: itemSpecial };
export const CHEST_ART = chest;
export const CARD_BACK_ART = cardBack;

/** 飾りの絵（読み上げでは読まない） */
export function Art({ src, size, className = "" }) {
  return <img src={src} width={size} height={size} alt="" draggable={false} aria-hidden="true" className={`block shrink-0 select-none ${className}`} />;
}
