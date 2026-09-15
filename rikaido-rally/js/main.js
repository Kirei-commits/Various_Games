/**
 * 起動と画面の出し分け。
 *
 * 画面は3つ（ログイン → 受講者 / 講師）。ここが持っているのは
 * 「いま誰か」「保存データ」「問題集の一覧」の3つだけで、中身の仕事は ui/ に任せる。
 *
 * URL パラメータ
 *   ?role=learner|teacher     ログイン画面を飛ばす（テストと、共有リンク用）
 *   ?bank=<id>                テストを指定
 *   ?mode=auto|level|review   出題の決め方
 *   ?level=1..5               レベル別のときの段
 *   ?style=choice|text        えらんで答える／書いて答える
 *   ?seed=123                 出題の並びを固定（再現用）
 *   ?criteria=1               採点基準を先に開示した状態で始める
 */
import { byId, $$, on, showScreen } from './ui/dom.js';
import * as Learner from './ui/learner.js';
import * as Teacher from './ui/teacher.js';
import * as Store from './core/store.js';
import { createRegistry } from './core/banks.js';
import javaBank from './data/bank-java.js';
import kuwataBank from './data/bank-kuwata.js';

const params = (() => {
  try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); }
})();

const app = {
  data: Store.load(),
  registry: null,
  seed: undefined,
  role: null,
  save() { Store.save(this.data); },
  goLearner(bankId) { setRole('learner'); Learner.start(bankId || this.data.settings.bank); }
};

/** 同梱の問題集と、講師が作って保存したものを1つの並びにする */
function buildRegistry() {
  const builtin = [javaBank, kuwataBank].map((b) => ({ ...b, origin: 'builtin' }));
  const registry = createRegistry(builtin);
  for (const bank of app.data.authored) {
    try { registry.add(bank, { replace: true }); } catch (e) { /* 壊れた保存は黙って飛ばす */ }
  }
  return registry;
}

function setRole(role) {
  app.role = role;
  app.data.settings.role = role;
  app.save();
  if (role === 'teacher') { Teacher.refresh(); showScreen('screen-teacher'); }
  else if (role === 'learner') showScreen('screen-learner');
  else showScreen('screen-login');
}

/* ── ログイン画面 ─────────────────────────── */

const PASS_KEY = 'rikaido-rally.teacher-pass';
const readPass = () => { try { return localStorage.getItem(PASS_KEY); } catch (e) { return null; } };
const writePass = (v) => { try { localStorage.setItem(PASS_KEY, v); } catch (e) { /* 保存できなくても続ける */ } };

function wireLogin() {
  const form = byId('passcode-form');
  const input = byId('passcode');
  const note = byId('passcode-note');

  on(byId('role-learner'), 'click', () => {
    setRole('learner');
    Learner.start(app.data.settings.bank);
  });

  on(byId('role-teacher'), 'click', () => {
    const saved = readPass();
    form.hidden = false;
    note.textContent = saved
      ? '合言葉を入れてください。'
      : 'この端末ではまだ合言葉が決まっていません。いま入れたものが次回からの合言葉になります（空のままでも入れます）。';
    input.value = '';
    input.focus();
  });

  on(byId('passcode-cancel'), 'click', () => { form.hidden = true; });

  on(form, 'submit', (e) => {
    e.preventDefault();
    const saved = readPass();
    const given = input.value;
    if (saved === null) {
      writePass(given);
    } else if (given !== saved) {
      note.textContent = '合言葉が違います。';
      note.style.color = 'var(--bad)';
      return;
    }
    form.hidden = true;
    setRole('teacher');
  });

  for (const btn of $$('[data-go]')) {
    on(btn, 'click', () => {
      const to = btn.dataset.go;
      if (to === 'login') setRole(null);
      else if (to === 'learner') { setRole('learner'); Learner.start(app.data.settings.bank); }
      else setRole('teacher');
    });
  }
}

/* ── 起動 ─────────────────────────────────── */

function boot() {
  document.documentElement.dataset.theme = app.data.settings.theme === 'auto' ? 'auto' : 'light';

  const seed = params.get('seed');
  if (seed !== null && seed !== '' && !Number.isNaN(Number(seed))) app.seed = Number(seed);
  if (params.get('criteria') === '1') app.data.settings.teacher = true;

  const mode = params.get('mode');
  if (['auto', 'level', 'review'].includes(mode)) app.data.settings.mode = mode;
  const level = Number(params.get('level'));
  if (level >= 1 && level <= 5) app.data.settings.level = level;
  const style = params.get('style');
  if (style === 'text') app.data.settings.choiceMode = false;
  if (style === 'choice') app.data.settings.choiceMode = true;

  app.registry = buildRegistry();
  const wanted = params.get('bank') || app.data.settings.bank;
  app.data.settings.bank = app.registry.has(wanted) ? wanted : app.registry.list()[0].id;

  wireLogin();
  Learner.mount(app);
  Teacher.mount(app);

  const role = params.get('role');
  if (role === 'learner' || role === 'teacher') {
    setRole(role);
    if (role === 'learner') Learner.start(app.data.settings.bank);
  } else {
    setRole(null);
  }

  // テストと、あとから触りたいとき用の入口
  window.RR = { app, Learner, Teacher, session: () => Learner.currentSession() };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
