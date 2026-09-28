import { test } from "node:test";
import assert from "node:assert/strict";
import { detectInAppBrowser, lineExternalUrl } from "../../src/env.js";

const UA = {
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0",
  instagram: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36 Instagram 330.0",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
};

test("アプリ内ブラウザを見分ける（普通の Safari / Chrome は null）", () => {
  assert.equal(detectInAppBrowser(UA.line), "LINE");
  assert.equal(detectInAppBrowser(UA.instagram), "Instagram");
  assert.equal(detectInAppBrowser(UA.safari), null);
  assert.equal(detectInAppBrowser(UA.chrome), null);
});

test("LINE では外部ブラウザで開き直す URL を作る（一度だけ）", () => {
  const base = "https://kirei-commits.github.io/Various_Games/eikaiwa-swipe/";
  const once = lineExternalUrl(base);
  assert.equal(once, `${base}?openExternalBrowser=1`);
  assert.equal(lineExternalUrl(once), null);
  assert.equal(lineExternalUrl(`${base}?a=1`), `${base}?a=1&openExternalBrowser=1`);
});
