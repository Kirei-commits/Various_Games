import { defineConfig, devices } from '@playwright/test';

const PORT = 8082;                       // 五目並べ(8080)・つりクエスト(8081)と衝突させない
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off'
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // 指での操作を実機に近い条件で検証する（hasTouch / pointer:coarse になる）
    { name: 'mobile', use: { ...devices['Pixel 5'] } }
  ],

  webServer: {
    command: `node tests/serve.mjs`,
    env: { PORT: String(PORT) },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
