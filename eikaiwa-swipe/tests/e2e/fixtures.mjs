import { test as base, expect } from "@playwright/test";
import rawChapters from "../../src/data/index.js";
import { buildLibrary } from "../../src/logic.js";

export const LIB = buildLibrary(rawChapters);
const BY_ENGLISH = Object.fromEntries(Object.values(LIB.byId).map((p) => [p.english, p]));
export const phraseOf = (english) => BY_ENGLISH[english];

/**
 * ブラウザの音声APIを差し替える。
 * - speechSynthesis.speak: 実際には鳴らさず、読み上げ単位（文・pitch・rate）を記録する
 * - SpeechRecognition: window.__nextSpeech に入れた文字列を「聞き取った」ことにする
 */
function installSpeechStubs() {
  window.__spoken = [];
  const synth = window.speechSynthesis;
  if (synth) {
    synth.speak = (u) => {
      window.__spoken.push({ text: u.text, pitch: u.pitch, rate: u.rate });
      setTimeout(() => {
        u.onstart && u.onstart();
        u.onend && u.onend();
      }, 0);
    };
    synth.cancel = () => {};
  }
  window.__nextSpeech = "";
  class FakeRecognition {
    start() {
      setTimeout(() => {
        const alt = { transcript: window.__nextSpeech };
        const result = Object.assign([alt], { isFinal: true });
        this.onresult && this.onresult({ results: [result] });
        this.onend && this.onend();
      }, 50);
    }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(installSpeechStubs);
    await page.goto("/");
    await expect(page.getByTestId("remaining")).toBeVisible();
    await use(page);
  },
});

export { expect };

export async function swipe(page, dx) {
  const card = page.getByTestId("swipe-card");
  const box = await card.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y);
  await page.mouse.up();
}

/** テストの設定画面で条件を選んで開始する */
export async function startTest(page, { scope = "ch01", count = "10問", prompt = "英語を表示", answer = "入力" } = {}) {
  await page.getByRole("button", { name: "テスト", exact: true }).click();
  await page.locator("#test-scope").selectOption(scope);
  await page.getByRole("button", { name: count, exact: true }).click();
  await page.getByRole("button", { name: prompt, exact: true }).click();
  await page.getByRole("button", { name: answer, exact: true }).click();
  await page.getByRole("button", { name: /テストを始める/ }).click();
  await expect(page.getByTestId("test-progress")).toHaveText(/^1 \/ /);
}
