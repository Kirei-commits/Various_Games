/*
 * チャレンジモードの画面（ブラウザ専用）
 *   #/challenge        モードと言語を選ぶ（自己ベスト・今日の5問・続けた日数）
 *   #/challenge/run    挑戦中（ヒントと「答えを見る」はなし。学習の記録には影響しない）
 * 問題の部品はハッカソンと共通（hack-view.js）。入力は挑戦ごとの使い捨て。
 */
(function (g) {
  'use strict';
  const RGA = g.RGA;
  const C = RGA.challenge;
  const H = RGA.hack;
  const V = () => RGA.hackView;

  let run = null; // { mode: 'hunt' | 'daily', lang, list, i, score, work, result, over }

  function recordsOf(state) {
    if (!state.challenge) state.challenge = C.emptyRecords();
    return state.challenge;
  }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const lang = { id: 'all' };

  function view(ui, args) {
    if (args[0] === 'run' && run) return viewRun(ui);
    return viewHome(ui);
  }

  function viewHome(ui) {
    const rec = recordsOf(ui.state());
    const d = rec.daily[today() + ':' + lang.id];
    const count = C.pool(lang.id).length;
    const start = (mode) => {
      const list = mode === 'hunt' ? C.huntOrder(lang.id, String(Date.now())) : C.dailySet(today(), lang.id);
      run = { mode, lang: lang.id, list, i: 0, score: 0, work: {}, result: null, over: false };
      ui.go('#/challenge/run');
    };
    return ui.h('div', { class: 'page' },
      ui.h('h1', null, 'チャレンジ'),
      ui.h('p', { class: 'muted' }, 'ハッカソン・言語テキスト・配属先の問題から出題する腕試しです。ヒントと「答えを見る」はありません。学習の記録には影響しません。'),
      ui.h('div', { class: 'row wrap', role: 'group', 'aria-label': '言語' }, C.LANG_FILTERS.map((f) => ui.h('button', { class: 'btn tiny' + (lang.id === f.id ? ' primary' : ''), id: 'ch-lang-' + f.id, 'aria-pressed': lang.id === f.id ? 'true' : 'false', onclick: () => { lang.id = f.id; ui.render(); } }, f.name))),
      ui.h('p', { class: 'muted small' }, '出題される問題: ' + count + ' 問'),
      ui.h('div', { class: 'home-grid' },
        ui.h('section', { class: 'card' },
          ui.h('p', { class: 'eyebrow' }, 'バグハント（無限）'),
          ui.h('h2', null, '自己ベスト ' + (rec.best[lang.id] || 0) + ' 問連続'),
          ui.h('p', { class: 'small' }, 'まちがえるまで続きます。何問続けて正解できるか。'),
          ui.h('button', { id: 'ch-hunt', class: 'btn primary', disabled: !count, onclick: () => start('hunt') }, 'バグハントを始める')),
        ui.h('section', { class: 'card' },
          ui.h('p', { class: 'eyebrow' }, '今日の' + C.DAILY_COUNT + '問（デイリー）'),
          ui.h('h2', null, d ? '今日の結果 ' + d.score + ' / ' + C.DAILY_COUNT : 'まだ挑戦していません'),
          ui.h('p', { class: 'small' }, '日付で決まる' + C.DAILY_COUNT + '問。続けた日数: ', ui.h('strong', { id: 'ch-streak' }, C.dailyStreak(rec, today()) + ' 日')),
          ui.h('button', { id: 'ch-daily', class: 'btn primary', disabled: count < C.DAILY_COUNT, onclick: () => start('daily') }, d ? 'もう一度挑戦する' : '今日の5問を始める'))));
  }

  function viewRun(ui) {
    const names = V().namesOf(ui.state());
    const r = run;
    const label = (r.mode === 'hunt' ? 'バグハント' : '今日の' + C.DAILY_COUNT + '問') + ' ・ ' + C.LANG_FILTERS.find((f) => f.id === r.lang).name;
    if (r.over) return finishView(ui, label);
    const item = r.list[r.i % r.list.length];
    const p = item.problem;
    const done = !!r.result;
    const refresh = (fn) => { fn(); ui.render(); };
    return ui.h('div', { class: 'page' },
      ui.h('p', { class: 'crumbs' }, ui.h('a', { href: '#/challenge' }, 'チャレンジ'), ' › ' + label),
      ui.h('div', { class: 'row between' }, ui.h('h1', null, r.mode === 'hunt' ? r.score + ' 問連続' : (r.i + 1) + ' / ' + C.DAILY_COUNT + ' 問目'), ui.h('span', { class: 'tag' }, item.src)),
      ui.h('section', { class: 'card exercise', id: 'ch-card' },
        ui.h('h2', null, H.fill(p.title, names)),
        ui.h('p', { class: 'row small' }, V().langTag(ui, p), ui.h('span', { class: 'tag' }, V().TYPE_NAME[p.type])),
        p.story ? ui.h('p', { class: 'note small' }, H.fill(p.story, names)) : null,
        V().problemWidget(ui, p, r.work, names, done, refresh),
        !done ? ui.h('div', { class: 'row' }, ui.h('button', { id: 'ch-submit', class: 'btn primary', onclick: () => answer(ui) }, '答える')) : null,
        done ? ui.h('div', { class: 'stack highlight-box', id: 'ch-result' },
          ui.h('h3', null, r.result.pass ? '正解！' : '残念……'),
          r.result.pass ? null : V().explain(ui, p, names),
          ui.h('div', { class: 'row end' }, ui.h('button', { id: 'ch-next', class: 'btn primary', onclick: () => next(ui) }, nextLabel()))) : null));
  }
  function nextLabel() {
    if (run.mode === 'hunt') return run.result.pass ? '次の問題へ' : '結果を見る';
    return run.i + 1 >= C.DAILY_COUNT ? '結果を見る' : '次の問題へ';
  }
  function answer(ui) {
    const p = run.list[run.i % run.list.length].problem;
    run.result = H.grade(p, run.work);
    if (run.result.pass) { run.score += 1; ui.sfx('pass'); }
    ui.render();
  }
  function next(ui) {
    const r = run;
    const end = r.mode === 'hunt' ? !r.result.pass : r.i + 1 >= C.DAILY_COUNT;
    if (end) {
      r.over = true;
      ui.update((s) => {
        const rec = recordsOf(s);
        if (r.mode === 'hunt') {
          const out = C.recordHunt(rec, r.lang, r.score);
          s.challenge = out.records;
          r.isNew = out.isNew;
        } else s.challenge = C.recordDaily(rec, today(), r.lang, r.score);
      });
      if (r.isNew && r.score > 0) ui.celebrate('review', '自己ベスト更新！', r.score + ' 問連続');
    } else {
      r.i += 1;
      r.work = {};
      r.result = null;
    }
    ui.render();
  }
  function finishView(ui, label) {
    const r = run;
    return ui.h('div', { class: 'page' },
      ui.h('p', { class: 'crumbs' }, ui.h('a', { href: '#/challenge' }, 'チャレンジ'), ' › ' + label),
      ui.h('section', { class: 'card highlight', id: 'ch-finish' },
        ui.h('h1', null, r.mode === 'hunt' ? r.score + ' 問連続で正解！' : C.DAILY_COUNT + ' 問中 ' + r.score + ' 問正解'),
        r.isNew ? ui.h('p', { class: 'ok' }, '自己ベストを更新しました。') : null,
        ui.h('p', { class: 'muted small' }, 'まちがえた問題は、元のモード（ハッカソン・テキスト・配属先）でヒントを見ながら解き直せます。'),
        ui.h('div', { class: 'row' },
          ui.h('button', { id: 'ch-again', class: 'btn primary', onclick: () => { run = null; ui.go('#/challenge'); } }, 'チャレンジのトップへ'))));
  }

  RGA.challengeView = { view, recordsOf };
})(globalThis);
