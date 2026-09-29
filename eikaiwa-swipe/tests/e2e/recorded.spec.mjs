import fs from "node:fs";
import { test, expect } from "./fixtures.mjs";
import { clipHash, clipKey } from "../../src/recorded.js";

const TONE = fs.readFileSync(new URL("./assets/tone.opus", import.meta.url));
const A = "Hey, how's it going?";
const B = "Pretty good, thanks. You?";

/** audio/index.json に lines（[役, 英文]）の録音があることにして、録音の取得を記録する */
async function withRecordings(page, lines) {
  const clips = Object.fromEntries(lines.map(([role, text]) => [clipHash(clipKey(role, text)), 1]));
  const fetched = [];
  await page.route("**/audio/index.json", (route) => route.fulfill({ json: { version: 1, clips } }));
  await page.route("**/audio/clips/*", (route) => {
    fetched.push(new URL(route.request().url()).pathname.split("/").pop());
    return route.fulfill({ body: TONE, contentType: "audio/ogg" });
  });
  await page.addInitScript(() => (window.__swipetalkNoRecorded = false)); // fixtures の既定（録音なし）を上書きする
  await page.reload();
  await expect(page.getByTestId("remaining")).toBeVisible();
  return fetched;
}

async function playDialogue(page) {
  await page.getByTestId("swipe-card").click({ position: { x: 40, y: 40 } });
  await page.getByRole("button", { name: "会話を通して再生" }).first().click();
}

test("録音があれば会話を録音で再生し、端末の読み上げは使わない", async ({ page }) => {
  const fetched = await withRecordings(page, [["A", A], ["B", B]]);
  await playDialogue(page);
  await expect.poll(() => fetched.length, { timeout: 10_000 }).toBe(2);
  expect(fetched).toEqual([`${clipHash(clipKey("A", A))}.opus`, `${clipHash(clipKey("B", B))}.opus`]);
  expect(await page.evaluate(() => window.__spoken.length)).toBe(0);
});

test("会話の中に録音の無い行があれば、声が混ざらないように全部を端末の声で読む", async ({ page }) => {
  const fetched = await withRecordings(page, [["A", A]]);
  await playDialogue(page);
  await page.waitForFunction(() => window.__spoken.length >= 2);
  expect(fetched).toEqual([]);
});

test("設定には録音で読む案内だけが出る（声の選択・録音のオン/オフはない）", async ({ page }) => {
  await withRecordings(page, [["A", A], ["B", B]]);
  await page.getByRole("button", { name: "音声の設定" }).click();
  await expect(page.getByTestId("voice-note")).toContainText("2文ぶん");
  await expect(page.locator("#toggle-recorded")).toHaveCount(0);
  await expect(page.locator("#voice-select")).toHaveCount(0);
  await expect(page.locator("#toggle-twoVoices")).toHaveCount(0);
});
