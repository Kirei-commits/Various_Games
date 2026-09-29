import fs from "node:fs";
import { test, expect, startTest, phraseOf } from "./fixtures.mjs";

const TONE = fs.readFileSync(new URL("./assets/tone.opus", import.meta.url));

/** audio/cheers.json に「正解」の合いの手があることにして、取得した声を記録する */
async function withCheers(page) {
  const fetched = [];
  const events = { correct: { chance: 1, clips: [{ text: "Nice!", voice: "Laomedeia", file: "cheers/nice.opus?v=1" }] } };
  await page.route("**/audio/cheers.json", (route) => route.fulfill({ json: { version: 1, events } }));
  await page.route("**/audio/index.json", (route) => route.fulfill({ json: { version: 1, clips: {} } }));
  await page.route("**/audio/cheers/*", (route) => {
    fetched.push(new URL(route.request().url()).pathname.split("/").pop());
    return route.fulfill({ body: TONE, contentType: "audio/ogg" });
  });
  await page.addInitScript(() => (window.__swipetalkNoRecorded = false)); // fixtures の既定（録音・合いの手なし）を上書きする
  await page.reload();
  await expect(page.getByTestId("remaining")).toBeVisible();
  return fetched;
}

async function answerCorrectly(page) {
  await startTest(page);
  const p = phraseOf(await page.getByTestId("test-question").innerText());
  await page.locator("#test-answer").fill(p.japanese.split("／")[0]);
  await page.locator("#test-answer").press("Enter");
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
}

test("正解すると合いの手の声が流れる", async ({ page }) => {
  const fetched = await withCheers(page);
  await answerCorrectly(page);
  await expect.poll(() => fetched, { timeout: 10_000 }).toEqual(["nice.opus"]);
});

test("設定で合いの手をオフにすると流れない", async ({ page }) => {
  const fetched = await withCheers(page);
  await page.getByRole("button", { name: "音声の設定" }).click();
  await page.locator("#toggle-cheers").uncheck();
  await page.getByRole("button", { name: "閉じる" }).click();
  await answerCorrectly(page);
  await page.waitForTimeout(800);
  expect(fetched).toEqual([]);
});
