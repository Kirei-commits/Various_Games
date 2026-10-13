const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.APPLY_THEME || "./apply_theme.js");

// 湘南の夕暮れ: 深い海の色を主に、夕陽のコーラルを差し色に
const THEME = {
  name: "Shonan Sunset",
  headFontFace: "Meiryo",
  bodyFontFace: "Meiryo",
  colors: {
    dk1: "1F2A30", lt1: "FFFFFF", dk2: "12343B", lt2: "EAF3F2",
    accent1: "E76F51", accent2: "2A9D8F", accent3: "F4A261", accent4: "264653",
    accent5: "8AB17D", accent6: "9AA5AB", hlink: "2A9D8F", folHlink: "264653",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "サザンオールスターズと桑田佳祐";
pres.author = "kyozai-quiz サンプル教材";
const C = pres.SchemeColor;

pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.9, y: 2.3, w: 11.5, h: 1.4, fontSize: 44, bold: true, color: C.background1, valign: "middle" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.9, y: 3.8, w: 11.5, h: 1.0, fontSize: 20, color: C.accent3, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.5, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.4, w: 12.1, h: 0.9, fontSize: 30, bold: true, color: C.text2, valign: "middle", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: 12.2, y: 6.95, w: 0.6, h: 0.35, fontSize: 11, color: "6B7A80", align: "right" },
});

const content = (section, title) => {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  return s;
};
const tb = (s, text, opts) => s.addText(text, { isTextBox: true, margin: 0, fontSize: 16, color: C.text1, ...opts });

// ---------- 1. 表紙 ----------
pres.addSection({ title: "導入" });
let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "導入" });
s.addText("サザンオールスターズと桑田佳祐", { placeholder: "title" });
s.addText("学生サークルから国民的バンドへ ― デビューから半世紀近い歩みを図で学ぶ", { placeholder: "body" });
s.addNotes("この教材では、サザンオールスターズの結成からの歩みと、中心人物である桑田佳祐の活動の広がりを扱う。図（メンバー構成図、年表、活動の広がり、アルバム数のグラフ、楽曲マップ）を読み取れるかを確認問題で問う。");

// ---------- 2. 桑田佳祐プロフィール（図なし: テキストボックスのみ） ----------
s = content("導入", "桑田佳祐 ― バンドの声であり、作り手");
tb(s, [
  { text: "サザンオールスターズのボーカル・ギターを担当し、ほとんどの楽曲の作詞・作曲を手がける", options: { bullet: true, breakLine: true } },
  { text: "1986年にKUWATA BANDを結成し、1987年に「悲しい気持ち (JUST A MAN IN LOVE)」でソロデビュー", options: { bullet: true, breakLine: true } },
  { text: "1990年には映画『稲村ジェーン』で監督を務めた", options: { bullet: true, breakLine: true } },
  { text: "2010年に病気療養のため休養し、同年末の『紅白歌合戦』で復帰した", options: { bullet: true } },
], { x: 0.6, y: 1.7, w: 7.2, h: 4.6, fontSize: 18, paraSpaceAfter: 14, valign: "top", objectName: "profile-bullets" });
const stats = [["1956", "年 生まれ", "2月26日、神奈川県茅ヶ崎市出身"], ["1978", "年 デビュー", "「勝手にシンドバッド」"], ["1987", "年 ソロデビュー", "バンドと並行して活動"]];
stats.forEach(([num, unit, sub], i) => {
  const y = 1.7 + i * 1.6;
  s.addText([
    { text: num, options: { fontSize: 36, bold: true, color: C.accent1 } },
    { text: unit, options: { fontSize: 16, bold: true, color: C.text2, breakLine: true } },
    { text: sub, options: { fontSize: 13, color: "4A5A60" } },
  ], { isTextBox: true, x: 8.4, y, w: 4.3, h: 1.35, fill: { color: C.background2 }, margin: [8, 16, 8, 16], valign: "middle", objectName: `stat-${i}` });
});
s.addNotes("桑田佳祐はサザンの中心人物。妻はサザンのキーボード担当の原由子で、1982年に結婚した。ソロ活動とバンド活動を行き来しているのが特徴。");

