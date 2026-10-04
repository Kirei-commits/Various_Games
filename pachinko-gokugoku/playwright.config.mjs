import { defineConfig, devices } from '@playwright/test';

// PW_CHROMIUM に chrome の実行ファイルのパスを入れると、それで起動する
// （ブラウザを取得できない環境向け。リポジトリ直下の LOOP.md 参照）
const executablePath = process.env.PW_CHROMIUM || undefined;
const PORT = 8085;                       // 他のゲームのテストサーバー(8080〜8084)と衝突させない
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  // rAF で進むゲームなので、並列を上げすぎるとフレームが間引かれて時間切れになる
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: executablePath ? { executablePath } : {}
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // 指での操作を実機に近い条件で検証する（hasTouch / pointer:coarse になる）
    { name: 'mobile', use: { ...devices['Pixel 5'] } }
  ],
  webServer: {
    command: 'node tests/serve.mjs',
    env: { PORT: String(PORT) },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
