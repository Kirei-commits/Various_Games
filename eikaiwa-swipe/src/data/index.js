// 章の一覧。順番がそのまま章番号になる。
import ch01 from "./ch01.js";
import ch02 from "./ch02.js";
import ch03 from "./ch03.js";
import ch04 from "./ch04.js";
import ch05 from "./ch05.js";
import ch06 from "./ch06.js";
import ch07 from "./ch07.js";
import ch08 from "./ch08.js";
import ch09 from "./ch09.js";
import ch10 from "./ch10.js";
import ch11 from "./ch11.js";
import ch12 from "./ch12.js";
import ch13 from "./ch13.js";
import ch14 from "./ch14.js";
import ch15 from "./ch15.js";
import ch16 from "./ch16.js";
import ch17 from "./ch17.js";
import ch18 from "./ch18.js";
import ch19 from "./ch19.js";
import ch20 from "./ch20.js";
import ch21 from "./ch21.js";
import ch22 from "./ch22.js";
import ch23 from "./ch23.js";
import ch24 from "./ch24.js";
import ch25 from "./ch25.js";
import ch26 from "./ch26.js";
import ch27 from "./ch27.js";
import ch28 from "./ch28.js";
import ch29 from "./ch29.js";
import ch30 from "./ch30.js";
import ch31 from "./ch31.js";
import ch32 from "./ch32.js";
import ch33 from "./ch33.js";
import ch34 from "./ch34.js";
import ch35 from "./ch35.js";
import ch36 from "./ch36.js";
import ch37 from "./ch37.js";
import ch38 from "./ch38.js";
import ch39 from "./ch39.js";
import ch40 from "./ch40.js";
import ch41 from "./ch41.js";
import ch42 from "./ch42.js";
import ch43 from "./ch43.js";
import ch44 from "./ch44.js";
import ch45 from "./ch45.js";
import ch46 from "./ch46.js";
import ch47 from "./ch47.js";
import ch48 from "./ch48.js";
import ch49 from "./ch49.js";
import ch50 from "./ch50.js";
import ch51 from "./ch51.js";
import ch52 from "./ch52.js";
import ch53 from "./ch53.js";
import ch54 from "./ch54.js";
import ch55 from "./ch55.js";
import ch56 from "./ch56.js";
import ch57 from "./ch57.js";
import ch58 from "./ch58.js";
import ch59 from "./ch59.js";
import ch60 from "./ch60.js";
import ch61 from "./ch61.js";
import ch62 from "./ch62.js";
import ch63 from "./ch63.js";
import ch64 from "./ch64.js";
import ch65 from "./ch65.js";
import ch66 from "./ch66.js";
import ch67 from "./ch67.js";
import ch68 from "./ch68.js";
import ch69 from "./ch69.js";
import ch70 from "./ch70.js";
import ch71 from "./ch71.js";
import ch72 from "./ch72.js";
import ch73 from "./ch73.js";
import ch74 from "./ch74.js";
import ch75 from "./ch75.js";
import ch76 from "./ch76.js";
import ch77 from "./ch77.js";
import ch78 from "./ch78.js";
import ch79 from "./ch79.js";
import ch80 from "./ch80.js";
import ch81 from "./ch81.js";
import ch82 from "./ch82.js";
import ch83 from "./ch83.js";
import ch84 from "./ch84.js";
import ch85 from "./ch85.js";
import ch86 from "./ch86.js";
import ch87 from "./ch87.js";
import ch88 from "./ch88.js";
import ch89 from "./ch89.js";
import ch90 from "./ch90.js";
import ch91 from "./ch91.js";
import ch92 from "./ch92.js";
import ch93 from "./ch93.js";
import ch94 from "./ch94.js";
import ch95 from "./ch95.js";
import ch96 from "./ch96.js";
import ch97 from "./ch97.js";
import ch98 from "./ch98.js";
import ch99 from "./ch99.js";
import ch100 from "./ch100.js";
import ch101 from "./ch101.js";
import ch102 from "./ch102.js";
import ch103 from "./ch103.js";
import ch104 from "./ch104.js";
import ch105 from "./ch105.js";
import ch106 from "./ch106.js";
import ch107 from "./ch107.js";
import ch108 from "./ch108.js";
import ch109 from "./ch109.js";
import ch110 from "./ch110.js";

export { RENAMED, RETIRED } from "./id-changes.js";

/**
 * 章のまとまり（章番号の範囲）。kind は "phrase"（フレーズ・会話例つき）か "word"（単語・例文つき）
 */
export const PARTS = [
  { title: "基本編", from: 1, to: 20, kind: "phrase" },
  { title: "アメリカ生活編", from: 21, to: 40, kind: "phrase" },
  { title: "もっと話せる編", from: 41, to: 50, kind: "phrase" },
  { title: "単語編・基礎", from: 51, to: 70, kind: "word" },
  { title: "単語編・生活", from: 71, to: 90, kind: "word" },
  { title: "単語編・応用", from: 91, to: 110, kind: "word" },
];

export default [
  ch01,
  ch02,
  ch03,
  ch04,
  ch05,
  ch06,
  ch07,
  ch08,
  ch09,
  ch10,
  ch11,
  ch12,
  ch13,
  ch14,
  ch15,
  ch16,
  ch17,
  ch18,
  ch19,
  ch20,
  ch21,
  ch22,
  ch23,
  ch24,
  ch25,
  ch26,
  ch27,
  ch28,
  ch29,
  ch30,
  ch31,
  ch32,
  ch33,
  ch34,
  ch35,
  ch36,
  ch37,
  ch38,
  ch39,
  ch40,
  ch41,
  ch42,
  ch43,
  ch44,
  ch45,
  ch46,
  ch47,
  ch48,
  ch49,
  ch50,
  ch51,
  ch52,
  ch53,
  ch54,
  ch55,
  ch56,
  ch57,
  ch58,
  ch59,
  ch60,
  ch61,
  ch62,
  ch63,
  ch64,
  ch65,
  ch66,
  ch67,
  ch68,
  ch69,
  ch70,
  ch71,
  ch72,
  ch73,
  ch74,
  ch75,
  ch76,
  ch77,
  ch78,
  ch79,
  ch80,
  ch81,
  ch82,
  ch83,
  ch84,
  ch85,
  ch86,
  ch87,
  ch88,
  ch89,
  ch90,
  ch91,
  ch92,
  ch93,
  ch94,
  ch95,
  ch96,
  ch97,
  ch98,
  ch99,
  ch100,
  ch101,
  ch102,
  ch103,
  ch104,
  ch105,
  ch106,
  ch107,
  ch108,
  ch109,
  ch110,
];
