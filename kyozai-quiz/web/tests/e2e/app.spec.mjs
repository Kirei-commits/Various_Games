// Gemini API は偽物に差し替えて、登録 → 図の解析（失敗・再実行・再生成）→ 問題生成 → 書き出し → 削除 を通す。
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const samples = new URL("../../../samples/", import.meta.url).pathname;

function fakeGemini(page) {
  const state = { calls: [], failChart: true };
  page.route("https://generativelanguage.googleapis.com/**", async (route) => {
    const body = route.request().postDataJSON();
    const parts = body.contents[0].parts;
    const text = parts.find((p) => p.text).text;
    const images = parts.filter((p) => p.inline_data).length;
    state.calls.push({ text, images, key: route.request().headers()["x-goog-api-key"] });
    const reply = (value) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) });
    if (body.generationConfig.responseSchema.properties.description) {
      if (state.failChart && text.trimEnd().endsWith("\nchart")) {
        return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: 403, message: "テスト用の失敗" } }) });
      }
      const flow = text.includes("インシデント") || text.includes("年表");
      return reply({
        description: "図の説明（テスト）",
        mermaid: text.includes("活動の広がり") ? ['graph TB A["桑田佳祐"] --- B["サザン"]'] : ['flowchart LR\n  A["1978"] --> B["1979"]'],
        tables: flow ? [] : ["| 年代 | 枚数 |\n|---|---|\n| 1980年代 | 6 |"],
      });
    }
    const pages = [...text.matchAll(/^## ページ (\d+)$/gm)].map((m) => Number(m[1]));
    return reply({ questions: pages.flatMap((n) => [
      { page_number: n, question_type: "multiple_choice", question: `p.${n} の4択`, choices: ["正解", "誤答1", "誤答2", "誤答3"], answer: "正解", explanation: "根拠", figure_based: true },
      { page_number: n, question_type: "true_false", question: `p.${n} の正誤`, choices: [], answer: "○", explanation: "根拠", figure_based: false },
      { page_number: n, question_type: "multiple_choice", question: "壊れた問題", choices: ["a"], answer: "a", explanation: "", figure_based: false },
    ]) });
  });
  return state;
}

