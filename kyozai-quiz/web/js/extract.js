// pptx（zip の中の XML）からスライドのテキスト・発表者ノートを取り出し、図を含むかを判定する。
// OCR は使わない。Python 版 kyozai_quiz/extract.py と同じ判定をする。
import JSZip from "jszip";

const NS = {
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  c: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  pkg: "http://schemas.openxmlformats.org/package/2006/relationships",
};
const URI = {
  chart: "http://schemas.openxmlformats.org/drawingml/2006/chart",
  table: "http://schemas.openxmlformats.org/drawingml/2006/table",
  smartart: "http://schemas.openxmlformats.org/drawingml/2006/diagram",
};

export const KIND = { picture: "picture", chart: "chart", smartart: "smartart", shape: "shape", group: "group" };

const parse = (xml) => new DOMParser().parseFromString(xml, "application/xml");
const kids = (el, ns, name) => [...el.childNodes].filter((n) => n.nodeType === 1 && n.namespaceURI === ns && (!name || n.localName === name));
const kid = (el, ns, name) => (el ? kids(el, ns, name)[0] ?? null : null);
const all = (el, ns, name) => [...el.getElementsByTagNameNS(ns, name)];

function resolve(base, target) {
  // base: "ppt/slides/slide1.xml", target: "../charts/chart1.xml" → "ppt/charts/chart1.xml"
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

async function readXml(zip, path) {
  const file = zip.file(path);
  return file ? parse(await file.async("string")) : null;
}

async function readRels(zip, partPath) {
  const dir = partPath.split("/").slice(0, -1).join("/");
  const name = partPath.split("/").pop();
  const doc = await readXml(zip, `${dir}/_rels/${name}.rels`);
  const rels = new Map();
  if (!doc) return rels;
  for (const rel of all(doc, NS.pkg, "Relationship")) {
    const external = rel.getAttribute("TargetMode") === "External";
    rels.set(rel.getAttribute("Id"), {
      type: rel.getAttribute("Type") || "",
      target: external ? null : resolve(partPath, rel.getAttribute("Target")),
    });
  }
  return rels;
}

export async function extractSlides(data, { minPictureAreaRatio = 0.01 } = {}) {
  const zip = await JSZip.loadAsync(data);
  const presPath = "ppt/presentation.xml";
  const pres = await readXml(zip, presPath);
  if (!pres) throw new Error("pptx ではありません（ppt/presentation.xml がない）");
  const sldSz = all(pres, NS.p, "sldSz")[0];
  const slideArea = (Number(sldSz?.getAttribute("cx")) || 1) * (Number(sldSz?.getAttribute("cy")) || 1);
  const presRels = await readRels(zip, presPath);

  const slides = [];
  let pageNumber = 0;
  for (const sldId of all(pres, NS.p, "sldId")) {
    const path = presRels.get(sldId.getAttributeNS(NS.r, "id"))?.target;
    const doc = path && (await readXml(zip, path));
    if (!doc) continue;
    pageNumber += 1;
    const rels = await readRels(zip, path);
    const ctx = { zip, rels, slideArea, minPictureAreaRatio, texts: [], kinds: new Set() };
    const spTree = all(doc, NS.p, "spTree")[0];
    if (spTree) for (const el of readingOrder(spTree)) await walk(el, ctx);
    slides.push({
      pageNumber,
      text: ctx.texts.filter((t) => t.trim()).join("\n"),
      notes: await notesText(zip, rels),
      figureKinds: [...ctx.kinds].sort(),
      hidden: doc.documentElement.getAttribute("show") === "0",
    });
  }
  return slides;
}

const SHAPE_TAGS = new Set(["sp", "pic", "graphicFrame", "grpSp", "cxnSp"]);

function readingOrder(container) {
  const shapes = kids(container, NS.p).filter((el) => SHAPE_TAGS.has(el.localName));
  return shapes
    .map((el, i) => ({ el, i, ...offset(el) }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.i - b.i)
    .map((s) => s.el);
}

function xfrm(el) {
  const sp = kid(el, NS.p, "spPr") || kid(el, NS.p, "grpSpPr");
  return sp ? kid(sp, NS.a, "xfrm") : kid(el, NS.p, "xfrm");
}

function offset(el) {
  const off = kid(xfrm(el), NS.a, "off");
  return { x: Number(off?.getAttribute("x")) || 0, y: Number(off?.getAttribute("y")) || 0 };
}

function extent(el) {
  const ext = kid(xfrm(el), NS.a, "ext");
  return (Number(ext?.getAttribute("cx")) || 0) * (Number(ext?.getAttribute("cy")) || 0);
}

async function walk(el, ctx) {
  switch (el.localName) {
    case "grpSp":
      ctx.kinds.add(KIND.group);
      for (const child of readingOrder(el)) await walk(child, ctx);
      return;
    case "pic":
      if (extent(el) / ctx.slideArea >= ctx.minPictureAreaRatio) ctx.kinds.add(KIND.picture);
      return;
    case "cxnSp": // コネクタ（矢印線）
      ctx.kinds.add(KIND.shape);
      return;
    case "graphicFrame":
      return graphicFrame(el, ctx);
    case "sp": {
      const nv = kid(el, NS.p, "nvSpPr");
      const isPlaceholder = !!kid(kid(nv, NS.p, "nvPr"), NS.p, "ph");
      const isTextBox = kid(nv, NS.p, "cNvSpPr")?.getAttribute("txBox") === "1";
      if (!isPlaceholder && !isTextBox) ctx.kinds.add(KIND.shape);
      const body = kid(el, NS.p, "txBody");
      if (body) {
        const text = paragraphs(body).filter((t) => t.trim()).join("\n");
        if (text) ctx.texts.push(text);
      }
      return;
    }
  }
}

function paragraphs(txBody) {
  return kids(txBody, NS.a, "p").map((p) =>
    [...p.childNodes]
      .filter((n) => n.nodeType === 1)
      .map((n) => (n.localName === "br" ? "\n" : all(n, NS.a, "t").map((t) => t.textContent).join("")))
      .join(""),
  );
}

async function graphicFrame(el, ctx) {
  const data = all(el, NS.a, "graphicData")[0];
  const uri = data?.getAttribute("uri");
  if (uri === URI.chart) {
    ctx.kinds.add(KIND.chart);
    const target = ctx.rels.get(all(data, NS.c, "chart")[0]?.getAttributeNS(NS.r, "id"))?.target;
    const doc = target && (await readXml(ctx.zip, target));
    ctx.texts.push(doc ? chartText(doc) : "[グラフ]");
  } else if (uri === URI.table) {
    // 表は構造ごと取れるので、図ではなくテキスト（マークダウン表）として扱う
    const tbl = all(data, NS.a, "tbl")[0];
    if (tbl) ctx.texts.push(tableMarkdown(tbl));
  } else if (uri === URI.smartart) {
    ctx.kinds.add(KIND.smartart);
    // SmartArt の文字はスライド本体ではなく diagram data パートにある
    const relIds = all(data, URI.smartart, "relIds")[0];
    const target = ctx.rels.get(relIds?.getAttributeNS(NS.r, "dm"))?.target;
    const doc = target && (await readXml(ctx.zip, target));
    const text = doc ? all(doc, NS.a, "t").map((t) => t.textContent.trim()).filter(Boolean).join(" / ") : "";
    if (text) ctx.texts.push(`[SmartArt] ${text}`);
  }
}

function chartText(doc) {
  const title = all(doc, NS.c, "title")[0];
  const lines = [`[グラフ] ${title ? all(title, NS.a, "t").map((t) => t.textContent).join("") : ""}`.trimEnd()];
  const plotArea = all(doc, NS.c, "plotArea")[0];
  for (const plot of plotArea ? kids(plotArea, NS.c).filter((n) => n.localName.endsWith("Chart")) : []) {
    const series = kids(plot, NS.c, "ser");
    const cat = series[0] && kid(series[0], NS.c, "cat");
    const categories = cat ? points(cat) : [];
    if (categories.length) lines.push(`項目: ${categories.join(", ")}`);
    for (const ser of series) {
      const tx = kid(ser, NS.c, "tx");
      const name = tx ? all(tx, NS.c, "v").map((v) => v.textContent).join("") : "";
      const val = kid(ser, NS.c, "val");
      const values = val ? points(val).map((v) => (v === "" ? "" : String(Number(v)))) : [];
      lines.push(`系列「${name}」: ${values.join(", ")}`);
    }
  }
  return lines.join("\n");
}

function points(el) {
  return all(el, NS.c, "pt")
    .sort((a, b) => Number(a.getAttribute("idx")) - Number(b.getAttribute("idx")))
    .map((pt) => all(pt, NS.c, "v")[0]?.textContent ?? "");
}

function tableMarkdown(tbl) {
  const cell = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>").trim();
  const rows = kids(tbl, NS.a, "tr").map((tr) =>
    kids(tr, NS.a, "tc").map((tc) => {
      const body = kid(tc, NS.a, "txBody");
      return cell(body ? paragraphs(body).join("\n") : "");
    }),
  );
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
  return [
    `| ${pad[0].join(" | ")} |`,
    `|${"---|".repeat(width)}`,
    ...pad.slice(1).map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

async function notesText(zip, rels) {
  const rel = [...rels.values()].find((r) => r.type.endsWith("/notesSlide"));
  const doc = rel?.target && (await readXml(zip, rel.target));
  if (!doc) return "";
  for (const sp of all(doc, NS.p, "sp")) {
    const ph = all(sp, NS.p, "ph")[0];
    if (ph?.getAttribute("type") === "body") {
      const body = kid(sp, NS.p, "txBody");
      return body ? paragraphs(body).join("\n").trim() : "";
    }
  }
  return "";
}
