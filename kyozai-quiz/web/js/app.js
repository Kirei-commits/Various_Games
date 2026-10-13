// 画面。データはこのブラウザの IndexedDB にだけ保存し、Gemini API はブラウザから直接呼ぶ。
import { extractSlides } from "./extract.js";
import { GeminiClient, DAILY_QUOTA_MESSAGE } from "./gemini.js";
import {
  ALL_TYPES, STATUS, TYPE_NAMES, analyzePages, generateQuestions, metaGroups, parsePages,
  registerMaterial, selectForRegeneration, selectUnprocessed, toJson, toMarkdown,
} from "./pipeline.js";
import { FIGURE_PROMPT_VERSION } from "./prompts.js";
import { IndexedDbStore } from "./store.js";

const view = document.getElementById("view");
let store;
let busy = false;

// ---------------- 設定 ----------------

const SETTINGS_KEY = "kyozai-quiz.settings";
const DEFAULTS = { apiKey: "", vlmModel: "gemini-3.6-flash", questionModel: "gemini-3.6-flash", rpm: 4, pagesPerCall: 5 };

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
let settings = loadSettings();

const clients = new Map();
function client(model) {
  // 同じモデルの呼び出しは同じ client を使い、呼び出し間隔の制限を処理をまたいで効かせる
  const key = `${settings.apiKey}\u0000${model}\u0000${settings.rpm}`;
  if (!clients.has(key)) clients.set(key, new GeminiClient({ apiKey: settings.apiKey, model, rpm: Number(settings.rpm) }));
  return clients.get(key);
}

