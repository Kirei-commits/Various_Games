/*
 * チャレンジモード: ハッカソン・言語テキスト・配属先の問題から出題する腕試し。学習の記録には影響しない。
 *   バグハント（無限）  まちがえるまで続く。連続正解数の自己ベストを更新していく
 *   今日の5問（デイリー）  日付で決まる5問。続けた日数を数える
 *   言語ごと            どちらのモードも、言語（JavaScript・React・Java・Python・文章）で絞れる
 * 純粋。日付や開始の合図（乱数の代わりの種）は呼び出し側が文字列で渡す。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const H = RGA.hack;
  const { seededShuffle } = RGA.core;

  // 素早く答えられる形だけ（文章を書く comment は出さない）
  const TYPES = ['review', 'fix', 'conflict', 'predict', 'talk', 'order'];
  const LANG_FILTERS = [
    { id: 'all', name: 'すべて' },
    { id: 'js', name: 'JavaScript' },
    { id: 'react', name: 'React' },
    { id: 'java', name: 'Java' },
    { id: 'python', name: 'Python' },
    { id: 'text', name: '仕事の進め方' },
  ];
  const DAILY_COUNT = 5;

  // 出題できる問題の一覧 [{ src, problem }]
  function pool(lang) {
    const list = [];
    for (const s of H.SPRINTS) for (const p of H.problemsOf(s)) list.push({ src: 'ハッカソン スプリント' + s.no, problem: p });
    if (RGA.texts) for (const c of RGA.texts.COURSES) for (const ch of c.chapters) for (const q of RGA.texts.quizOf(ch)) list.push({ src: c.name + ' テキスト「' + ch.title + '」', problem: q });
    if (RGA.work) {
      for (const w of RGA.work.WEEKS) for (const p of [w.task, w.incident].filter(Boolean)) list.push({ src: '配属先 第' + w.no + '週', problem: p });
      for (const p of RGA.work.INCIDENTS) list.push({ src: '配属先の障害', problem: p });
    }
    return list.filter((x) => TYPES.includes(x.problem.type) && (!lang || lang === 'all' || x.problem.lang === lang));
  }

  // バグハントの出題順（開始の合図 seed で決まる）
  function huntOrder(lang, seed) {
    return seededShuffle(pool(lang), 'hunt-' + lang + '-' + seed);
  }
  // 今日の5問（日付と言語で決まる。同じ日なら誰が開いても同じ）
  function dailySet(dateStr, lang) {
    return seededShuffle(pool(lang), 'daily-' + dateStr + '-' + (lang || 'all')).slice(0, DAILY_COUNT);
  }

  function emptyRecords() {
    return { best: {}, daily: {} };
  }
  // 結果を記録（自己ベスト・デイリー）。新しい records を返す
  function recordHunt(rec, lang, streak) {
    const best = { ...rec.best };
    const isNew = streak > (best[lang] || 0);
    if (isNew) best[lang] = streak;
    return { records: { ...rec, best }, isNew };
  }
  function recordDaily(rec, dateStr, lang, score) {
    const key = dateStr + ':' + lang;
    const prev = rec.daily[key];
    return { ...rec, daily: { ...rec.daily, [key]: { score: Math.max(score, prev ? prev.score : 0), date: dateStr, lang } } };
  }
  // 続けた日数（今日か昨日まで、1日も空けずに今日の5問を終えた日の数）
  function dailyStreak(rec, todayStr) {
    const days = new Set(Object.values(rec.daily || {}).map((d) => d.date));
    const day = (s, k) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
    let cur = days.has(todayStr) ? todayStr : day(todayStr, -1);
    let n = 0;
    while (days.has(cur)) { n += 1; cur = day(cur, -1); }
    return n;
  }

  RGA.challenge = { TYPES, LANG_FILTERS, DAILY_COUNT, pool, huntOrder, dailySet, emptyRecords, recordHunt, recordDaily, dailyStreak };
})(globalThis);