// ---------- 3. メンバー構成図 ----------
pres.addSection({ title: "バンドの歩み" });
s = content("バンドの歩み", "メンバー構成 ― 6人で結成、現在は5人");
// 源流
s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3.65, y: 1.55, w: 6.0, h: 0.75, fill: { color: C.background2 }, line: { color: C.accent2, width: 1.5 }, rectRadius: 0.1, objectName: "origin" });
tb(s, "源流: 青山学院大学の音楽サークル「Better Days」", { x: 3.65, y: 1.55, w: 6.0, h: 0.75, fontSize: 15, align: "center", valign: "middle", color: C.text2 });
s.addShape(pres.shapes.LINE, { x: 6.65, y: 2.3, w: 0, h: 0.75, line: { color: C.accent2, width: 2, endArrowType: "triangle" }, objectName: "origin-arrow" });
// 中心
s.addShape(pres.shapes.OVAL, { x: 5.15, y: 3.05, w: 3.0, h: 1.5, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: "band" });
tb(s, [{ text: "サザンオールスターズ", options: { bold: true, breakLine: true } }, { text: "1978年デビュー", options: { fontSize: 13 } }], { x: 5.15, y: 3.05, w: 3.0, h: 1.5, fontSize: 16, align: "center", valign: "middle", color: C.background1 });
const members = [
  ["桑田佳祐", "ボーカル・ギター", 0.6, 2.6, false],
  ["原由子", "キーボード・ボーカル", 0.6, 4.0, false],
  ["関口和之", "ベース", 0.6, 5.4, false],
  ["松田弘", "ドラムス", 9.7, 2.6, false],
  ["野沢秀行", "パーカッション", 9.7, 4.0, false],
  ["大森隆志", "ギター（2001年に脱退）", 9.7, 5.4, true],
];
members.forEach(([name, role, x, y, former], i) => {
  const w = 3.0, h = 1.05;
  const left = x < 5;
  // 中心の楕円の左右の端へ結ぶ
  const x1 = left ? x + w : 8.15, x2 = left ? 5.15 : x;
  const yc = y + h / 2, cy = 3.8;
  s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(yc, cy), w: Math.abs(x2 - x1), h: Math.abs(cy - yc) || 0.001, flipV: (left && yc > cy) || (!left && yc < cy), line: { color: former ? "9AA5AB" : HEX.accent4, width: 1.5, dashType: former ? "dash" : "solid" }, objectName: `link-${i}` });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: former ? "F1F3F4" : C.background1 }, line: { color: former ? "9AA5AB" : HEX.accent4, width: 1.5, dashType: former ? "dash" : "solid" }, objectName: `member-${i}` });
  tb(s, [{ text: name, options: { bold: true, fontSize: 16, breakLine: true } }, { text: role, options: { fontSize: 13 } }], { x, y, w, h, align: "center", valign: "middle", color: former ? "6B7A80" : C.text1 });
});
tb(s, "実線: 現メンバー　破線: 元メンバー", { x: 0.6, y: 6.75, w: 6, h: 0.35, fontSize: 12, color: "4A5A60" });
s.addNotes("サザンオールスターズは青山学院大学の音楽サークル「Better Days」のメンバーを中心に結成された。ギターの大森隆志は2001年に脱退し、現在は5人。原由子は桑田佳祐の妻。パーカッションの野沢秀行は「毛ガニ」の愛称で知られる。");