// ---------------- 小物 ----------------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" }) : "");
const KIND_NAMES = { picture: "画像", chart: "グラフ", smartart: "SmartArt", shape: "図形", group: "グループ" };
const STATUS_CHIPS = {
  [STATUS.none]: '<span class="chip">図なし</span>',
  [STATUS.unprocessed]: '<span class="chip warn">未処理</span>',
  [STATUS.done]: '<span class="chip ok">解析済み</span>',
};

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function markdownTable(md) {
  const rows = md.trim().split("\n").filter((l) => l.trim().startsWith("|"));
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => esc(c.trim().replace(/\\\|/g, "|")).replace(/&lt;br&gt;/g, "<br>"));
  const body = rows.filter((l) => !/^\|?\s*:?-{3,}/.test(l.trim()));
  if (!body.length) return `<pre>${esc(md)}</pre>`;
  const [head, ...rest] = body;
  return `<table class="md"><thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rest
    .map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function updateKeyStatus() {
  const el = document.getElementById("key-status");
  el.className = `chip ${settings.apiKey ? "ok" : "warn"}`;
  el.textContent = settings.apiKey ? "API キー設定済み" : "API キー未設定";
}

// ---------------- 処理の進み具合 ----------------

const joblog = document.getElementById("joblog");
document.getElementById("job-close").onclick = () => { if (!busy) joblog.hidden = true; };

function log(text, cls = "") {
  const li = Object.assign(document.createElement("li"), { textContent: text, className: cls });
  document.getElementById("job-lines").append(li);
  li.scrollIntoView({ block: "nearest" });
}

async function runJob(title, fn) {
  if (busy) return alert("ほかの処理が終わるまで待ってください");
  busy = true;
  // 1日の上限は時間がたてば戻るので、処理を始めるたびに試し直す
  for (const c of clients.values()) c.dailyQuotaExceeded = false;
  document.body.classList.add("busy");
  document.querySelectorAll("[data-job]").forEach((b) => (b.disabled = true));
  document.getElementById("job-title").textContent = title;
  document.getElementById("job-lines").replaceChildren();
  joblog.hidden = false;
  try {
    await fn();
    document.getElementById("job-title").textContent = `${title}（完了）`;
  } catch (e) {
    log(`エラー: ${e.message}`, "ng");
    document.getElementById("job-title").textContent = `${title}（失敗）`;
  } finally {
    busy = false;
    document.body.classList.remove("busy");
    await route();
    // 問題なく終わったら、しばらくして進み具合の表示を片づける（失敗があれば残す）
    if (!document.querySelector("#job-lines li.ng")) {
      setTimeout(() => { if (!busy) joblog.hidden = true; }, 5000);
    }
  }
}

function reportFigure(o) {
  if (o.success) {
    const rej = o.mermaidRejected ? `、構文エラーで ${o.mermaidRejected}件を破棄` : "";
    log(`p.${o.pageNumber} 図の説明文を保存（Mermaid ${o.mermaidCount}件${rej}）`, "ok");
  } else if (o.error.startsWith("DailyQuotaExceeded")) {
    log(`p.${o.pageNumber} 未処理: 1日の上限に達したため API を呼んでいません`, "ng");
  } else {
    log(`p.${o.pageNumber} 未処理として記録: ${o.error}`, "ng");
  }
}

function summarize(outcomes) {
  const failed = outcomes.filter((o) => !o.success);
  log(`成功 ${outcomes.length - failed.length} / 失敗 ${failed.length}`);
  if (failed.some((o) => o.error.startsWith("DailyQuotaExceeded"))) log(DAILY_QUOTA_MESSAGE, "ng");
  else if (failed.length) log("失敗したページは「未処理を再実行」で再実行できます。");
}

async function analyze(pages, { keepPreviousOnFailure = false } = {}) {
  const c = client(settings.vlmModel);
  const { validateMermaid } = await import("./browser.js");
  log(`図の解析: ${pages.length}ページ（モデル ${c.modelName} / プロンプト ${FIGURE_PROMPT_VERSION}）`);
  summarize(await analyzePages({ store, client: c, validateMermaid, pages, keepPreviousOnFailure, onDone: reportFigure }));
}

// ---------------- 画面: 教材一覧と登録 ----------------

async function renderHome() {
  const materials = await store.listMaterials();
  const summaries = await Promise.all(
    materials.map(async (m) => {
      const pages = await store.getPages(m.id);
      const questions = await store.getQuestions(m.id);
      return { m, figures: pages.filter((p) => p.hasFigure).length, unprocessed: pages.filter((p) => p.figureStatus === STATUS.unprocessed).length, questions: questions.length };
    }),
  );
  view.innerHTML = `
    ${settings.apiKey ? "" : `<div class="notice warn">最初に <a href="#/settings">設定</a> で Gemini の API キーを入れてください。キーがなくても登録はできます（図の解析は「未処理」になり、あとで実行できます）。</div>`}
    <section class="card">
      <h1>教材を登録</h1>
      <p class="muted">pptx と、同じ pptx から書き出した PDF を選んでください。テキスト・発表者ノートは pptx から、ページ画像は PDF から作ります。図を含むページだけ Gemini で解析します。</p>
      <form id="register" class="stack">
        <div class="grid2">
          <div class="field"><label for="pptx">pptx ファイル</label><input id="pptx" type="file" accept=".pptx" required></div>
          <div class="field"><label for="pdf">PDF ファイル</label><input id="pdf" type="file" accept=".pdf,application/pdf" required>
            <div class="hint">PowerPoint なら「ファイル → エクスポート → PDF」、Google スライドなら「ファイル → ダウンロード → PDF」</div></div>
          <div class="field"><label for="title">タイトル（省略可）</label><input id="title" type="text" placeholder="省略するとファイル名"></div>
          <div class="field"><label for="mid">教材ID（省略可）</label><input id="mid" type="text" placeholder="省略するとファイル名から作る"></div>
        </div>
        <div class="row"><button type="submit" data-job>登録する</button><span class="muted small">サンプル: <a href="samples/southern_all_stars.pptx" download>pptx</a> / <a href="samples/southern_all_stars.pdf" download>PDF</a>（サザンオールスターズと桑田佳祐）</span></div>
      </form>
    </section>
    <section>
      <h2>登録済みの教材</h2>
      ${summaries.length ? `<div class="materials">${summaries.map(({ m, figures, unprocessed, questions }) => `
        <a class="card material" href="#/m/${encodeURIComponent(m.id)}">
          <h3>${esc(m.title)}</h3>
          <div class="muted small">ID: ${esc(m.id)} ・ ${fmtDate(m.registeredAt)}</div>
          <div class="stats"><span class="chip">${m.pageCount}ページ</span><span class="chip accent">図あり ${figures}</span>${unprocessed ? `<span class="chip warn">未処理 ${unprocessed}</span>` : ""}<span class="chip">問題 ${questions}問</span></div>
        </a>`).join("")}</div>` : '<p class="muted">まだありません。</p>'}
      <p class="muted small">データはこのブラウザの中にだけ保存されます（ほかの端末やブラウザからは見えません）。</p>
    </section>`;

  document.getElementById("register").onsubmit = (e) => {
    e.preventDefault();
    const pptx = document.getElementById("pptx").files[0];
    const pdf = document.getElementById("pdf").files[0];
    const title = document.getElementById("title").value.trim();
    const materialId = document.getElementById("mid").value.trim();
    runJob("教材の登録", async () => {
      log("pptx からテキスト・発表者ノートを取り出し、図を含むかを判定しています");
      const slides = await extractSlides(await pptx.arrayBuffer());
      log(`スライド ${slides.length}枚（図あり ${slides.filter((s) => s.figureKinds.length).length}枚）`);
      const { renderPdfToPngs } = await import("./browser.js");
      const images = await renderPdfToPngs(new Uint8Array(await pdf.arrayBuffer()), (n, total) => {
        if (n === total || n % 5 === 0) log(`PDF をページ画像にしています ${n}/${total}`);
      });
      const { material, figurePages } = await registerMaterial(store, { slides, images, fileName: pptx.name, materialId: materialId || null, title: title || null });
      log(`登録しました: 教材ID ${material.id}`, "ok");
      location.hash = `#/m/${encodeURIComponent(material.id)}`;
      if (!figurePages.length) return;
      if (!settings.apiKey) {
        log("API キーが未設定のため図の解析をスキップしました（図ページは未処理）。設定してから「未処理を再実行」してください。", "ng");
        return;
      }
      await analyze(selectUnprocessed(await store.getPages(material.id)));
    });
  };
}

