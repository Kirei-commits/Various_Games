// 登録・図の解析・未処理の再実行・再生成・問題生成。UI と保存先（store）に依存しないようにして、Node でもテストできるようにする。
// Python 版（kyozai_quiz/register.py, figures.py, questions.py）と同じ流れ・同じ判定。
import {
  FIGURE_PROMPT_VERSION, FIGURE_SCHEMA, QUESTION_PROMPT_VERSION, QUESTION_SCHEMA,
  figurePrompt, pageSection, questionPrompt,
} from "./prompts.js";

export const STATUS = { none: "none", unprocessed: "unprocessed", done: "done" };
export const ALL_TYPES = ["multiple_choice", "short_answer", "true_false"];
export const TYPE_NAMES = { multiple_choice: "4択", short_answer: "記述", true_false: "正誤" };

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

// ---------------- 登録 ----------------

export function makeMaterialId(stem, existingIds) {
  const base = stem.replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "") || "material";
  let id = base;
  for (let n = 2; existingIds.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * スライドと PDF のページを対応づける。
 * PowerPoint は既定で非表示スライドを PDF に出さないので、PDF のページ数が「表示スライドの数」と同じならそちらで対応づける。
 * 戻り値: スライドごとの PDF ページの添字（0始まり）。PDF にないスライドは null
 */
export function mapSlidesToPdf(slides, pdfPageCount) {
  if (pdfPageCount === slides.length) return slides.map((_, i) => i);
  const visible = slides.filter((s) => !s.hidden).length;
  if (pdfPageCount === visible) {
    let k = 0;
    return slides.map((s) => (s.hidden ? null : k++));
  }
  throw new Error(`PDF のページ数（${pdfPageCount}）がスライド数（${slides.length}、うち表示 ${visible}）と合いません。同じ pptx から書き出した PDF を選んでください`);
}

/** pages の image は PNG の base64（PDF にないスライドは null） */
export async function registerMaterial(store, { slides, images, fileName, materialId, title }) {
  if (!slides.length) throw new Error("スライドが1枚もありません");
  const mapping = mapSlidesToPdf(slides, images.length);
  const existing = new Set((await store.listMaterials()).map((m) => m.id));
  const stem = fileName.replace(/\.pptx$/i, "");
  if (materialId) {
    if (!/^[\p{L}\p{N}_-]+$/u.test(materialId)) throw new Error("教材IDに使えるのは文字・数字・_・- だけです");
    if (existing.has(materialId)) throw new Error(`教材ID ${materialId} はすでに登録されています`);
  } else {
    materialId = makeMaterialId(stem, existing);
  }
  const now = nowIso();
  const material = { id: materialId, title: title || stem, sourceFilename: fileName, pageCount: slides.length, registeredAt: now };
  const pages = slides.map((s, i) => {
    const image = mapping[i] == null ? null : images[mapping[i]];
    const hasFigure = s.figureKinds.length > 0;
    return {
      materialId, pageNumber: s.pageNumber, extractedText: s.text, speakerNotes: s.notes,
      hasFigure, figureKinds: s.figureKinds, hidden: s.hidden, image,
      // 画像のない（PDF に出ていない非表示）スライドは VLM に渡せないので、テキストのみで登録する
      figureStatus: hasFigure && image ? STATUS.unprocessed : STATUS.none,
      figureDescription: null, mermaid: null, tables: null, mermaidError: null,
      lastError: hasFigure && !image ? "PDF に含まれない非表示スライドのため、図の解析をしていません" : null,
      attempts: 0, modelName: null, promptVersion: null, generatedAt: null, registeredAt: now,
    };
  });
  await store.saveMaterial(material, pages);
  return { material, figurePages: pages.filter((p) => p.figureStatus === STATUS.unprocessed).map((p) => p.pageNumber) };
}

// ---------------- 図の解析 ----------------

export function stripFences(code) {
  const m = /^```(?:mermaid)?\s*\n([\s\S]*?)\n?```$/.exec(code.trim());
  return (m ? m[1] : code).trim();
}

/**
 * pages の各ページ画像を VLM に渡し、結果を保存する。
 * keepPreviousOnFailure（再生成）のときは、失敗しても既存の説明文を残す（メタ情報が変わらないので、同じ条件でもう一度選べる）。
 * validateMermaid(codes) はコードごとにエラー文字列か null を返す。
 */
export async function analyzePages({ store, client, validateMermaid, pages, keepPreviousOnFailure = false, onDone }) {
  const outcomes = [];
  for (const page of pages) {
    let outcome;
    try {
      const prompt = figurePrompt(page.extractedText, page.speakerNotes, page.figureKinds);
      const analysis = await client.generateJson(prompt, FIGURE_SCHEMA, [page.image]);
      outcome = await saveSuccess(store, validateMermaid, client.modelName, page, analysis);
    } catch (e) {
      outcome = await saveFailure(store, client.modelName, page, `${e.name}: ${e.message}`, keepPreviousOnFailure);
    }
    outcomes.push(outcome);
    onDone?.(outcome);
  }
  return outcomes;
}

async function saveSuccess(store, validateMermaid, modelName, page, analysis) {
  const codes = (analysis.mermaid ?? []).filter((c) => c && c.trim()).map(stripFences);
  const errors = await validateMermaid(codes);
  const valid = codes.filter((_, i) => errors[i] == null);
  const rejected = codes.map((code, i) => ({ code, error: errors[i], n: i + 1 })).filter((r) => r.error != null);
  const mermaidError = rejected.length
    ? rejected.map((r) => `[${r.n}] ${r.error}\n--- 捨てたコード ---\n${r.code}`).join("\n\n")
    : null;
  const tables = (analysis.tables ?? []).map((t) => t?.trim()).filter(Boolean);
  const now = nowIso();
  const updated = {
    ...page,
    figureStatus: STATUS.done,
    figureDescription: String(analysis.description ?? "").trim(),
    mermaid: valid.length ? valid : null,
    tables: tables.length ? tables : null,
    mermaidError, lastError: null, attempts: page.attempts + 1,
    modelName, promptVersion: FIGURE_PROMPT_VERSION, generatedAt: now,
  };
  await store.putPage(updated);
  await store.addLog({ materialId: page.materialId, pageNumber: page.pageNumber, success: true, figureDescription: updated.figureDescription, mermaid: updated.mermaid, tables: updated.tables, mermaidError, error: null, modelName, promptVersion: FIGURE_PROMPT_VERSION, generatedAt: now });
  return { materialId: page.materialId, pageNumber: page.pageNumber, success: true, mermaidCount: valid.length, mermaidRejected: rejected.length };
}

async function saveFailure(store, modelName, page, error, keepPrevious) {
  const now = nowIso();
  const updated = keepPrevious && page.figureStatus === STATUS.done
    ? { ...page, lastError: error, attempts: page.attempts + 1 }
    : { ...page, figureStatus: STATUS.unprocessed, lastError: error, attempts: page.attempts + 1 };
  await store.putPage(updated);
  await store.addLog({ materialId: page.materialId, pageNumber: page.pageNumber, success: false, error, modelName, promptVersion: FIGURE_PROMPT_VERSION, generatedAt: now });
  return { materialId: page.materialId, pageNumber: page.pageNumber, success: false, error };
}

export const selectUnprocessed = (pages, pageNumbers) =>
  pages.filter((p) => p.figureStatus === STATUS.unprocessed && (!pageNumbers || pageNumbers.includes(p.pageNumber)));

export const selectForRegeneration = (pages, { modelName, promptVersion, pageNumbers } = {}) =>
  pages.filter(
    (p) =>
      p.figureStatus === STATUS.done &&
      (modelName == null || p.modelName === modelName) &&
      (promptVersion == null || p.promptVersion === promptVersion) &&
      (!pageNumbers || pageNumbers.includes(p.pageNumber)),
  );

/** 生成済みの図ページを、モデル・プロンプト版の組み合わせごとに数える */
export function metaGroups(pages) {
  const groups = new Map();
  for (const p of pages.filter((p) => p.figureStatus === STATUS.done)) {
    const key = `${p.modelName}\u0000${p.promptVersion}`;
    const g = groups.get(key) ?? { modelName: p.modelName, promptVersion: p.promptVersion, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()];
}

// ---------------- 問題生成 ----------------

export function selectQuestionPages(pages, { pageNumbers, deep, includeUnprocessed }) {
  const targets = [];
  const skipped = new Map();
  for (const p of pages) {
    if (pageNumbers && !pageNumbers.includes(p.pageNumber)) continue;
    if (deep && !(p.hasFigure && p.image)) skipped.set(p.pageNumber, "図なし（図を深く問うモードの対象外）");
    else if (p.figureStatus === STATUS.unprocessed && !includeUnprocessed) skipped.set(p.pageNumber, "図が未処理（再実行するか「未処理のページも使う」を選ぶ）");
    else if (!deep && !(p.extractedText.trim() || p.speakerNotes.trim() || p.figureDescription)) skipped.set(p.pageNumber, "材料になる内容がない");
    else targets.push(p);
  }
  return { targets, skipped };
}

/** pagesPerCall ページずつまとめて1回の API 呼び出しで問題を作る（無料枠の回数を節約するため） */
export async function generateQuestions({
  store, client, materialId, pages, perPage = 3, types = ALL_TYPES, deep = false,
  includeUnprocessed = false, pagesPerCall = 5, pageNumbers = null, onPage,
}) {
  if (perPage < 1) throw new Error("1ページあたりの問題数は1以上にしてください");
  if (!types.length) throw new Error("問題形式を1つ以上選んでください");
  const { targets, skipped } = selectQuestionPages(pages, { pageNumbers, deep, includeUnprocessed });
  const batchId = Math.random().toString(16).slice(2, 14).padEnd(12, "0");
  const results = [];
  const size = Math.max(1, pagesPerCall);
  for (let i = 0; i < targets.length; i += size) {
    const batch = targets.slice(i, i + size);
    const byPage = new Map(batch.map((p) => [p.pageNumber, { pageNumber: p.pageNumber, saved: 0, dropped: [], error: null }]));
    try {
      const prompt = questionPrompt({
        materialId,
        pages: batch.map((p) => pageSection({ pageNumber: p.pageNumber, slideText: p.extractedText, notes: p.speakerNotes, description: p.figureDescription, mermaid: p.mermaid, tables: p.tables })),
        pageNumbers: batch.map((p) => p.pageNumber),
        count: perPage, types, deep,
      });
      const qset = await client.generateJson(prompt, QUESTION_SCHEMA, deep ? batch.map((p) => p.image) : []);
      const now = nowIso();
      const toSave = [];
      for (const q of qset.questions ?? []) {
        const result = byPage.get(q.page_number);
        if (!result) {
          // 出典が対象外のページを指している問題は、出典を信用できないので捨てる
          byPage.values().next().value.dropped.push(`出典ページが不正: ${q.page_number}`);
          continue;
        }
        const { question, reason } = normalizeQuestion(q, types);
        if (!question) {
          result.dropped.push(reason);
          continue;
        }
        toSave.push({
          materialId, pageNumber: q.page_number, questionType: question.question_type, question: question.question.trim(),
          choices: question.choices, answer: question.answer, explanation: String(question.explanation ?? "").trim(),
          figureBased: !!question.figure_based, usedPageImage: deep, modelName: client.modelName,
          promptVersion: QUESTION_PROMPT_VERSION, batchId, generatedAt: now,
        });
        result.saved += 1;
      }
      await store.addQuestions(toSave);
    } catch (e) {
      for (const r of byPage.values()) r.error = `${e.name}: ${e.message}`;
    }
    for (const r of byPage.values()) {
      results.push(r);
      onPage?.(r);
    }
  }
  return { batchId, pages: results, skipped, saved: results.reduce((n, r) => n + r.saved, 0) };
}

const TRUE_MARKS = new Set(["○", "〇", "◯", "正", "正しい", "true", "True", "TRUE", "o", "O"]);
const FALSE_MARKS = new Set(["×", "✕", "✗", "x", "X", "誤", "誤り", "false", "False", "FALSE"]);

export function normalizeQuestion(q, allowedTypes) {
  if (!allowedTypes.includes(q.question_type)) return { reason: `指定外の形式: ${q.question_type}` };
  if (!String(q.question ?? "").trim()) return { reason: "問題文が空" };
  let answer = String(q.answer ?? "").trim();
  if (q.question_type === "multiple_choice") {
    const choices = (q.choices ?? []).map((c) => String(c).trim());
    if (choices.length !== 4 || new Set(choices).size !== 4 || choices.some((c) => !c)) {
      return { reason: `選択肢が4つの異なる文字列ではない: ${JSON.stringify(choices)}` };
    }
    if (!choices.includes(answer)) {
      // 「A」「2」のように記号・番号で答えてきた場合は選択肢に引き直す
      const index = choiceIndex(answer);
      if (index == null) return { reason: `正解が選択肢にない: ${answer}` };
      answer = choices[index];
    }
    return { question: { ...q, choices, answer } };
  }
  if (q.question_type === "true_false") {
    if (TRUE_MARKS.has(answer)) answer = "○";
    else if (FALSE_MARKS.has(answer)) answer = "×";
    else return { reason: `正誤問題の正解が○×でない: ${answer}` };
    return { question: { ...q, choices: [], answer } };
  }
  if (!answer) return { reason: "模範解答が空" };
  return { question: { ...q, choices: [], answer } };
}

function choiceIndex(answer) {
  const a = answer.trim().replace(/[.)）]+$/, "").replace(/^[(（]+/, "");
  for (const table of ["ABCD", "abcd", "1234", "１２３４", "アイウエ"]) {
    if (a.length === 1 && table.includes(a)) return table.indexOf(a);
  }
  return null;
}

export function toMarkdown(questions, title) {
  const lines = [`# ${title} 問題集`, ""];
  questions.forEach((q, i) => {
    lines.push(`## 問${i + 1}（${TYPE_NAMES[q.questionType]}）`, "", q.question, "");
    q.choices.forEach((c, k) => lines.push(`- ${"ABCD"[k]}. ${c}`));
    if (q.choices.length) lines.push("");
    let answer = q.answer;
    if (q.questionType === "multiple_choice" && q.choices.includes(answer)) answer = `${"ABCD"[q.choices.indexOf(answer)]}. ${answer}`;
    lines.push(`**正解**: ${answer}`, "", `**解説**: ${q.explanation}`, "");
    lines.push(`出典: 教材 \`${q.materialId}\` p.${q.pageNumber}${q.figureBased ? "（図）" : ""}`, "");
  });
  return lines.join("\n");
}

/** Python 版 questions --format json と同じ形（出典つき） */
export function toJson(questions) {
  return JSON.stringify(
    questions.map((q) => ({
      id: q.id, material_id: q.materialId, page_number: q.pageNumber, question_type: q.questionType,
      question: q.question, choices: q.choices, answer: q.answer, explanation: q.explanation,
      figure_based: q.figureBased, used_page_image: q.usedPageImage, model_name: q.modelName,
      prompt_version: q.promptVersion, batch_id: q.batchId, generated_at: q.generatedAt,
      source: { material_id: q.materialId, page_number: q.pageNumber },
    })),
    null, 2,
  );
}

/** 「1,3-5」→ [1, 3, 4, 5]。空なら null（全ページ） */
export function parsePages(text) {
  if (!text || !text.trim()) return null;
  const pages = new Set();
  for (const raw of text.split(/[,、]/)) {
    const part = raw.trim();
    const m = /^(\d+)\s*[-〜~]\s*(\d+)$/.exec(part);
    if (m) for (let n = Number(m[1]); n <= Number(m[2]); n++) pages.add(n);
    else if (/^\d+$/.test(part)) pages.add(Number(part));
    else throw new Error(`ページの指定が不正です: ${part}（例: 1,3-5）`);
  }
  return [...pages].sort((a, b) => a - b);
}

// ---------------- Mermaid ----------------

const DIAGRAM_KEYWORDS = new Set([
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "stateDiagram", "stateDiagram-v2", "erDiagram", "journey",
  "gantt", "pie", "quadrantChart", "requirementDiagram", "gitGraph", "mindmap", "timeline", "sankey-beta", "xychart-beta",
  "block-beta", "C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment", "architecture-beta", "packet-beta",
  "kanban", "radar-beta",
]);

/** mermaid が読み込めないときの簡易チェック（Python 版 basic_check と同じ） */
export function basicMermaidCheck(code) {
  const lines = code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("%%"));
  if (!lines.length) return "空のコードです";
  const first = lines[0].trim().split(/\s+/)[0];
  if (!DIAGRAM_KEYWORDS.has(first)) return `図の種類の宣言が不正です: ${first}`;
  if (lines.length < 2) return "図の中身がありません";
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const closers = new Set(Object.values(pairs));
  const stack = [];
  let inQuote = false;
  for (const ch of code) {
    if (ch === '"') inQuote = !inQuote;
    else if (inQuote) continue;
    else if (pairs[ch]) stack.push(pairs[ch]);
    else if (closers.has(ch) && stack.pop() !== ch) return `括弧の対応がとれていません: ${ch}`;
  }
  if (inQuote) return "二重引用符が閉じていません";
  if (stack.length) return "括弧が閉じていません";
  if (first === "flowchart" || first === "graph") {
    for (const l of lines.slice(1)) if (/(-->|---|==>|-\.->)\s*$/.test(l.trim())) return `矢印の先がありません: ${l.trim()}`;
  }
  return null;
}
