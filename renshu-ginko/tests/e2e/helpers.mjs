// E2E の共通操作。答えはページの中の RGA.content（お手本）から取り出して入れる
export async function onboard(page, answers = { read: 1, debug: 1, git: 0, security: 0, review: 0 }) {
  await page.goto('/');
  await page.fill('#ob-name', 'テスト新人');
  for (const [k, v] of Object.entries(answers)) await page.check(`input[name="sv-${k}"][value="${v}"]`);
  await page.click('#ob-suggest');
  await page.click('#ob-start');
}

export async function passUnderstand(page, unitId) {
  await page.locator('#step-understand').waitFor();
  if (await page.locator('#est-save').count()) {
    await page.fill('#est-off', '15');
    await page.fill('#est-on', '10');
    await page.click('#est-save');
  }
  const answers = await page.evaluate((id) => window.RGA.content.UNITS.find((u) => u.id === id).predict.map((q) => q.answer), unitId);
  for (let i = 0; i < answers.length; i++) {
    await page.check(`input[name="pq-${i}"][value="${answers[i]}"]`);
    await page.click(`.pq-check[data-q="${i}"]`);
  }
  await page.click('#to-practice');
}

// 今表示している練習問題をお手本で解いて提出する
export async function solveCurrent(page) {
  await page.locator('.exercise h2').waitFor();
  const ex = await page.evaluate(() => {
    const id = document.querySelector('.exercise h2').textContent.split('／')[1].trim();
    const ex = window.RGA.content.UNITS.flatMap((u) => u.exercises).find((e) => e.id === id);
    return { id, stage: ex.stage, lines: ex.lines, answers: ex.answers, solution: ex.solution };
  });
  if (ex.stage === 'parsons') {
    await page.click('#ex-reset');
    await page.evaluate((lines) => {
      for (const line of lines) {
        const btn = [...document.querySelectorAll('.pool-line')].find((b) => b.querySelector('code').textContent === (line || ' '));
        btn.click();
      }
    }, ex.lines);
  } else if (ex.stage === 'blank') {
    for (let i = 0; i < ex.answers.length; i++) await page.fill('#blank-' + i, ex.answers[i]);
  } else {
    await page.fill('#ex-editor', ex.solution);
  }
  await page.click('#ex-submit');
  await page.locator('#ex-results .ok').waitFor();
  return ex;
}

export async function passPractice(page) {
  for (let guard = 0; guard < 12; guard++) {
    await solveCurrent(page);
    if (await page.locator('#to-gate').count()) { await page.click('#to-gate'); return; }
    if (await page.locator('#next-stage').count()) await page.click('#next-stage');
    else await page.click('#next-ex');
  }
  throw new Error('練習が終わらない');
}

export const GOOD_GATE = {
  'L1-01': { what: '金額を¥とカンマの3桁区切りの文字列にして、マイナスなら符号を先頭に付ける', risk: '小数は四捨五入で丸めるので端数が消える。数値以外の文字列が来ると壊れる' },
};
