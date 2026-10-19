// ハッカソン・レビューモード
import { test, expect } from '@playwright/test';
import { onboard } from './helpers.mjs';

// ページの中のデータ（RGA.hack）からお手本の答えを取り出して入力する
async function answer(page, id) {
  const p = await page.evaluate((pid) => { const f = window.RGA.hack.findProblem(pid); return { ...f.problem, sprint: f.sprint.no }; }, id);
  if (p.type === 'review') {
    for (const d of p.defects) {
      await page.click('#hk-line-' + d.line);
      await page.click('#hk-kind-' + d.kind);
    }
  } else if (p.type === 'fix') {
    await page.click('#hk-line-' + p.bugLine);
    await page.check('#hk-choice-' + p.answer);
  } else if (p.type === 'comment') {
    await page.fill('#hk-comment', p.sample);
  } else if (p.type === 'talk') {
    await page.check('#hk-choice-' + p.options.findIndex((o) => o.best));
  } else {
    await page.check('#hk-choice-' + p.answer);
  }
  await page.click('#hk-submit');
}

test('ハッカソン: ブリーフィング → レビュー・予想・関係者対応を解いてスプリント1を終え、2が開く', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/home');
  await page.click('#home-hack');
  await page.click('#hk-continue');
  await expect(page.locator('#hk-handout')).toContainText('useState');
  await page.click('#hk-start');
  await page.click('#hk-open-S01-1');
  // 何も指摘せずに出すと、見つかっていない欠陥の数を教えてくれる
  await page.click('#hk-submit');
  await expect(page.locator('#hk-feedback')).toContainText('まだ見つかっていない欠陥');
  await answer(page, 'S01-1');
  await expect(page.locator('#hk-why')).toContainText('正解');
  await page.click('#hk-next');
  await answer(page, 'S01-2');
  await page.click('#hk-next');
  // 関係者対応: 最善でない答えには相手の返事と気づきが返る
  await page.check('#hk-choice-0');
  await page.click('#hk-submit');
  await expect(page.locator('#hk-feedback')).toContainText('私です');
  await answer(page, 'S01-E');
  await page.click('#hk-to-sprint');
  await expect(page.locator('#hk-retro')).toBeVisible();
  await page.click('#hk-next-sprint');
  await expect(page.locator('h1')).toContainText('スプリント2');
});

test('ハッカソン: ヒントを全部開けると「答えを見る」が出て、答えを見た問題に記録される', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/hack/s/1');
  await page.click('#hk-start');
  await page.click('#hk-open-S01-2');
  await expect(page.locator('#hk-reveal')).toHaveCount(0);
  const n = await page.evaluate(() => window.RGA.hack.findProblem('S01-2').problem.hints.length);
  for (let i = 0; i < n; i++) await page.click('#hk-hint');
  await expect(page.locator('.hints li')).toHaveCount(n);
  await page.click('#hk-reveal');
  await expect(page.locator('#hk-why')).toContainText('答えと解説');
  await page.goto('/#/hack');
  await expect(page.locator('#hk-retry')).toContainText('S01-2');
  // 自力で解き直すと、一覧から消える
  await page.goto('/#/hack/p/S01-2');
  await page.click('#hk-retry-btn');
  await answer(page, 'S01-2');
  await page.goto('/#/hack');
  await expect(page.locator('#hk-retry')).toHaveCount(0);
});

test('ハッカソン: 自分のコードを直す・コメントを書く（乱暴な言い方は通らない）', async ({ page }) => {
  await onboard(page);
  // スプリント1を答えで終わらせて2を開く
  // 保存データを書き換えても、ページを離れるときに画面の状態で上書きされるので、画面の状態を直接変える
  await page.evaluate(() => {
    const { hack } = window.RGA;
    let pr = hack.emptyProgress();
    for (const p of hack.problemsOf(hack.SPRINTS[0])) pr = hack.solve(pr, p, false, 1);
    window.__RGA_APP.state.hack = pr;
  });
  await page.goto('/#/hack/p/S02-1');
  await page.click('#hk-line-5');
  await page.check('#hk-choice-0');
  await page.click('#hk-submit');
  await expect(page.locator('#hk-feedback')).toContainText('別の場所');
  await answer(page, 'S02-1');
  await expect(page.locator('#hk-why')).toBeVisible();
  await page.goto('/#/hack/p/S02-2');
  const sample = await page.evaluate(() => window.RGA.hack.findProblem('S02-2').problem.sample);
  await page.fill('#hk-comment', sample + ' こんなのダメです');
  await page.click('#hk-submit');
  await expect(page.locator('#hk-feedback')).toContainText('言い方');
  await answer(page, 'S02-2');
  await expect(page.locator('#hk-why')).toBeVisible();
});

