/**
 * 進行役。状態は app 1つにまとめ、変化のたびに refresh() で描き直す。
 *
 * URL パラメータ
 *   ?bank=java|kuwata  問題集を指定
 *   ?seed=123          出題の並びを固定（テストと再現のため）
 *   ?teacher=1         講師モード（採点基準を先に開示）
 */
(function (global) {
  'use strict';
  const RR = (global.RR = global.RR || {});
  const { Banks, Rally, Store, Render } = RR;
  const doc = global.document;

  const app = {
    data: null,      // localStorage の中身
    session: null,   // いま走っているラリー
    teacher: false,
    seed: undefined
  };
  RR.app = app;

  function params() {
    try { return new URLSearchParams(global.location.search); } catch (e) { return new URLSearchParams(''); }
  }

  /* ── 進行 ───────────────────────────────── */

  function start(bankId) {
    app.data.settings.bank = bankId;
    Store.save(app.data);
    app.session = Rally.create(bankId, app.data.history, app.seed);
    Render.el.result.hidden = true;
    Render.clearChat();
    Render.question(app.session);
    refresh();
  }

  function submit() {
    const s = app.session;
    if (!s || s.phase === 'cleared' || s.phase === 'result') return;
    const text = Render.el.answer.value;
    if (!text.trim()) return;

    Render.answer(text);
    const out = Rally.submit(s, text);
    if (out.result.correct) Render.cleared(s, out.result);
    else Render.hint(out.hint, Rally.currentRecord(s));

    Render.el.answer.value = '';
    refresh();
  }

  function next() {
    const s = app.session;
    if (!s || s.phase !== 'cleared') return;
    Rally.advance(s);
    if (s.phase === 'result') finishUp();
    else Render.question(s);
    refresh();
  }

  function finishUp() {
    app.data = Store.record(app.data, app.session);
    Store.save(app.data);
    Render.result(app.session, Store.progress(app.data, app.session.bankId));
    const again = doc.getElementById('again');
    if (again) again.addEventListener('click', () => start(app.session.bankId));
  }

  /* ── 描き直し ───────────────────────────── */

  function refresh() {
    const s = app.session;
    const el = Render.el;
    const phase = s.phase;
    const last = s.index + 1 >= s.size;

    Render.banks(s.bankId, (id) => { if (id !== s.bankId) start(id); });
    Render.head(s);
    Render.mechanics(s, app.teacher);

    el.submit.disabled = phase === 'cleared' || phase === 'result';
    el.answer.disabled = el.submit.disabled;
    el.next.hidden = !(phase === 'cleared' && !last);
    el.finish.hidden = !(phase === 'cleared' && last);

    const rec = Rally.currentRecord(s);
    el.hintcount.textContent = phase === 'result' ? ''
      : rec.hintsUsed ? `ヒント ${rec.hintsUsed} / ${RR.Hint.REVEAL_STAGE} 回目`
      : 'ここまでヒントなし';

    const p = Store.progress(app.data, s.bankId);
    el['progress-note'].textContent = p.runs
      ? `${Banks.get(s.bankId).name}：通算 ${p.runs} 回、最高 ${p.best} 点（${p.bestGrade}）`
      : `${Banks.get(s.bankId).name}：初挑戦です`;

    if (phase !== 'result') el.answer.focus();
  }

  /* ── 起動 ───────────────────────────────── */

  function boot() {
    Render.cache();
    app.data = Store.load();

    const q = params();
    const seed = q.get('seed');
    if (seed !== null && seed !== '' && !Number.isNaN(Number(seed))) app.seed = Number(seed);
    app.teacher = q.get('teacher') === '1' || app.data.settings.teacher === true;

    const wanted = q.get('bank') || app.data.settings.bank;
    const bank = Banks.all().some((b) => b.id === wanted) ? wanted : Banks.all()[0].id;

    Render.el.teacher.checked = app.teacher;
    Render.el.teacher.addEventListener('change', (e) => {
      app.teacher = e.target.checked;
      app.data.settings.teacher = app.teacher;
      Store.save(app.data);
      refresh();
    });

    Render.el['answer-form'].addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    Render.el.answer.addEventListener('keydown', (e) => {
      // 送信は Ctrl/⌘+Enter。素の Enter は改行のまま残す（理由を複数行で書けるように）
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    });
    Render.el.next.addEventListener('click', next);
    Render.el.finish.addEventListener('click', next);
    Render.el.restart.addEventListener('click', () => start(app.session.bankId));
    Render.el.wipe.addEventListener('click', () => {
      app.data = Store.reset();
      start(app.session.bankId);
    });

    start(bank);
  }

  RR.boot = boot;
  RR.start = start;
  RR.submitAnswer = submit;

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