test("登録から問題生成・書き出しまで", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const gemini = fakeGemini(page);

  await page.goto("./#/settings");
  await page.fill("#key", "test-key");
  await page.fill("#rpm", "0");
  await page.click("#settings button[type=submit]");
  await expect(page.locator("#key-status")).toHaveText("API キー設定済み");

  await page.goto("./#/");
  await page.setInputFiles("#pptx", `${samples}southern_all_stars.pptx`);
  await page.setInputFiles("#pdf", `${samples}southern_all_stars.pdf`);
  await page.fill("#title", "サザンオールスターズと桑田佳祐");
  await page.click("#register button[type=submit]");
  await expect(page.locator("#job-title")).toHaveText("教材の登録（完了）", { timeout: 60_000 });
  await expect(page.locator("#job-lines")).toContainText("成功 4 / 失敗 1");

  // 図ページは5つ。グラフのページ（p.6）だけ失敗させた
  expect(gemini.calls.filter((c) => c.images === 1)).toHaveLength(5);
  expect(gemini.calls.every((c) => c.key === "test-key")).toBe(true);
  await expect(page.locator("h1")).toHaveText("サザンオールスターズと桑田佳祐");
  await expect(page.locator("#page-6 .chip.warn")).toHaveText("未処理");
  await expect(page.locator("#page-6")).toContainText("テスト用の失敗");
  await expect(page.locator("#page-1 .chip").first()).toHaveText("図なし");
  await expect(page.locator("#page-1")).toContainText("中心人物である桑田佳祐");
  // Mermaid は本物の mermaid.parse で調べ、描画する。1行にまとめた不正なコードは捨てる
  await expect(page.locator("#page-4 .mermaid-box svg")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#page-5")).toContainText("構文エラーで破棄した Mermaid");
  await expect(page.locator("#page-3 table.md")).toContainText("1980年代");
  expect(await page.locator("#page-3 img.thumb").evaluate((img) => img.naturalWidth)).toBeGreaterThan(1000);

  // 未処理を再実行
  gemini.failChart = false;
  await page.click("#retry");
  await expect(page.locator("#job-title")).toHaveText("未処理の再実行（完了）");
  await expect(page.locator("#retry")).toHaveCount(0);
  await expect(page.locator("#page-6 .chip.ok")).toHaveText("解析済み");

  // 問題生成（9ページを5ページずつ → 2回の呼び出し）
  await page.click('[data-tab="questions"]');
  await page.fill("#per-page", "2");
  const before = gemini.calls.length;
  await page.click("#gen button[type=submit]");
  await expect(page.locator("#job-title")).toHaveText("問題の生成（完了）");
  expect(gemini.calls.length - before).toBe(2);
  expect(gemini.calls.slice(before).every((c) => c.images === 0)).toBe(true);
  await expect(page.locator(".question")).toHaveCount(18);
  const first = page.locator(".question").first();
  await expect(first.locator("a")).toHaveText("出典: p.1");
  await first.locator("[data-choice='誤答1']").click();
  await expect(first.locator("[data-choice='正解']")).toHaveClass(/correct/);
  await expect(first.locator("[data-choice='誤答1']")).toHaveClass(/wrong/);
  await expect(first.locator(".answer")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.click("#export-md");
  const md = await readFile(await (await download).path(), "utf8");
  expect(md).toContain("# サザンオールスターズと桑田佳祐 問題集");
  expect(md).toContain("出典: 教材 `southern_all_stars` p.9");

  // 図を深く問う問題: 図ページだけ、ページ画像つきで1回
  const beforeDeep = gemini.calls.length;
  await page.check("#deep");
  await page.fill("#per-page", "1");
  await page.click("#gen button[type=submit]");
  await expect(page.locator("#job-title")).toHaveText("問題の生成（完了）");
  expect(gemini.calls.slice(beforeDeep).map((c) => c.images)).toEqual([5]);
  await expect(page.locator(".question")).toHaveCount(28);

  // 出典リンクでページへ
  await page.locator(".question a", { hasText: "出典: p.4" }).first().click();
  await expect(page.locator("#page-4")).toBeInViewport();

  // 再生成（モデル・プロンプト版ごと）
  await page.click('[data-tab="regenerate"]');
  await expect(page.locator("table.md tbody tr")).toHaveCount(1);
  await page.fill("#regen-pages", "4");
  const beforeRegen = gemini.calls.length;
  await page.click("text=このデータを作り直す");
  await expect(page.locator("#job-title")).toHaveText("図の再生成（完了）");
  expect(gemini.calls.length - beforeRegen).toBe(1);

  // 再読み込みしても残っている（IndexedDB）
  await page.reload();
  await page.goto("./#/");
  await expect(page.locator(".material")).toContainText("問題 28問");

  // 削除
  await page.click(".material");
  page.once("dialog", (d) => d.accept());
  await page.click("#delete");
  await expect(page.locator("text=まだありません。")).toBeVisible();
  expect(errors).toEqual([]);
});

test("API キーがなくても登録でき、図ページは未処理になる", async ({ page }) => {
  const gemini = fakeGemini(page);
  await page.goto("./#/");
  await expect(page.locator(".notice.warn")).toContainText("API キー");
  await page.setInputFiles("#pptx", `${samples}southern_all_stars.pptx`);
  await page.setInputFiles("#pdf", `${samples}southern_all_stars.pdf`);
  await page.click("#register button[type=submit]");
  await expect(page.locator("#job-title")).toHaveText("教材の登録（完了）", { timeout: 60_000 });
  await expect(page.locator(".stats .chip.warn")).toHaveText("未処理 5");
  expect(gemini.calls).toHaveLength(0);
});

test("ページ数の合わない PDF は登録しない", async ({ page }) => {
  await page.goto("./#/");
  await page.setInputFiles("#pptx", `${samples}southern_all_stars.pptx`);
  await page.setInputFiles("#pdf", { name: "one.pdf", mimeType: "application/pdf", buffer: Buffer.from(ONE_PAGE_PDF) });
  await page.click("#register button[type=submit]");
  await expect(page.locator("#job-title")).toHaveText("教材の登録（失敗）", { timeout: 60_000 });
  await expect(page.locator("#job-lines")).toContainText("PDF のページ数（1）");
});

const ONE_PAGE_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