// ---------- 4. 年表フロー ----------
s = content("バンドの歩み", "年表 ― 休止と再始動をくり返しながら続く活動");
const events = [
  ["1978", "「勝手にシンドバッド」でデビュー"],
  ["1979", "「いとしのエリー」がヒット"],
  ["1986", "バンドは活動休止、桑田はKUWATA BANDへ"],
  ["1988", "デビュー10周年で活動再開"],
  ["2000", "「TSUNAMI」が日本レコード大賞"],
  ["2008", "30周年を区切りに無期限活動休止"],
  ["2013", "デビュー35周年で再始動"],
  ["2025", "16作目のアルバム『THANK YOU SO MUCH』"],
];
const bw = 2.55, bh = 1.75, gap = 0.6, x0 = 0.6;
events.forEach(([year, label], i) => {
  const row = Math.floor(i / 4), col = row === 0 ? i % 4 : 3 - (i % 4); // 2段目は右から左へ折り返す
  const x = x0 + col * (bw + gap), y = row === 0 ? 1.75 : 4.55;
  const pause = label.includes("休止");
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: bw, h: bh, rectRadius: 0.12, fill: { color: pause ? "F1F3F4" : C.background2 }, line: { color: pause ? "9AA5AB" : HEX.accent2, width: 1.5 }, objectName: `event-${i}` });
  tb(s, [{ text: year, options: { fontSize: 22, bold: true, color: pause ? "6B7A80" : C.accent1, breakLine: true } }, { text: label, options: { fontSize: 14 } }], { x: x + 0.15, y: y + 0.1, w: bw - 0.3, h: bh - 0.2, align: "center", valign: "middle" });
  if (i < events.length - 1) {
    if (i === 3) {
      s.addShape(pres.shapes.LINE, { x: x + bw / 2, y: y + bh, w: 0, h: 4.55 - (y + bh), line: { color: HEX.accent4, width: 2, endArrowType: "triangle" }, objectName: "arrow-turn" });
    } else if (row === 0) {
      s.addShape(pres.shapes.LINE, { x: x + bw + 0.08, y: y + bh / 2, w: gap - 0.16, h: 0, line: { color: HEX.accent4, width: 2, endArrowType: "triangle" }, objectName: `arrow-${i}` });
    } else {
      s.addShape(pres.shapes.LINE, { x: x - gap + 0.08, y: y + bh / 2, w: gap - 0.16, h: 0, flipH: true, line: { color: HEX.accent4, width: 2, endArrowType: "triangle" }, objectName: `arrow-${i}` });
    }
  }
});
tb(s, "灰色の枠: 活動休止", { x: 0.6, y: 6.75, w: 6, h: 0.35, fontSize: 12, color: "4A5A60" });
s.addNotes("1978年のデビュー後、1986年にバンドとしての活動をいったん休止し、1988年に再開した。2008年にはデビュー30周年を区切りに無期限活動休止に入り、2013年に再始動。2025年には前作『葡萄』（2015年）から10年ぶりとなるオリジナルアルバムを発表した。");

// ---------- 5. 桑田の活動の広がり ----------
pres.addSection({ title: "桑田佳祐" });
s = content("桑田佳祐", "桑田佳祐の活動の広がり");
s.addShape(pres.shapes.OVAL, { x: 5.3, y: 3.1, w: 2.7, h: 1.4, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: "hub" });
tb(s, "桑田佳祐", { x: 5.3, y: 3.1, w: 2.7, h: 1.4, fontSize: 20, bold: true, align: "center", valign: "middle", color: C.background1 });
const spokes = [
  ["サザンオールスターズ", "1978年〜　活動の本拠地となるバンド", 0.6, 1.65],
  ["KUWATA BAND", "1986年　期間限定のバンド\n「BAN BAN BAN」など", 8.73, 1.65],
  ["ソロ", "1987年〜　「波乗りジョニー」\n「白い恋人達」（ともに2001年）", 0.6, 4.85],
  ["映画監督", "1990年『稲村ジェーン』\nサザンの「真夏の果実」を制作", 8.73, 4.85],
];
spokes.forEach(([head, body, x, y], i) => {
  const w = 4.0, h = 1.6, left = x < 5, top = y < 3;
  const x1 = left ? x + w : 8.0 - 0.35, x2 = left ? 5.3 + 0.35 : x;
  const y1 = top ? y + h : 4.3, y2 = top ? 3.3 : y;
  s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipV: left !== top, line: { color: HEX.accent4, width: 1.5 }, objectName: `spoke-${i}` });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: HEX.accent2, width: 1.5 }, objectName: `activity-${i}` });
  tb(s, [{ text: head, options: { bold: true, fontSize: 18, color: C.text2, breakLine: true } }, { text: body, options: { fontSize: 14 } }], { x: x + 0.2, y: y + 0.1, w: w - 0.4, h: h - 0.2, valign: "middle" });
});
s.addNotes("桑田佳祐はサザンオールスターズを本拠地にしながら、1986年のKUWATA BAND、1987年からのソロ活動、1990年の映画監督と、活動の幅を広げてきた。ソロでは2001年に「波乗りジョニー」「白い恋人達」がヒットした。");

