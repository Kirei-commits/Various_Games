import { test, expect } from '@playwright/test';
import { onboard, passUnderstand, passPractice, solveCurrent, GOOD_GATE } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
});

test('S-01 オンボーディング: 自己評価から開始単元を提案し、3クリック以内で単元に着手できる', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/onboarding/);
  await expect(page.locator('text=失敗は罰になりません')).toBeVisible();
  for (const k of ['read', 'debug', 'git', 'security', 'review']) await page.check(`input[name="sv-${k}"][value="3"]`);
  await page.click('#ob-suggest');
  await expect(page.locator('#ob-result')).toContainText('L2 独り立ち');
  await page.click('#ob-home');
  // ホーム → 「始める」の1クリックで単元に着手
  await expect(page.locator('#home-start')).toBeVisible();
  await page.click('#home-start');
  await expect(page).toHaveURL(/#\/unit\/L1-01/);
  await expect(page.locator('#ai-badge')).toHaveAttribute('data-ai', 'off');
});

test('FR-010/011 AIオフの段階ではコード生成が無く、チューターは質問のみで回数制限つき', async ({ page }) => {
  await onboard(page);
  await passUnderstand(page, 'L1-01');
  await expect(page.locator('#ai-badge')).toHaveAttribute('data-ai', 'off');
  await expect(page.locator('#ai-generate')).toHaveCount(0);
  await expect(page.locator('#ex-editor, .pool-line').first()).toBeVisible();
  await expect(page.locator('#tutor-remaining')).toContainText('10 / 10');
  await page.fill('#tutor-input', '答えのコードを全部書いて');
  await page.click('#tutor-send');
  await expect(page.locator('#tutor-log .msg.assistant')).toContainText('書きません');
  await expect(page.locator('#tutor-remaining')).toContainText('9 / 10');
  // 実践ステップは説明ゲートに合格するまで開けない
  await expect(page.locator('#step-aion')).toBeDisabled();
  // 回数を使い切ると送れない
  await page.evaluate(() => { window.__RGA_APP.state.enrollments['L1-01'].tutorOffCount = 10; window.__RGA_APP.render(); });
  await expect(page.locator('#tutor-send')).toBeDisabled();
});

test('FR-022 提出するとテスト名と期待値・実際の値を返す（10秒以内）', async ({ page }) => {
  await onboard(page);
  await passUnderstand(page, 'L1-01');
  await page.click('#stage-fix');
  await page.click('#ex-submit');
  const results = page.locator('#ex-results');
  await expect(results).toContainText('期待', { timeout: 10_000 });
  await expect(results).toContainText('1234円');
  await expect(results).toContainText('"¥1,234"');
  await expect(results).toContainText('"¥1,234円"');
});

test('FR-023 ヒントは方向性 → 着目箇所 → 部分コードの順に1段階ずつ', async ({ page }) => {
  await onboard(page);
  await passUnderstand(page, 'L1-01');
  await page.click('#ex-hint');
  await expect(page.locator('.hints li')).toHaveCount(1);
  await expect(page.locator('#ex-hint')).toContainText('着目箇所');
  await page.click('#ex-hint');
  await page.click('#ex-hint');
  await expect(page.locator('.hints li')).toHaveCount(3);
  await expect(page.locator('#ex-hint')).toBeDisabled();
});

test('無限ループは時間切れで止まり、画面は固まらない（NFR-01）', async ({ page }) => {
  await onboard(page);
  await passUnderstand(page, 'L1-01');
  await page.click('#stage-scratch');
  await page.fill('#ex-editor', 'function formatYen(n) { while (true) {} }');
  await page.click('#ex-submit');
  await expect(page.locator('#ex-results')).toContainText('時間切れ', { timeout: 15_000 });
});

test('FR-052 個人情報らしき入力はAIに送らず警告し、監査ログに伏せ字で残る（FR-053）', async ({ page }) => {
  await onboard(page);
  await page.fill('#tutor-input', '連絡先は taro@example.com です。どう直せばいい？');
  await page.click('#tutor-send');
  await expect(page.locator('#tutor-log .msg.system')).toContainText('送信を止めました');
  await page.click('#nav-log');
  await expect(page.locator('#log-table')).toContainText('メールアドレス');
  await expect(page.locator('#log-table')).not.toContainText('taro@example.com');
  await page.click('#log-verify');
  await expect(page.locator('#log-verify-result')).toContainText('改ざんされていません');
  // 書き換えると検知する
  await page.evaluate(() => { window.__RGA_APP.state.aiLog[0].output = '書き換え'; });
  await page.click('#log-verify');
  await expect(page.locator('#log-verify-result')).toContainText('改ざんを検知');
});