// ---------------- 画面: 教材 ----------------

async function renderMaterial(id, tab) {
  const material = await store.getMaterial(id);
  if (!material) {
    view.innerHTML = `<div class="card"><p>教材が見つかりません: ${esc(id)}</p><a href="#/">一覧へ</a></div>`;
    return;
  }
  const pages = await store.getPages(id);
  const questions = await store.getQuestions(id);
  const unprocessed = selectUnprocessed(pages);
  const base = `#/m/${encodeURIComponent(id)}`;
  view.innerHTML = `
    <section class="card">
      <div class="row"><div class="grow"><h1>${esc(material.title)}</h1>
        <div class="muted small">ID: ${esc(material.id)} ・ ${esc(material.sourceFilename)} ・ ${fmtDate(material.registeredAt)}</div></div>
        ${unprocessed.length ? `<button id="retry" data-job>未処理を再実行（${unprocessed.length}ページ）</button>` : ""}
        <button id="delete" class="danger" data-job>削除</button></div>
      <div class="stats"><span class="chip">${material.pageCount}ページ</span><span class="chip accent">図あり ${pages.filter((p) => p.hasFigure).length}</span>${unprocessed.length ? `<span class="chip warn">未処理 ${unprocessed.length}</span>` : ""}<span class="chip">問題 ${questions.length}問</span></div>
    </section>
    <div class="tabs" role="tablist">
      ${[["pages", "ページ"], ["questions", "問題"], ["regenerate", "再生成"]].map(([key, name]) => `<button role="tab" aria-selected="${tab === key}" data-tab="${key}">${name}</button>`).join("")}
    </div>
    <div id="tab"></div>`;
  view.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => (location.hash = `${base}/${b.dataset.tab}`)));
  document.getElementById("delete").onclick = async () => {
    if (!confirm(`「${material.title}」を削除しますか？（ページ画像・問題も消えます）`)) return;
    await store.deleteMaterial(id);
    location.hash = "#/";
  };
  const retry = document.getElementById("retry");
  if (retry) retry.onclick = () => runJob("未処理の再実行", () => analyze(unprocessed));

  const panel = document.getElementById("tab");
  if (tab === "questions") renderQuestions(panel, material, pages, questions);
  else if (tab === "regenerate") renderRegenerate(panel, pages);
  else renderPages(panel, pages);
}