// ---------- 6. グラフ: 年代別アルバム数 ----------
pres.addSection({ title: "作品" });
s = content("作品", "オリジナルアルバムは16作 ― 1980年代に集中");
s.addChart(pres.charts.BAR, [{ name: "オリジナルアルバム数", labels: ["1970年代", "1980年代", "1990年代", "2000年代", "2010年代", "2020年代"], values: [2, 6, 5, 1, 1, 1] }], {
  x: 0.6, y: 1.6, w: 7.6, h: 5.2, barDir: "col",
  showTitle: true, title: "年代別のオリジナルアルバム数（枚）", titleFontSize: 14, titleColor: HEX.dk2, titleFontFace: "+mn-lt",
  chartColors: [HEX.accent2], showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 14, dataLabelColor: HEX.dk1, dataLabelFontFace: "+mn-lt",
  catAxisLabelColor: "4A5A60", valAxisLabelColor: "4A5A60", catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt", catAxisLabelFontSize: 12, valAxisLabelFontSize: 12,
  valAxisMaxVal: 7, valAxisMajorUnit: 1, valGridLine: { color: "DDE5E7", size: 0.75 }, catGridLine: { style: "none" }, showLegend: false,
  objectName: "album-chart",
});
s.addText([
  { text: "1980年代はほぼ毎年1作のペース", options: { bullet: true, breakLine: true } },
  { text: "2005年『キラーストリート』、2015年『葡萄』、2025年『THANK YOU SO MUCH』と、2000年代以降は10年に1作", options: { bullet: true, breakLine: true } },
  { text: "デビュー作は1978年の『熱い胸さわぎ』", options: { bullet: true } },
], { isTextBox: true, x: 8.6, y: 1.8, w: 4.1, h: 4.8, fontSize: 16, color: C.text1, paraSpaceAfter: 14, valign: "top", margin: 0, objectName: "chart-notes" });
s.addNotes("サザンのオリジナルアルバムは全16作。1970年代2作、1980年代6作、1990年代5作（1990年の『稲村ジェーン』を含む）、2000年代以降は各年代1作ずつ。");

// ---------- 7. 代表曲の表（図なし） ----------
s = content("作品", "代表曲");
const head = (t) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk2 } } });
const rows = [
  [head("曲名"), head("発表年"), head("ポイント")],
  ["勝手にシンドバッド", "1978", "デビューシングル"],
  ["いとしのエリー", "1979", "初期を代表するバラード"],
  ["真夏の果実", "1990", "桑田が監督した映画『稲村ジェーン』のための曲"],
  ["エロティカ・セブン", "1993", "アップテンポのヒット曲"],
  ["TSUNAMI", "2000", "300万枚に迫る大ヒット。日本レコード大賞を受賞"],
  ["ピースとハイライト", "2013", "再始動のシングル。4つの年代でシングル1位を記録"],
];
s.addTable(rows, { x: 0.6, y: 1.65, w: 12.1, colW: [3.2, 1.4, 7.5], fontSize: 16, color: HEX.dk1, rowH: 0.62, border: { type: "solid", pt: 0.75, color: "C9D6D8" }, fill: { color: HEX.lt1 }, valign: "middle", margin: [4, 10, 4, 10], objectName: "songs-table" });
s.addNotes("「TSUNAMI」は2000年に発売され、売上は300万枚に迫り、同年の日本レコード大賞を受賞した。「ピースとハイライト」で1980年代・1990年代・2000年代・2010年代の4つの年代でシングル1位を獲得した。");