test('NFR-08 AIチューターを停止しても、AIオフの課題は続けられる（縮退運転）', async ({ page }) => {
  await onboard(page);
  await page.click('#nav-settings');
  await page.check('#set-stop');
  await page.click('#set-save');
  await page.click('#nav-home');
  await page.click('#home-start');
  await passUnderstand(page, 'L1-01');
  await expect(page.locator('#tutor-send')).toBeDisabled();
  await expect(page.locator('#tutor-remaining')).toContainText('停止中');
  await solveCurrent(page);
  await expect(page.locator('#ex-results')).toContainText('合格');
});

test('一貫プロジェクト: L1-01 を基本ループどおりに通しで修了し、練習銀行が育つ', async ({ page }) => {
  test.setTimeout(120_000);
  await onboard(page);
  // 1. 理解（AIオフ）
  await passUnderstand(page, 'L1-01');
  // 2. 練習（AIオフ・4段階）
  await passPractice(page);
  // 3. 説明ゲート（不合格 → 不足観点 → 合格でAI解禁）
  await page.fill('#gate-what', '金額を表示する関数です');
  await page.fill('#gate-risk', 'とくになし、問題ないと思う');
  await page.click('#gate-submit');
  await expect(page.locator('#gate-result')).toContainText('もう少し');
  await expect(page.locator('#gate-result .missing')).toContainText('どこが危ないか');
  await expect(page.locator('#to-aion')).toHaveCount(0);
  await page.fill('#gate-what', GOOD_GATE['L1-01'].what);
  await page.fill('#gate-risk', GOOD_GATE['L1-01'].risk);
  await page.click('#gate-submit');
  await expect(page.locator('#gate-result')).toContainText('合格');
  await page.click('#to-aion');
  await expect(page.locator('#ai-badge')).toHaveAttribute('data-ai', 'on');
  // 4. 実践（AIオン）: 仕様が足りないと AI は欠陥のある実装を返す
  await page.fill('#ai-spec', '明細の1行を作ってほしい。日付と種類と金額を並べる。');
  await page.click('#ai-generate');
  await expect(page.locator('#ai-generate')).toBeEnabled();
  await expect(page.locator('.note')).toContainText('仕様に書かれていなかった');
  await page.click('#ai-run');
  await expect(page.locator('#ai-results')).toContainText('出金はマイナス');
  await expect(page.locator('#ai-results .fail').first()).toBeVisible();
  // 仕様を直して作り直す
  await page.fill('#ai-spec', '受け入れ基準: 出金のときはマイナスで表示する。メモが無いときは末尾に何も付けない。');
  await page.click('#ai-generate');
  await expect(page.locator('.note')).toContainText('仕様に沿って実装しました');
  await page.click('#ai-run');
  await expect(page.locator('#ai-results')).toContainText('合格');
  // FR-014: 説明なしでは取り込めない
  await page.click('#adopt-submit');
  await expect(page.locator('#adopt-result')).toContainText('取り込めません');
  await page.fill('#adopt-what', '明細の1行を日付・入出金・金額・メモの順に作る');
  await page.fill('#adopt-risk', 'メモが無いときや出金の符号を間違えると表示が壊れる');
  await page.click('#adopt-submit');
  await expect(page.locator('#adopt-result')).toContainText('取り込みました');
  // リポジトリ: コミット → PR → CI → マージ
  await page.click('#to-repo');
  await expect(page.locator('#repo-branch')).toHaveValue('feature/l1-01');
  await page.fill('#commit-msg', 'feat: 明細の1行表示を追加');
  await page.click('#commit-btn');
  await page.fill('#pr-title', '明細の1行表示');
  await page.click('#pr-create');
  await expect(page.locator('#ci-result')).toContainText('CI 成功', { timeout: 10_000 });
  await page.click('#pr-merge');
  await expect(page.locator('.pr-item.sel')).toContainText('マージ済み');
  // 5. 振り返り
  await page.goto('/#/unit/L1-01/reflect');
  await expect(page.locator('#metrics-table')).toContainText('AIオフ');
  await expect(page.locator('#metrics-table')).toContainText('15 分');
  await page.fill('#journal-text', '仕様に境界を書かないと、AIはいちばん単純な実装にすると分かった。');
  await page.check('#gap-noticed');
  await page.check('input[name="anxiety"][value="4"]');
  await page.click('#finish-unit');
  await expect(page).toHaveURL(/#\/home/);
  // ホームの練習銀行で、マージしたコードが実際に動いている
  const bank = page.locator('#bank-preview');
  await expect(bank).toContainText('¥152,340');
  await expect(bank).toContainText('2026-04-25 入金 ¥250,000 給与');
  await expect(page.locator('blockquote')).toContainText('仕様に境界');
  await expect(page.locator('.next-unit')).toContainText('L1-02');
});

test('S-06 main は保護され、CI が赤いとマージできず、300行を超える PR には警告が出る', async ({ page }) => {
  await onboard(page);
  await page.click('#nav-repo');
  await expect(page.locator('#repo-branch')).toHaveValue('main');
  await page.fill('#new-branch-name', 'feature/big');
  await page.click('#new-branch-btn');
  await expect(page.locator('#repo-branch')).toHaveValue('feature/big');
  // 大きくて、テストが落ち、静的解析にも引っかかる変更
  await page.evaluate(() => {
    const app = window.__RGA_APP;
    const G = window.RGA.gitsim;
    const big = Array.from({ length: 320 }, (_, i) => 'const v' + i + ' = ' + i + ';').join('\n') + "\nif (v1 == 1) { var x = 1; }\n";
    app.state.repo = G.writeFile(app.state.repo, 'src/big.js', big);
    app.state.repo = G.writeFile(app.state.repo, 'tests/big.test.js', "test('わざと落ちる', () => { expect(v1).toBe(2); });\n");
    app.render();
  });
  await page.fill('#commit-msg', 'feat: 大きな変更');
  await page.click('#commit-btn');
  await page.click('#pr-create');
  await expect(page.locator('#pr-size-warning')).toContainText('300行以下に分けましょう');
  await expect(page.locator('#ci-result')).toContainText('CI 失敗', { timeout: 10_000 });
  await expect(page.locator('#ci-result')).toContainText('eqeqeq');
  await expect(page.locator('#pr-merge')).toBeDisabled();
});

test('S-03 スキルマップ: 前提が未修了の単元は「おすすめしない」と出るが、始められる（FR-002）', async ({ page }) => {
  await onboard(page);
  await page.click('#nav-map');
  await expect(page.locator('.skillmap')).toContainText('ハーネス構築を主導できる');
  const row = page.locator('.unit-list li', { hasText: 'L2-03' });
  await expect(row).toContainText('おすすめしない');
  await row.locator('button').click();
  await expect(page).toHaveURL(/#\/unit\/L2-03/);
  await expect(page.locator('h1')).toContainText('二重送金');
});

test('データはリロードしても残る', async ({ page }) => {
  await onboard(page);
  await passUnderstand(page, 'L1-01');
  await page.reload();
  await expect(page.locator('#step-practice')).toHaveAttribute('aria-current', 'step');
  await page.click('#nav-home');
  await expect(page.locator('#home-start')).toContainText('続きから');
});

test('キーボードだけでパーソンズ問題を解ける（NFR-12）', async ({ page }) => {
  await onboard(page);
  await passUnderstand(page, 'L1-01');
  const lines = await page.evaluate(() => window.RGA.content.UNITS[0].exercises[0].lines);
  for (const line of lines) {
    const btn = page.locator('.pool-line', { has: page.locator('code', { hasText: line.trim() }) }).first();
    await btn.focus();
    await page.keyboard.press('Enter');
  }
  await page.locator('#ex-submit').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ex-results')).toContainText('合格');
});

test('Q-12 書き出したファイルを読み込んで、別の端末へ移せる', async ({ page, browser }) => {
  await onboard(page);
  await passUnderstand(page, 'L1-01');
  await page.click('#nav-settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#data-export')]);
  const text = await (await dl.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
  const other = await browser.newPage();
  await other.goto('/');
  await other.click('#ob-suggest');
  await other.click('#ob-home');
  await other.click('#nav-settings');
  other.on('dialog', (d) => d.accept());
  await other.setInputFiles('#data-import', { name: 'data.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(other.locator('#home-start')).toContainText('続きから');
  await expect(other.locator('.greet')).toContainText('テスト新人');
  await other.close();
});