function renderPages(panel, pages) {
  panel.innerHTML = pages.map((p) => `
    <article class="card page" id="page-${p.pageNumber}">
      <div>${p.image ? `<img class="thumb" src="data:image/png;base64,${p.image}" alt="p.${p.pageNumber} のページ画像" loading="lazy">` : '<div class="noimg">ページ画像なし（PDF に含まれない非表示スライド）</div>'}</div>
      <div>
        <div class="row"><h2 class="grow">p.${p.pageNumber}</h2>${STATUS_CHIPS[p.figureStatus]}${p.hidden ? '<span class="chip">非表示スライド</span>' : ""}</div>
        ${p.hasFigure ? `<div class="muted small">検出した図: ${p.figureKinds.map((k) => KIND_NAMES[k] ?? k).join("、")}</div>` : ""}
        ${p.modelName ? `<div class="muted small">生成: ${esc(p.modelName)} / ${esc(p.promptVersion)} / ${fmtDate(p.generatedAt)}</div>` : ""}
        ${p.figureDescription ? `<h3 style="margin-top:12px">図の説明文</h3><p>${esc(p.figureDescription)}</p>` : ""}
        ${(p.mermaid ?? []).map((code) => `<h3>Mermaid</h3><div class="mermaid-box" data-code="${esc(code)}"></div><details><summary>コード</summary><pre>${esc(code)}</pre></details>`).join("")}
        ${(p.tables ?? []).map((t) => `<h3>表</h3>${markdownTable(t)}`).join("")}
        ${p.mermaidError ? `<details><summary class="error">構文エラーで破棄した Mermaid</summary><pre>${esc(p.mermaidError)}</pre></details>` : ""}
        ${p.lastError ? `<p class="error small">直近のエラー: ${esc(p.lastError)}</p>` : ""}
        <details ${p.hasFigure ? "" : "open"}><summary>スライドのテキスト</summary><pre>${esc(p.extractedText || "（なし）")}</pre></details>
        ${p.speakerNotes ? `<details><summary>発表者ノート</summary><pre>${esc(p.speakerNotes)}</pre></details>` : ""}
      </div>
    </article>`).join("");
  panel.querySelectorAll("img.thumb").forEach((img) => (img.onclick = () => {
    const dialog = document.getElementById("image-dialog");
    dialog.querySelector("img").src = img.src;
    dialog.showModal();
  }));
  const boxes = [...panel.querySelectorAll(".mermaid-box")];
  if (boxes.length) {
    import("./browser.js").then(async ({ renderMermaid }) => {
      for (const box of boxes) {
        const svg = await renderMermaid(box.dataset.code);
        if (svg) box.innerHTML = svg;
        else box.outerHTML = "";
      }
    });
  }
  const target = location.hash.match(/#page-(\d+)$/);
  if (target) document.getElementById(`page-${target[1]}`)?.scrollIntoView();
}

function renderQuestions(panel, material, pages, questions) {
  const batches = [...new Map(questions.map((q) => [q.batchId, q])).values()].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const unprocessed = pages.filter((p) => p.figureStatus === STATUS.unprocessed).length;
  panel.innerHTML = `
    <section class="card">
      <h2>問題を作る</h2>
      <form id="gen">
        <div class="grid2">
          <div class="field"><label for="per-page">1ページあたりの問題数</label><input id="per-page" type="number" min="1" max="10" value="2"></div>
          <div class="field"><label for="gen-pages">ページ（省略で全ページ）</label><input id="gen-pages" type="text" placeholder="例: 1,3-5"></div>
        </div>
        <div class="field"><label>問題形式</label><div class="checks">
          ${ALL_TYPES.map((t) => `<label><input type="checkbox" name="types" value="${t}" checked>${TYPE_NAMES[t]}</label>`).join("")}
        </div></div>
        <div class="field checks">
          <label><input type="checkbox" id="deep">図の理解を深く問う（図ページのみ。ページ画像も Gemini に渡す）</label>
          ${unprocessed ? `<label><input type="checkbox" id="incl">図が未処理のページも使う</label>` : ""}
        </div>
        <button type="submit" data-job ${settings.apiKey ? "" : "disabled"}>問題を作る</button>
        ${settings.apiKey ? `<span class="muted small">API 呼び出しは ${settings.pagesPerCall}ページにつき1回です</span>` : '<span class="muted small">先に設定で API キーを入れてください</span>'}
      </form>
    </section>
    ${questions.length ? `
    <section class="card">
      <div class="row">
        <div class="grow"><label for="batch">表示する問題</label><select id="batch"><option value="">すべて（${questions.length}問）</option>
          ${batches.map((b) => `<option value="${esc(b.batchId)}">${fmtDate(b.generatedAt)}・${questions.filter((q) => q.batchId === b.batchId).length}問${b.usedPageImage ? "・図を深く問う" : ""}</option>`).join("")}
        </select></div>
        <button type="button" class="secondary" id="export-md">Markdown で保存</button>
        <button type="button" class="secondary" id="export-json">JSON で保存</button>
      </div>
    </section>
    <div id="qlist"></div>` : '<p class="muted">まだ問題はありません。</p>'}`;

  document.getElementById("gen").onsubmit = (e) => {
    e.preventDefault();
    const types = [...panel.querySelectorAll('input[name="types"]:checked')].map((i) => i.value);
    const deep = document.getElementById("deep").checked;
    const includeUnprocessed = !!document.getElementById("incl")?.checked;
    const perPage = Number(document.getElementById("per-page").value) || 1;
    let pageNumbers;
    try {
      pageNumbers = parsePages(document.getElementById("gen-pages").value);
    } catch (err) {
      return alert(err.message);
    }
    runJob("問題の生成", async () => {
      const c = client(settings.questionModel);
      log(`問題生成: モデル ${c.modelName}${deep ? " / ページ画像あり（図を深く問う）" : ""}`);
      const result = await generateQuestions({
        store, client: c, materialId: material.id, pages, perPage, types, deep, includeUnprocessed,
        pagesPerCall: Number(settings.pagesPerCall) || 5, pageNumbers,
        onPage: (p) => p.error ? log(`p.${p.pageNumber} 失敗: ${p.error}`, "ng") : log(`p.${p.pageNumber} ${p.saved}問${p.dropped.length ? `（形式不備で ${p.dropped.length}問を破棄）` : ""}`, "ok"),
      });
      for (const [n, reason] of [...result.skipped].sort((a, b) => a[0] - b[0])) log(`p.${n} 対象外: ${reason}`);
      log(`保存 ${result.saved}問`);
      if (result.pages.some((p) => p.error?.startsWith("DailyQuotaExceeded"))) log(DAILY_QUOTA_MESSAGE, "ng");
    });
  };
  if (!questions.length) return;

  const selected = () => {
    const batch = document.getElementById("batch").value;
    return batch ? questions.filter((q) => q.batchId === batch) : questions;
  };
  const list = () => {
    document.getElementById("qlist").innerHTML = selected().map((q, i) => `
      <article class="card question" data-id="${q.id}">
        <div class="row small"><span class="chip accent">問${i + 1}・${TYPE_NAMES[q.questionType]}</span>${q.figureBased ? '<span class="chip">図</span>' : ""}
          <span class="grow"></span><a href="#/m/${encodeURIComponent(material.id)}/pages#page-${q.pageNumber}">出典: p.${q.pageNumber}</a></div>
        <p class="qtext" style="margin-top:10px">${esc(q.question)}</p>
        ${q.questionType === "multiple_choice" ? `<ol class="choices">${q.choices.map((c, k) => `<li><button type="button" data-choice="${esc(c)}">${"ABCD"[k]}. ${esc(c)}</button></li>`).join("")}</ol>` : ""}
        ${q.questionType === "true_false" ? `<div class="row choices">${["○", "×"].map((c) => `<button type="button" data-choice="${c}" style="width:auto;min-width:64px;text-align:center">${c}</button>`).join("")}</div>` : ""}
        <button type="button" class="link small" data-reveal>答えを見る</button>
        <div class="answer" hidden><p><strong>正解:</strong> ${esc(q.answer)}</p><p class="small">${esc(q.explanation)}</p></div>
      </article>`).join("");
    document.querySelectorAll(".question").forEach((card) => {
      const q = questions.find((x) => String(x.id) === card.dataset.id);
      const reveal = () => { card.querySelector(".answer").hidden = false; card.querySelector("[data-reveal]").hidden = true; };
      card.querySelector("[data-reveal]").onclick = reveal;
      card.querySelectorAll("[data-choice]").forEach((b) => (b.onclick = () => {
        card.querySelectorAll("[data-choice]").forEach((x) => { if (x.dataset.choice === q.answer) x.classList.add("correct"); });
        if (b.dataset.choice !== q.answer) b.classList.add("wrong");
        reveal();
      }));
    });
  };
  document.getElementById("batch").onchange = list;
  document.getElementById("export-md").onclick = () => download(`${material.id}_questions.md`, toMarkdown(selected(), material.title), "text/markdown");
  document.getElementById("export-json").onclick = () => download(`${material.id}_questions.json`, toJson(selected()), "application/json");
  list();
}

function renderRegenerate(panel, pages) {
  const groups = metaGroups(pages);
  panel.innerHTML = `
    <section class="card">
      <h2>図の説明文・Mermaid を作り直す</h2>
      <p class="muted">保存してあるページ画像から、いまの設定（モデル <code>${esc(settings.vlmModel)}</code> / プロンプト <code>${FIGURE_PROMPT_VERSION}</code>）で作り直します。作り直しに失敗したページは、前の結果を残します。</p>
      <div class="field" style="max-width:320px"><label for="regen-pages">ページ（省略で全ページ）</label><input id="regen-pages" type="text" placeholder="例: 2,5"></div>
      ${groups.length ? `<table class="md"><thead><tr><th>生成したモデル</th><th>プロンプト</th><th>ページ数</th><th></th></tr></thead><tbody>
        ${groups.map((g, i) => `<tr><td>${esc(g.modelName)}</td><td>${esc(g.promptVersion)}</td><td>${g.count}</td><td><button type="button" data-group="${i}" data-job ${settings.apiKey ? "" : "disabled"}>このデータを作り直す</button></td></tr>`).join("")}
      </tbody></table>` : '<p class="muted">解析済みの図ページがありません。</p>'}
    </section>`;
  panel.querySelectorAll("[data-group]").forEach((b) => (b.onclick = () => {
    let pageNumbers;
    try {
      pageNumbers = parsePages(document.getElementById("regen-pages").value);
    } catch (err) {
      return alert(err.message);
    }
    const g = groups[Number(b.dataset.group)];
    const targets = selectForRegeneration(pages, { modelName: g.modelName, promptVersion: g.promptVersion, pageNumbers });
    if (!targets.length) return alert("条件に合うページがありません");
    runJob("図の再生成", () => analyze(targets, { keepPreviousOnFailure: true }));
  }));
}

// ---------------- 画面: 設定 ----------------

function renderSettings() {
  view.innerHTML = `
    <section class="card">
      <h1>設定</h1>
      <form id="settings">
        <div class="field"><label for="key">Gemini API キー</label><input id="key" type="password" autocomplete="off" value="${esc(settings.apiKey)}">
          <div class="hint"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> で無料で発行できます。キーはこのブラウザの中にだけ保存され、Gemini API 以外には送りません。</div></div>
        <div class="grid2">
          <div class="field"><label for="vlm">図の解析に使うモデル</label><input id="vlm" type="text" value="${esc(settings.vlmModel)}"></div>
          <div class="field"><label for="qm">問題生成に使うモデル</label><input id="qm" type="text" value="${esc(settings.questionModel)}"></div>
          <div class="field"><label for="rpm">1分あたりの呼び出し回数の上限</label><input id="rpm" type="number" min="0" step="1" value="${esc(settings.rpm)}"><div class="hint">無料枠なら 4。有料枠なら 0（制限なし）</div></div>
          <div class="field"><label for="ppc">問題生成で1回にまとめるページ数</label><input id="ppc" type="number" min="1" max="20" value="${esc(settings.pagesPerCall)}"></div>
        </div>
        <button type="submit">保存</button> <span id="saved" class="muted small"></span>
      </form>
    </section>
    <section class="card">
      <h2>無料枠について</h2>
      <p>既定の設定は Gemini API の無料枠に収まるようにしてあります（1分に4回まで、1日の上限に達したら残りは「未処理」にしてあとで再実行）。無料枠の1日の上限は Google の AI Studio で確認できます。</p>
      <p class="notice warn">無料枠では、送った内容（教材のテキストや画像）が Google のサービス改善に使われることがあります。社外秘の教材には有料枠のキーを使ってください。</p>
    </section>
    <section class="card">
      <h2>データ</h2>
      <p class="muted">教材・ページ画像・問題は、このブラウザの IndexedDB にだけ保存されています。ブラウザのサイトデータを消すと消えます。</p>
    </section>`;
  document.getElementById("settings").onsubmit = (e) => {
    e.preventDefault();
    settings = {
      apiKey: document.getElementById("key").value.trim(),
      vlmModel: document.getElementById("vlm").value.trim() || DEFAULTS.vlmModel,
      questionModel: document.getElementById("qm").value.trim() || DEFAULTS.questionModel,
      rpm: Math.max(0, Number(document.getElementById("rpm").value) || 0),
      pagesPerCall: Math.max(1, Number(document.getElementById("ppc").value) || DEFAULTS.pagesPerCall),
    };
    const ok = saveSettings(settings);
    document.getElementById("saved").textContent = ok ? "保存しました" : "このブラウザでは保存できませんでした（このタブを開いている間だけ有効です）";
    updateKeyStatus();
  };
}

// ---------------- ルーティング ----------------

async function route() {
  const hash = location.hash.replace(/#page-\d+$/, "");
  const m = /^#\/m\/([^/]+)(?:\/(\w+))?/.exec(hash);
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (hash.startsWith("#/settings") ? "settings" : "home")));
  if (hash.startsWith("#/settings")) renderSettings();
  else if (m) await renderMaterial(decodeURIComponent(m[1]), m[2] || "pages");
  else await renderHome();
  if (busy) document.querySelectorAll("[data-job]").forEach((b) => (b.disabled = true));
}

window.addEventListener("hashchange", route);
updateKeyStatus();
try {
  store = await IndexedDbStore.open();
  await route();
} catch (e) {
  view.innerHTML = `<div class="card error">このブラウザではデータを保存できません（${esc(e.message)}）。プライベートブラウズを使っている場合は、通常のウィンドウで開いてください。</div>`;
}
