/*
 * メンター用の学習レポートの画面（#/report）。ブラウザ専用。
 *   自分のレポートを見る・書き出す（JSON）／受け取ったレポートを読み込んで見る（自分のデータには混ぜない）
 * ダッシュボードでも同じ表示（renderReport）を使う。
 */
(function (g) {
  'use strict';
  const RGA = g.RGA;
  const P = RGA.report;
  let received = null; // 受け取ったレポート（保存しない。画面を離れると消える）

  function renderReport(ui, r, opts) {
    const h = ui.h;
    const o = opts || {};
    const tile = (label, value, sub) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-value' }, value), sub ? h('span', { class: 'stat-sub' }, sub) : null);
    const m = r.work.metrics || {};
    return h('div', { class: 'stack', id: o.id || null },
      o.title ? h('h2', null, o.title) : null,
      h('p', { class: 'muted small' }, (r.learner ? r.learner + 'さん ・ ' : '') + new Date(r.generatedAt).toLocaleString('ja-JP') + ' 時点'),
      h('div', { class: 'stats' },
        tile('単元', r.units.done.length + ' 修了', '取り組み中 ' + r.units.inProgress.length + ' ・ 説明ゲート1回目で合格 ' + r.units.gateFirstTry),
        tile('ハッカソン', r.hackathon.released ? 'リリース済み' : 'スプリント ' + r.hackathon.sprint + ' / ' + r.hackathon.total, '自力 ' + r.hackathon.solvedSelf + ' ・ 答えを見た ' + r.hackathon.solvedRevealed + ' ・ 相談 ' + r.hackathon.consulted),
        tile('配属先', r.work.done ? '1年目修了（' + r.work.grade + '）' : '第 ' + r.work.week + ' 週 / ' + r.work.total, '障害を自力で解決 ' + r.work.incidentsSelf + ' / ' + r.work.incidents),
        tile('チャレンジ', 'ベスト ' + r.challenge.bestAll + ' 問連続', '今日の5問 ' + r.challenge.dailyStreak + ' 日連続'),
        tile('称号', r.titles.length + ' 個', '答えを見た問題 ' + r.retryCount + ' 問（解き直し待ち）')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'plain' },
        h('thead', null, h('tr', null, ['言語テキスト', '章', '問題', '金のバッジ'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, r.texts.map((t) => h('tr', null, h('td', null, t.name), h('td', null, t.chapters + ' / ' + t.chapterCount), h('td', null, t.solved + ' / ' + t.total), h('td', null, String(t.gold))))))),
      m.users !== undefined ? h('p', { class: 'small' }, '配属先のアプリ: 利用者 ' + Number(m.users).toLocaleString('ja-JP') + ' 人 ・ ★' + Number(m.rating).toFixed(1) + ' ・ 技術的負債 ' + m.debt + ' ・ チームの体力 ' + m.stamina + ' ・ 社内の信頼 ' + m.trust) : null);
  }

  function view(ui) {
    const state = ui.state();
    const mine = P.buildReport(state, ui.now());
    const h = ui.h;
    const download = () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(mine, null, 2)], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'renshu-ginko-report.json' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const load = async (file) => {
      if (!file) return;
      const res = P.parseReport(await file.text());
      if (res.error) { ui.toast(res.error, 'warn'); return; }
      received = res.report;
      ui.render();
    };
    return h('div', { class: 'page' },
      h('h1', null, 'メンター用の学習レポート'),
      h('p', { class: 'muted' }, '学習データはこのブラウザの中にだけあるので、メンターに見てもらうときはレポートを書き出して渡します。入るのは進み具合の数と状態だけで、会話・振り返りの本文・AI とのやりとり・API キーは入りません。'),
      h('section', { class: 'card' },
        renderReport(ui, mine, { title: '自分のレポート', id: 'report-mine' }),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', id: 'report-export', onclick: download }, 'レポートを書き出す（JSON）'))),
      h('section', { class: 'card' },
        h('h2', null, '受け取ったレポートを見る（メンター向け）'),
        h('p', { class: 'muted small' }, '後輩から受け取ったファイルを読み込みます。あなたの学習データには混ざりません（画面を離れると消えます）。'),
        h('label', { class: 'btn', for: 'report-import' }, 'レポートを読み込む'),
        h('input', { id: 'report-import', type: 'file', accept: 'application/json,.json', class: 'sr-only', onchange: (e) => load(e.target.files[0]) }),
        received ? renderReport(ui, received, { title: '受け取ったレポート', id: 'report-received' }) : null));
  }

  RGA.reportView = { view, renderReport };
})(globalThis);
