import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../../js/store.js";
import {
  STATUS, analyzePages, basicMermaidCheck, generateQuestions, mapSlidesToPdf, makeMaterialId, normalizeQuestion,
  parsePages, registerMaterial, selectForRegeneration, selectUnprocessed, stripFences, toMarkdown,
} from "../../js/pipeline.js";
import { FIGURE_SCHEMA, QUESTION_SCHEMA } from "../../js/prompts.js";

const slides = [
  { pageNumber: 1, text: "タイトル", notes: "ノート", figureKinds: [], hidden: false },
  { pageNumber: 2, text: "流れ", notes: "", figureKinds: ["shape"], hidden: false },
  { pageNumber: 3, text: "グラフ", notes: "", figureKinds: ["chart"], hidden: false },
  { pageNumber: 4, text: "隠し", notes: "", figureKinds: ["picture"], hidden: true },
];

class FakeClient {
  constructor({ modelName = "fake-1", failIf = () => false, mermaid = ['flowchart LR\n  A["検知"] --> B["封じ込め"]'], questions } = {}) {
    Object.assign(this, { modelName, failIf, mermaid, questions, calls: [] });
  }
  async generateJson(prompt, schema, images = []) {
    this.calls.push({ prompt, schema, images });
    if (this.failIf(prompt)) throw new Error("503 overloaded");
    if (schema === FIGURE_SCHEMA) return { description: "検知から封じ込めへ矢印", mermaid: this.mermaid, tables: ["| a |\n|---|\n| 1 |"] };
    if (schema === QUESTION_SCHEMA) {
      if (this.questions) return { questions: this.questions };
      const pages = [...prompt.matchAll(/^## ページ (\d+)$/gm)].map((m) => Number(m[1]));
      return { questions: pages.flatMap((n) => [
        { page_number: n, question_type: "multiple_choice", question: "最初は？", choices: ["検知", "封じ込め", "復旧", "報告"], answer: "A", explanation: "図", figure_based: true },
        { page_number: n, question_type: "true_false", question: "逆順である", choices: [], answer: "誤", explanation: "図", figure_based: true },
        { page_number: n, question_type: "multiple_choice", question: "壊れた", choices: ["a", "b"], answer: "a", explanation: "", figure_based: false },
      ]) };
    }
    throw new Error("unknown schema");
  }
}

const validate = async (codes) => codes.map(basicMermaidCheck);

async function registered() {
  const store = new MemoryStore();
  // PowerPoint の PDF は非表示スライドを含まないので、3ページ分の画像
  const { material } = await registerMaterial(store, { slides, images: ["img1", "img2", "img3"], fileName: "セキュリティ 入門.pptx" });
  return { store, id: material.id };
}

test("スライドと PDF のページの対応づけ", () => {
  assert.deepEqual(mapSlidesToPdf(slides, 4), [0, 1, 2, 3]);
  assert.deepEqual(mapSlidesToPdf(slides, 3), [0, 1, 2, null]);
  assert.throws(() => mapSlidesToPdf(slides, 2), /PDF のページ数/);
});

test("登録: 図ページは未処理、PDF にない非表示スライドはテキストのみ", async () => {
  const { store, id } = await registered();
  assert.equal(id, "セキュリティ_入門");
  const pages = await store.getPages(id);
  assert.deepEqual(pages.map((p) => p.figureStatus), [STATUS.none, STATUS.unprocessed, STATUS.unprocessed, STATUS.none]);
  assert.equal(pages[3].image, null);
  assert.match(pages[3].lastError, /非表示スライド/);
  assert.equal(makeMaterialId("セキュリティ 入門", new Set([id])), "セキュリティ_入門-2");
  await assert.rejects(registerMaterial(store, { slides, images: ["a", "b", "c"], fileName: "x.pptx", materialId: id }), /すでに登録/);
});

test("図の解析: 失敗は未処理として記録し、再実行できる", async () => {
  const { store, id } = await registered();
  const client = new FakeClient({ failIf: (p) => p.trimEnd().endsWith("\nchart") });
  const outcomes = await analyzePages({ store, client, validateMermaid: validate, pages: selectUnprocessed(await store.getPages(id)) });
  assert.deepEqual(outcomes.map((o) => o.success), [true, false]);
  assert.deepEqual(client.calls.map((c) => c.images), [["img2"], ["img3"]]); // ページ画像を渡す
  let pages = await store.getPages(id);
  assert.equal(pages[1].figureStatus, STATUS.done);
  assert.deepEqual(pages[1].mermaid, ['flowchart LR\n  A["検知"] --> B["封じ込め"]']);
  assert.equal(pages[1].promptVersion, "figure-v2");
  assert.equal(pages[2].figureStatus, STATUS.unprocessed);
  assert.match(pages[2].lastError, /503/);

  await analyzePages({ store, client: new FakeClient(), validateMermaid: validate, pages: selectUnprocessed(pages) });
  pages = await store.getPages(id);
  assert.equal(pages[2].figureStatus, STATUS.done);
  assert.equal(pages[2].attempts, 2);
  assert.deepEqual((await store.getLog(id)).map((l) => l.success), [true, false, true]);
});

test("Mermaid の構文エラーは捨てて説明文だけ保存", async () => {
  const { store, id } = await registered();
  const [page] = selectUnprocessed(await store.getPages(id), [2]);
  const [o] = await analyzePages({ store, client: new FakeClient({ mermaid: ["flowchart LR\n  A[検知 --> B"] }), validateMermaid: validate, pages: [page] });
  assert.equal(o.mermaidRejected, 1);
  const saved = (await store.getPages(id))[1];
  assert.equal(saved.mermaid, null);
  assert.ok(saved.figureDescription);
  assert.match(saved.mermaidError, /捨てたコード/);
});

test("再生成: メタ情報で絞り込み、失敗しても前の結果を残す", async () => {
  const { store, id } = await registered();
  await analyzePages({ store, client: new FakeClient({ modelName: "old" }), validateMermaid: validate, pages: selectUnprocessed(await store.getPages(id), [2]) });
  await analyzePages({ store, client: new FakeClient({ modelName: "other" }), validateMermaid: validate, pages: selectUnprocessed(await store.getPages(id), [3]) });
  let targets = selectForRegeneration(await store.getPages(id), { modelName: "old" });
  assert.deepEqual(targets.map((p) => p.pageNumber), [2]);
  await analyzePages({ store, client: new FakeClient({ modelName: "new", failIf: () => true }), validateMermaid: validate, pages: targets, keepPreviousOnFailure: true });
  assert.equal((await store.getPages(id))[1].modelName, "old");
  await analyzePages({ store, client: new FakeClient({ modelName: "new" }), validateMermaid: validate, pages: targets, keepPreviousOnFailure: true });
  const pages = await store.getPages(id);
  assert.deepEqual(pages.map((p) => p.modelName), [null, "new", "other", null]);
});

test("問題生成: ページをまとめて呼び、出典を紐づけ、形式不備を捨てる", async () => {
  const { store, id } = await registered();
  await analyzePages({ store, client: new FakeClient(), validateMermaid: validate, pages: selectUnprocessed(await store.getPages(id), [2]) });
  const client = new FakeClient({ modelName: "q" });
  const result = await generateQuestions({ store, client, materialId: id, pages: await store.getPages(id), perPage: 2, pagesPerCall: 2 });
  assert.deepEqual(result.pages.map((p) => p.pageNumber), [1, 2, 4]); // p.3 は未処理なので対象外
  assert.match(result.skipped.get(3), /未処理/);
  assert.equal(client.calls.length, 2);
  assert.ok(client.calls.every((c) => c.images.length === 0));
  assert.ok(result.pages.every((p) => p.saved === 2 && p.dropped.length === 1));
  const qs = await store.getQuestions(id);
  const mc = qs.find((q) => q.pageNumber === 2 && q.questionType === "multiple_choice");
  assert.equal(mc.answer, "検知");
  assert.equal(qs.find((q) => q.questionType === "true_false").answer, "×");
  assert.match(toMarkdown(qs, "t"), /出典: 教材 `セキュリティ_入門` p\.2（図）/);

  const deepClient = new FakeClient({ modelName: "q" });
  const deep = await generateQuestions({ store, client: deepClient, materialId: id, pages: await store.getPages(id), deep: true, includeUnprocessed: true, perPage: 1 });
  assert.deepEqual(deep.pages.map((p) => p.pageNumber), [2, 3]); // 画像のある図ページのみ
  assert.deepEqual(deepClient.calls[0].images, ["img2", "img3"]);
});

test("出典ページが対象外の問題は捨てる", async () => {
  const { store, id } = await registered();
  const q = { page_number: 99, question_type: "short_answer", question: "?", choices: [], answer: "x", explanation: "", figure_based: false };
  const result = await generateQuestions({ store, client: new FakeClient({ questions: [q, { ...q, page_number: 1 }] }), materialId: id, pages: await store.getPages(id), pageNumbers: [1] });
  assert.equal(result.saved, 1);
});

test("小物", () => {
  assert.deepEqual(parsePages("1, 3-5,3"), [1, 3, 4, 5]);
  assert.equal(parsePages(""), null);
  assert.throws(() => parsePages("a"));
  assert.equal(stripFences("```mermaid\ngraph TD\n A-->B\n```"), "graph TD\n A-->B");
  assert.equal(normalizeQuestion({ question_type: "true_false", question: "q", answer: "まる" }, ["true_false"]).question, undefined);
  assert.equal(basicMermaidCheck("graph TB A --- B"), "図の中身がありません");
});
