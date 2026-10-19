// メッセンジャー（個別・グループのチャット）
import { test, expect } from '@playwright/test';
import { onboard } from './helpers.mjs';

test('チャット: 個別の部屋で話すとルールの返事が来る。グループでは名前を呼んだ人が答える', async ({ page }) => {
  await onboard(page);
  await page.click('#nav-chat');
  await expect(page.locator('h1')).toHaveText('チャット');
  await page.click('#chat-room-dm-rio');
  await expect(page.locator('#chat-log .bubble-row')).toHaveCount(1); // 相手からのひとこと
  await page.fill('#chat-input', 'おはよう！');
  await page.click('#chat-send');
  await expect(page.locator('#chat-log .bubble-row')).toHaveCount(3);
  await expect(page.locator('#chat-log .bubble-row.me')).toContainText('おはよう！');
  const greet = await page.evaluate(() => window.RGA.messenger.LINES.rio.greet.map((l) => window.RGA.hack.fill(l, { player: 'テスト新人' })));
  expect(greet).toContain(await page.locator('#chat-log .bubble-row:not(.me) .bubble p').last().textContent());
  await page.click('#chat-back');
  const last = await page.evaluate(() => window.RGA.hack.fill(window.__RGA_APP.state.messenger.rooms['dm-rio'].at(-1).text, { player: 'テスト新人' }));
  await expect(page.locator('#chat-room-dm-rio')).toContainText(last); // 一覧には最後のひとこと
  // グループ
  await page.click('#chat-room-g-daily');
  await expect(page.locator('#chat-log .bubble-row')).toHaveCount(2);
  await page.fill('#chat-input', '氷室、今日のお昼どうする？');
  await page.click('#chat-send');
  await expect(page.locator('#chat-log .bubble-row').nth(3)).toContainText('氷室 蓮');
  // 個人情報らしきものは送らない
  await page.fill('#chat-input', 'test@example.com に送って');
  await page.click('#chat-send');
  await expect(page.locator('#chat-log .bubble-row.me')).toHaveCount(1);
});

test('チャット: Gemini のキーがあると、グループの返事を JSON で受け取り、AI 利用ログに残る', async ({ page }) => {
  let body = null;
  await page.route('https://generativelanguage.googleapis.com/**', (route) => {
    body = JSON.parse(route.request().postData());
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      candidates: [{ content: { parts: [{ text: '[{"who":"kujo","text":"行こう、ちょうど腹ぺこ"},{"who":"kasuga","text":"私も！"}]' }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } }) });
  });
  await onboard(page);
  await page.evaluate(() => { Object.assign(window.__RGA_APP.state.settings, { provider: 'gemini', geminiKey: 'AIza-test' }); });
  await page.goto('/#/chat/g-daily');
  await expect(page.locator('#chat-log .bubble-row')).toHaveCount(2);
  await page.click('#chat-quick-3');
  await expect(page.locator('#chat-log .bubble-row')).toHaveCount(5);
  await expect(page.locator('#chat-log')).toContainText('行こう、ちょうど腹ぺこ');
  expect(body.systemInstruction.parts[0].text).toContain('JSON の配列');
  expect(body.contents[0].parts[0].text).toContain('今日のお昼どうする？');
  await page.goto('/#/log');
  await expect(page.locator('main')).toContainText('行こう、ちょうど腹ぺこ');
});