// ---------- 8. 楽曲マップ（配置に意味がある図） ----------
s = content("作品", "楽曲マップ ― どの年代にもバラードとアップテンポのヒット");
const px = (v) => 1.6 + v * 9.6;          // 曲調 0(バラード)〜1(アップテンポ)
const py = (yr) => 6.3 - ((yr - 1975) / 45) * 4.5; // 発表年
s.addShape(pres.shapes.LINE, { x: 1.4, y: 6.4, w: 10.2, h: 0, line: { color: "6B7A80", width: 1.5, endArrowType: "triangle" }, objectName: "x-axis" });
s.addShape(pres.shapes.LINE, { x: 1.4, y: 1.6, w: 0, h: 4.8, flipV: true, line: { color: "6B7A80", width: 1.5, endArrowType: "triangle" }, objectName: "y-axis" });
tb(s, "バラード", { x: 1.6, y: 6.5, w: 2, h: 0.35, fontSize: 13, color: "4A5A60" });
tb(s, "アップテンポ", { x: 9.6, y: 6.5, w: 2, h: 0.35, fontSize: 13, color: "4A5A60", align: "right" });
tb(s, "曲調 →", { x: 5.6, y: 6.5, w: 2, h: 0.35, fontSize: 13, color: "4A5A60", align: "center" });
[1980, 1990, 2000, 2010].forEach((yr) => tb(s, `${yr}`, { x: 0.55, y: py(yr) - 0.17, w: 0.75, h: 0.35, fontSize: 12, color: "4A5A60", align: "right" }));
tb(s, "発表年", { x: 0.55, y: 1.45, w: 0.8, h: 0.35, fontSize: 12, color: "4A5A60", align: "right" });
const songs = [["勝手にシンドバッド", 0.92, 1978], ["いとしのエリー", 0.08, 1979], ["真夏の果実", 0.2, 1990], ["エロティカ・セブン", 0.85, 1993], ["TSUNAMI", 0.12, 2000], ["ピースとハイライト", 0.7, 2013]];
songs.forEach(([name, tempo, yr], i) => {
  const cx = px(tempo), cy = py(yr), ballad = tempo < 0.5;
  s.addShape(pres.shapes.OVAL, { x: cx - 0.14, y: cy - 0.14, w: 0.28, h: 0.28, fill: { color: ballad ? C.accent2 : C.accent1 }, line: { color: C.background1, width: 1 }, objectName: `song-dot-${i}` });
  tb(s, `${name}（${yr}）`, { x: ballad ? cx + 0.25 : cx - 3.45, y: cy - 0.2, w: 3.2, h: 0.4, fontSize: 14, align: ballad ? "left" : "right", valign: "middle" });
});
tb(s, "※ 曲調の位置は講師による一例", { x: 8.2, y: 6.95, w: 3.8, h: 0.35, fontSize: 11, color: "6B7A80", align: "right" });
s.addNotes("横軸は曲調（左がバラード、右がアップテンポ）、縦軸は発表年（上ほど新しい）。曲調の位置は講師による一例で、厳密な分類ではない。どの年代にもバラードとアップテンポの両方のヒット曲があることが読み取れる。");

// ---------- 9. まとめ（図なし） ----------
pres.addSection({ title: "まとめ" });
s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "まとめ" });
tb(s, "まとめ", { x: 0.9, y: 0.7, w: 11.5, h: 0.9, fontSize: 36, bold: true, color: C.background1 });
const points = [
  ["01", "学生サークルから国民的バンドへ", "青山学院大学のサークル仲間で結成し、1978年にデビューした"],
  ["02", "休止と再始動をくり返して続く", "1986年・2008年の休止を経て、2025年に16作目のアルバムを発表"],
  ["03", "桑田佳祐の幅広い活動", "バンド・KUWATA BAND・ソロ・映画監督と活動の場を広げてきた"],
];
points.forEach(([no, head, body], i) => {
  const x = 0.9 + i * 3.95;
  s.addText([
    { text: no, options: { fontSize: 28, bold: true, color: C.accent3, breakLine: true } },
    { text: head, options: { fontSize: 18, bold: true, color: C.background1, breakLine: true } },
    { text: body, options: { fontSize: 14, color: "CFE3E1" } },
  ], { isTextBox: true, x, y: 2.2, w: 3.6, h: 2.8, fill: { color: "1C4A53" }, margin: [16, 18, 16, 18], valign: "top", paraSpaceAfter: 10, objectName: `point-${i}` });
});
s.addNotes("全体のまとめ。結成の経緯、休止と再始動の歴史、桑田佳祐の活動の広がりの3点を押さえる。");

(async () => {
  await pres.writeFile({ fileName: "southern_all_stars.pptx" });
  await applyTheme("southern_all_stars.pptx", THEME);
  console.log("written");
})();
