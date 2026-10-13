// ブラウザでだけ使う部品: PDF のページを PNG にする（pdf.js）、Mermaid の構文チェックと描画。
import * as pdfjs from "pdfjs-dist";
import { basicMermaidCheck } from "./pipeline.js";

pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs";

// 1インチ = 72pt。150dpi 相当（Python 版の既定と同じ）
const SCALE = 150 / 72;

/** PDF の各ページを PNG（base64、data: の接頭辞なし）にする */
export async function renderPdfToPngs(data, onProgress) {
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const images = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      images.push(canvas.toDataURL("image/png").split(",")[1]);
      page.cleanup();
      onProgress?.(n, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return images;
}

let mermaidPromise = null;
async function loadMermaid() {
  mermaidPromise ??= import("mermaid")
    .then(({ default: mermaid }) => {
      const dark = matchMedia("(prefers-color-scheme: dark)").matches;
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
      return mermaid;
    })
    .catch(() => null);
  return mermaidPromise;
}

/** Mermaid のコードごとに、問題なければ null、構文エラーならその内容を返す */
export async function validateMermaid(codes) {
  if (!codes.length) return [];
  const mermaid = await loadMermaid();
  if (!mermaid) return codes.map(basicMermaidCheck); // 読み込めないときは簡易チェック
  const results = [];
  for (const code of codes) {
    try {
      await mermaid.parse(code);
      results.push(null);
    } catch (e) {
      results.push(String(e?.message ?? e).slice(0, 2000));
    }
  }
  return results;
}

let renderCount = 0;
export async function renderMermaid(code) {
  const mermaid = await loadMermaid();
  if (!mermaid) return null;
  try {
    const { svg } = await mermaid.render(`mmd-${Date.now()}-${renderCount++}`, code);
    return svg;
  } catch {
    return null;
  }
}
