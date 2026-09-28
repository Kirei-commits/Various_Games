import { test as base, expect } from "@playwright/test";
import { swipe } from "./fixtures.mjs";

/**
 * Firebase の代わりに、同じインターフェースの偽クラウドを差し込む。
 * 「クラウド」の中身は __fakeCloudDb に置くので、アプリのデータを消せば「別の端末」を再現できる。
 */
function installFakeCloud() {
  const db = JSON.parse(localStorage.getItem("__fakeCloudDb") || "{}");
  let user = JSON.parse(localStorage.getItem("__fakeCloudUser") || "null");
  const listeners = new Set();
  const emit = () => listeners.forEach((cb) => cb(user));
  window.__saves = 0;
  window.__swipetalkCloud = {
    available: true,
    onAuthChange(cb) {
      listeners.add(cb);
      setTimeout(() => cb(user), 0);
      return () => listeners.delete(cb);
    },
    async signIn() {
      user = { uid: "u1", name: "Test User", email: "test@example.com", photo: "" };
      localStorage.setItem("__fakeCloudUser", JSON.stringify(user));
      emit();
    },
    async signOut() {
      user = null;
      localStorage.removeItem("__fakeCloudUser");
      emit();
    },
    async load(uid) {
      const d = db[uid];
      return d ? { state: JSON.parse(d.state), updatedAt: d.updatedAt } : null;
    },
    async save(uid, state, updatedAt) {
      db[uid] = { state: JSON.stringify(state), updatedAt };
      localStorage.setItem("__fakeCloudDb", JSON.stringify(db));
      window.__saves++;
    },
  };
}

const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(installFakeCloud);
    await page.goto("/");
    await expect(page.getByTestId("remaining")).toBeVisible();
    await use(page);
  },
});

const cloudLearned = (page) =>
  page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("__fakeCloudDb") || "{}").u1;
    return d ? Object.keys(JSON.parse(d.state).learned).length : null;
  });

/** アプリのデータだけ消して「別の端末」にする（クラウドとログイン状態は残す） */
async function switchDevice(page) {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith("swipetalk:")) localStorage.removeItem(k);
  });
  await page.reload();
}

async function login(page) {
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await page.getByRole("button", { name: /Google でログイン/ }).click();
  await expect(page.getByTestId("sync-status")).toHaveText(/クラウドに保存済み/);
}

test("ログイン前の進捗はログインするとアカウントに引き継がれる", async ({ page }) => {
  await swipe(page, 220);
  await expect(page.getByTestId("remaining")).toHaveText(/^49/);
  await swipe(page, 220);
  await expect(page.getByTestId("remaining")).toHaveText(/^48/);
  await login(page);
  await expect(page.getByTestId("account-card")).toContainText("test@example.com");
  expect(await cloudLearned(page)).toBe(2);
});

test("ログイン中の操作はまとめてクラウドに保存され、別の端末でも続きから始められる", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "学習", exact: true }).click();
  await swipe(page, 220);
  await expect.poll(() => cloudLearned(page), { timeout: 5000 }).toBe(1);

  await switchDevice(page);
  await expect(page.getByTestId("remaining")).toHaveText(/^49/);
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByTestId("sync-status")).toHaveText(/クラウドに保存済み/);
  await expect(page.getByText(/^1 \/ 2000 覚えた$/)).toBeVisible();
});

test("ログアウトすると、この端末から進捗が消える（クラウドには残る）", async ({ page }) => {
  await swipe(page, 220);
  await expect(page.getByTestId("remaining")).toHaveText(/^49/);
  await login(page);
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.getByRole("button", { name: /もう一度タップでログアウト/ }).click();
  await expect(page.getByRole("button", { name: /Google でログイン/ })).toBeVisible();
  await expect(page.getByText(/^0 \/ 2000 覚えた$/)).toBeVisible();
  expect(await cloudLearned(page)).toBe(1);

  // 同じアカウントで入り直すと戻ってくる
  await page.getByRole("button", { name: /Google でログイン/ }).click();
  await expect(page.getByText(/^1 \/ 2000 覚えた$/)).toBeVisible();
});

base("ログインしていなければ、端末にだけ保存中と表示してログインボタンを出す", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByTestId("account-card")).toContainText("この端末にだけ保存中");
  await expect(page.getByRole("button", { name: /Google でログイン/ })).toBeEnabled();
});