test('ハッカソン: 登場人物の名前は設定で変えられ、チームと選択肢で話せる', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/settings');
  await page.fill('#set-name-shiraishi', 'ミナミ先輩');
  await page.click('#set-save');
  await page.goto('/#/hack/team/shiraishi');
  await expect(page.locator('.chat-panel h2')).toHaveText('ミナミ先輩');
  await page.click('#hk-topic-0');
  await expect(page.locator('#hk-chat-log')).toContainText('読んだコードの数');
  await expect(page.locator('#hk-free')).toHaveCount(0);
  await page.goto('/#/hack/s/1');
  await expect(page.locator('main')).toContainText('ミナミ先輩');
});

test('ハッカソン: 今日の雑談があり、分からないことはハッカソンの外の同期や先輩に聞きに行ける', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/hack');
  await expect(page.locator('#hk-smalltalk .bubble').first()).toBeVisible();
  await page.goto('/#/hack/s/1');
  const c = await page.evaluate(() => window.RGA.hack.consultsOf(1)[0]);
  await page.click('#hk-consult-0');
  await expect(page.locator('#hk-consults .consult-talk')).toContainText(c.lines[0][1].slice(0, 10));
  // 問題の画面からも聞ける
  await page.click('#hk-start');
  await page.click('#hk-open-S01-1');
  await page.click('#hk-consult-box summary');
  await expect(page.locator('#hk-consult-box .consult-talk')).toBeVisible();
  // チームと話す画面に、先輩と同期（ほかの部署）がいる
  await page.goto('/#/hack/team/miyamoto');
  await expect(page.locator('.chat-panel')).toContainText('相談できること');
  await page.click('#hk-topic-1');
  await expect(page.locator('#hk-chat-log')).toContainText('くん');
});

test('絆: 一緒にスプリントを終えると絆が深まり、エピソードが読めるようになる', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/hack/team/rio');
  await expect(page.locator('#hk-bond')).toContainText('絆 Lv0');
  await page.evaluate(() => {
    const { hack } = window.RGA;
    let pr = hack.emptyProgress();
    for (const s of hack.SPRINTS.slice(0, 6)) for (const p of hack.problemsOf(s)) pr = hack.solve(pr, p, false, 1);
    window.__RGA_APP.state.hack = pr;
  });
  await page.goto('/#/hack');
  await expect(page.locator('#hk-new-episodes')).toContainText('神崎');
  await page.goto('/#/hack/team/rio');
  await expect(page.locator('#hk-bond')).toContainText('絆 Lv1');
  await page.click('#hk-ep-rio-1 summary');
  await expect(page.locator('#hk-ep-rio-1')).toContainText('ラーメン');
  await expect(page.locator('#hk-ep-rio-1 summary')).not.toContainText('🆕');
});

test('作っているアプリ: スプリントを終えると機能が入り、前はバグのまま動く', async ({ page }) => {
  await onboard(page);
  const solveUpTo = async (n) => page.evaluate((k) => {
    const { hack } = window.RGA;
    let pr = hack.emptyProgress();
    for (const s of hack.SPRINTS.slice(0, k)) for (const p of hack.problemsOf(s)) pr = hack.solve(pr, p, false, 1);
    window.__RGA_APP.state.hack = pr;
  }, n);
  // スプリント3まで: 返答は届くが、口座番号は伏せ字にならない
  await solveUpTo(3);
  await page.goto('/#/hack/app');
  await page.fill('#app-input', '口座番号 1234567 です');
  await page.click('#app-send');
  await expect(page.locator('#app-log')).toContainText('そのまま AI に送られました');
  // スプリント12まで: 同意が必要になり、株は勧めず、伏せ字にしてから送る
  await solveUpTo(12);
  await page.goto('/#/hack');
  await page.click('#hk-open-app');
  await page.click('#app-agree');
  await page.fill('#app-input', 'おすすめの株は？');
  await page.click('#app-send');
  await expect(page.locator('#app-log')).toContainText('個別の銘柄は勧めない');
  await expect(page.locator('#app-log .disclaimer')).toContainText('投資助言ではありません');
  await page.fill('#app-input', '1000円を3人で割り勘したい');
  await page.click('#app-send');
  await expect(page.locator('#app-log')).toContainText('1 人だけ 1 円多く');
});
