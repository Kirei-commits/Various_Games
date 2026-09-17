/**
 * 受講者の画面。
 *
 * 既定は**選択式**。スマホでキーボードを出さずに最後まで進めることを優先している。
 * 書いて答えたい人のために記述式も残してあり、上の「キーボードで書いて答える」で切り替わる。
 *
 * 『しくみ』パネルは、Rally / Judge / Grade / Hint が公開している定数と戻り値を
 * そのまま表に起こしている。説明文をここで書き足さないこと（コードとずれるため）。
 */
import { byId, esc, rich, on, pct, clip } from './dom.js';
import * as Rally from '../core/rally.js';
import * as Judge from '../core/judge.js';
import * as Grade from '../core/grade.js';
import * as Hint from '../core/hint.js';
import * as Choice from '../core/choice.js';
import * as Store from '../core/store.js';
import { LEVELS, levelName, coverage, ALL_LEVELS } from '../core/banks.js';

let app = null;
let session = null;
let revealCriteria = false;

const el = {};
function cache() {
  for (const id of ['bank-select', 'mode', 'level', 'level-pick', 'write-mode', 'teacher-view',
    'unit-title', 'unit-reason', 'steps', 'chat', 'choices', 'answer-form', 'answer', 'submit',
    'skip', 'next', 'finish', 'hintcount', 'result', 'restart', 'wipe', 'progress-note', 'learner-lead',
    'm-plan', 'm-criteria', 'm-log', 'm-grade', 'm-state', 'm-levels']) {
    el[id] = byId(id);
  }
}

const body = (details) => details.querySelector('.m-body');

/* ── 起動と進行 ───────────────────────────── */

export function mount(context) {
  app = context;
  cache();

  el.mode.innerHTML = Rally.MODES.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('');
  el.level.innerHTML = ALL_LEVELS.map((L) => `<option value="${L}">${L}（${levelName(L)}）</option>`).join('');

  on(el['answer-form'], 'submit', (e) => { e.preventDefault(); submitText(); });
  on(el.answer, 'keydown', (e) => {
    // 送信は Ctrl/⌘+Enter。素の Enter は改行のまま残す（理由を複数行で書けるように）
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitText(); }
  });
  on(el.skip, 'click', skip);
  on(el.next, 'click', advance);
  on(el.finish, 'click', advance);
  on(el.restart, 'click', () => start(session.bankId));
  on(el.wipe, 'click', () => {
    if (!confirm('この端末に保存した成績を消します。作ったテストは消えません。よろしいですか。')) return;
    const authored = app.data.authored;
    app.data = Store.reset();
    app.data.authored = authored;              // 成績だけを消す。テストは講師の資産なので残す
    app.save();
    start(session.bankId);
  });

  on(el['bank-select'], 'change', (e) => start(e.target.value));
  on(el.mode, 'change', (e) => {
    app.data.settings.mode = e.target.value;
    app.save();
    start(session.bankId);
  });
  on(el.level, 'change', (e) => {
    app.data.settings.level = Number(e.target.value);
    app.save();
    start(session.bankId);
  });
  on(el['write-mode'], 'change', (e) => {
    app.data.settings.choiceMode = !e.target.checked;
    app.save();
    start(session.bankId);
  });
  on(el['teacher-view'], 'change', (e) => {
    revealCriteria = e.target.checked;
    app.data.settings.teacher = revealCriteria;
    app.save();
    refresh();
  });
}

/** 問題集を選んでラリーを始める。 */
export function start(bankId, overrides = {}) {
  const bank = app.registry.get(bankId);
  if (!bank) return;
  app.data.settings.bank = bank.id;
  app.save();

  const settings = app.data.settings;
  revealCriteria = !!settings.teacher;
  el['teacher-view'].checked = revealCriteria;
  el['write-mode'].checked = settings.choiceMode === false;

  session = Rally.create(bank, app.data.history, {
    seed: app.seed,
    mode: settings.mode,
    level: settings.level,
    choiceMode: settings.choiceMode !== false,
    attempts: Store.attemptsOf(app.data, bank.id),
    ...overrides
  });

  el.result.hidden = true;
  el.chat.innerHTML = '';
  question();
  refresh();
}

export const currentSession = () => session;

function submitText() {
  if (!session || !answerable()) return;
  const text = el.answer.value;
  if (!text.trim()) return;
  answered(text);
  const out = Rally.submit(session, text);
  el.answer.value = '';
  react(out);
}

function pickChoice(text) {
  if (!session || !answerable()) return;
  answered(text);
  react(Rally.choose(session, text));
}

const answerable = () => session.phase === 'asking' || session.phase === 'hinting';

function react(out) {
  if (!out) return;
  if (out.result && out.result.correct) cleared(out.result);
  else hint(out.hint);
  refresh();
}

function skip() {
  if (!session || !answerable()) return;
  const out = Rally.skip(session);
  if (out) skipped(out.hint);
  refresh();
}

function advance() {
  if (!session || (session.phase !== 'cleared' && session.phase !== 'skipped')) return;
  Rally.advance(session);
  if (session.phase === 'result') {
    app.data = Store.record(app.data, session);
    app.save();
    result();
  } else {
    question();
  }
  refresh();
}

/* ── 対話 ─────────────────────────────────── */

function msg(kind, who, html) {
  const div = document.createElement('div');
  div.className = 'msg ' + kind;
  div.innerHTML = `<span class="who">${esc(who)}</span>${html}`;
  el.chat.appendChild(div);
  el.chat.scrollTop = el.chat.scrollHeight;
  return div;
}

function question() {
  const q = Rally.current(session);
  const rec = Rally.currentRecord(session);
  // レベルは見出しの行に入れる。本文に回り込ませると、狭い画面で文字に重なる
  msg('q', `問題 ${session.index + 1} / ${session.size} ・ ${rec.unitLabel} ・ レベル${q.level}（${levelName(q.level)}）`,
    `<p>${rich(q.prompt)}</p>`);
}

const answered = (text) => msg('a', 'あなた', `<p>${esc(text)}</p>`);

function hint(h) {
  const rec = Rally.currentRecord(session);
  const projected = Grade.scoreOne({ ...rec, cleared: true });
  msg('hint', `ヒント ${h.stage} / ${Hint.REVEAL_STAGE}（${h.label}）`,
    `<p>${rich(h.text)}</p>`
    + `<p class="note">ここまでのヒント ${rec.hintsUsed} 回。この問題の到達点は ${projected} 点（満点1.0）になります。</p>`);
}

/** 正解したときの「なぜ正解なのか」。判定に使った語をそのまま出す。 */
function cleared(result) {
  const q = Rally.current(session);
  const rec = Rally.currentRecord(session);

  const evidence = rec.choiceMode
    ? `<div class="evidence"><h4>なぜこれが正解なのか</h4><p>${rich(q.model)}</p></div>`
    : `<div class="evidence"><h4>なぜこの回答で正解なのか</h4><dl>`
      + result.required.map((r) =>
        `<dt><span class="pill hit">満たした</span> ${esc(r.key)}</dt><dd>一致した語：<code>${esc(r.matched)}</code></dd>`).join('')
      + result.optional.map((o) =>
        `<dt><span class="pill ${o.hit ? 'opt' : 'miss'}">${o.hit ? '加点' : '未取得'}</span> ${esc(o.key)}</dt>`
        + `<dd>${o.hit ? '一致した語：<code>' + esc(o.matched) + '</code>' : '候補：' + esc(o.any.join(' / '))}</dd>`).join('')
      + `</dl></div><div class="evidence"><h4>模範解答</h4><p>${rich(q.model)}</p></div>`;

  msg('ok', `正解（ヒント ${rec.hintsUsed} 回 ・ 到達点 ${rec.score}）`,
    evidence
    + `<div class="evidence"><h4>この基準にしている理由</h4><p>${rich(q.why)}</p>`
    + `<p class="note">出典・確認先：${esc(q.source)}</p></div>`);
}

/** 飛ばしたとき。答えと解説はきちんと見せる（飛ばした＝学ばない、にしない） */
function skipped(h) {
  const q = Rally.current(session);
  msg('skip', '飛ばしました（この問題は 0 点）',
    `<p>${rich(h.text)}</p>`
    + `<div class="evidence"><h4>解説</h4><p>${rich(q.model)}</p>`
    + `<p class="note">${rich(q.why)}</p>`
    + `<p class="note">出典・確認先：${esc(q.source)}</p></div>`
    + '<p class="note">この問題は「復習（過去に出た問題）」で真っ先に出し直します。</p>');
}

/* ── 回答欄 ───────────────────────────────── */

function renderAnswerArea() {
  const rec = Rally.currentRecord(session);
  const q = Rally.current(session);
  const open = answerable();

  el['answer-form'].hidden = rec.choiceMode;
  el.choices.hidden = !rec.choiceMode;
  el.submit.disabled = !open;
  el.answer.disabled = !open;

  if (!rec.choiceMode) { el.choices.innerHTML = ''; return; }

  el.choices.innerHTML = '';
  const chosen = rec.inputs.map((i) => i.text);
  for (const text of rec.choiceOrder) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    const gone = rec.eliminated.includes(text);
    const wasChosen = chosen.includes(text);
    const isAnswer = !open && Choice.isCorrect(q, text);
    if (gone) btn.classList.add('gone');
    if (wasChosen) btn.classList.add(Choice.isCorrect(q, text) ? 'right' : 'wrong');
    if (isAnswer) btn.classList.add('right');
    btn.disabled = !open || gone || wasChosen;
    btn.innerHTML = rich(text);
    on(btn, 'click', () => pickChoice(text));
    el.choices.appendChild(btn);
  }
}

/* ── 画面の更新 ───────────────────────────── */

function refresh() {
  const phase = session.phase;
  const done = phase === 'cleared' || phase === 'skipped';
  const last = session.index + 1 >= session.size;

  banks();
  modes();
  head();
  renderAnswerArea();
  mechanics();

  el.skip.hidden = done || phase === 'result';
  el.next.hidden = !(done && !last);
  el.finish.hidden = !(done && last);

  const rec = Rally.currentRecord(session);
  el.hintcount.textContent = phase === 'result' ? ''
    : rec.skipped ? '飛ばしました'
    : rec.hintsUsed ? `ヒント ${rec.hintsUsed} / ${Hint.REVEAL_STAGE} 回目`
    : 'ここまでヒントなし';

  const p = Store.progress(app.data, session.bankId);
  el['progress-note'].textContent = p.runs
    ? `${session.bankName}：通算 ${p.runs} 回、最高 ${p.best} 点（${p.bestGrade}）`
    : `${session.bankName}：初挑戦です`;
  el['learner-lead'].textContent = `${session.size}問。${session.records[0].choiceMode ? 'えらんで答えます' : '書いて答えます'}。`
    + 'まちがえたらヒントが3段階、わからなければ飛ばせます。';

  if (!session.records[0].choiceMode && phase !== 'result' && document.activeElement !== el.answer) {
    // 書いて答えるときだけ入力欄に寄せる。選択式では触らない（キーボードを出さない）
    el.answer.focus();
  }
}

function banks() {
  const list = app.registry.list();
  el['bank-select'].innerHTML = list.map((b) =>
    `<option value="${esc(b.id)}"${b.id === session.bankId ? ' selected' : ''}>`
    + `${esc(b.name)}${b.origin === 'authored' ? '（講師作成）' : ''}</option>`).join('');
}

function modes() {
  const reviewable = Store.reviewCount(app.data, session.bankId);
  for (const opt of el.mode.options) {
    if (opt.value !== 'review') continue;
    opt.disabled = reviewable < 1;
    opt.textContent = reviewable
      ? `復習（過去に出た問題 ${reviewable} 問）`
      : '復習（まだ解いた問題がありません）';
  }
  el.mode.value = session.mode;
  el.level.value = String(session.level);
  el['level-pick'].hidden = session.mode !== 'level';
}

function head() {
  el['unit-title'].textContent = session.plan.title;
  el['unit-reason'].textContent = (session.plan.fellBack ? session.plan.fellBack + ' ' : '')
    + session.plan.reason + (session.plan.supportReason ? ' ' + session.plan.supportReason : '');

  el.steps.innerHTML = '';
  for (let i = 0; i < session.size; i++) {
    const li = document.createElement('li');
    const rec = session.records[i];
    const state = i < session.index ? (rec && rec.skipped ? 'skip' : 'done') : i === session.index ? 'now' : '';
    if (state) li.className = state;
    li.innerHTML = `<b>${i + 1}</b>${rec ? 'L' + rec.level : '–'}`;
    li.title = rec ? `${rec.unitLabel} / レベル${rec.level}（${levelName(rec.level)}）` : 'これから決まります';
    el.steps.appendChild(li);
  }
}

/* ── しくみパネル ─────────────────────────── */

function mechanics() {
  mechPlan(); mechCriteria(); mechLog(); mechGrade(); mechState(); mechLevels();
}

function mechPlan() {
  const p = session.plan;
  const modeMeta = Rally.MODES.find((m) => m.key === session.mode) || Rally.MODES[0];

  const ladder = session.mode === 'auto' ? `
    <h4>レベルの階段</h4>
    <p>予定（全問一発正解なら）：<code>${p.plannedLadder.join(' → ')}</code><br>
       実際：<code>${session.records.map((r) => r.level).join(' → ')}</code></p>
    <table class="k"><tr><th>条件</th><th>動き</th></tr>
      ${Rally.LADDER_RULES.map((r) => `<tr><td>${esc(r.cond)}</td><td>${r.delta > 0 ? '+1' : r.delta < 0 ? '−1' : '±0'} ${esc(r.text)}</td></tr>`).join('')}
    </table>` : '';

  const unitRanking = session.mode === 'auto' ? `
    <h4>単元を選ぶ規則</h4>
    <ul>${Rally.UNIT_RULES.map((r) => `<li>${esc(r.text)}</li>`).join('')}</ul>
    <table class="k"><tr><th>順</th><th>単元</th><th>受験</th><th>直近</th></tr>
      ${p.ranked.map((r, i) => `<tr${i === 0 ? ' class="now"' : ''}><td>${i + 1}</td><td>${esc(r.label)}</td>`
        + `<td>${r.played ? r.played + '回' : '未受験'}</td><td>${r.lastScore == null ? '—' : r.lastScore}</td></tr>`).join('')}
    </table>` : '';

  const reviewRules = session.mode === 'review' ? `
    <h4>復習で先に出す順番</h4>
    <ul>${Rally.REVIEW_RULES.map((r) => `<li>${esc(r.text)}</li>`).join('')}</ul>` : '';

  body(el['m-plan']).innerHTML = `
    <h4>出題の決め方</h4>
    <table class="k"><tr><th>決め方</th><th>中身</th></tr>
      ${Rally.MODES.map((m) => `<tr${m.key === session.mode ? ' class="now"' : ''}><td>${esc(m.label)}</td><td>${esc(m.note)}</td></tr>`).join('')}
    </table>
    <p>いまは <b>${esc(modeMeta.label)}</b>。${esc(p.reason)}</p>
    ${unitRanking}${ladder}${reviewRules}
    <h4>この問題が選ばれた理由</h4>
    <p>${esc(Rally.currentRecord(session).pickReason)}</p>
    ${session.mode === 'auto' ? `<p class="note">選定コスト = |レベル差| × ${Rally.PICK_COST.levelDistance}
      ＋ 単元（主 ${Rally.PICK_COST.mainUnit} / 補 ${Rally.PICK_COST.supportUnit} / 他 ${Rally.PICK_COST.otherUnit}）
      ＋ 最近解いた問題への上乗せ（最大 ${Rally.PICK_COST.recent}）。</p>` : ''}
    <h4>同じ問題ばかり出さないための規則</h4>
    <ul>${Rally.SHUFFLE_RULES.map((r) => `<li>${esc(r.text)}</li>`).join('')}</ul>
    ${session.mode === 'level' ? `<p class="note">レベル別では、選んだ段の未出題が残っているかぎり段を外しません。
      借りるのは、その段を出し切ったときだけです。</p>` : ''}`;
}

function mechCriteria() {
  const q = Rally.current(session);
  const rec = Rally.currentRecord(session);
  const open = revealCriteria || rec.cleared || rec.skipped || session.phase === 'result';

  const choiceTable = rec.choiceMode ? `
    <h4>選択肢</h4>
    <p class="note">データの決まりとして <code>choices</code> の先頭が正解。表示の順番はラリーごとに混ぜています。</p>
    <table class="k"><tr><th></th><th>選択肢</th></tr>
      ${(q.choices || []).map((c, i) => `<tr${i === 0 && open ? ' class="now"' : ''}>`
        + `<td><span class="pill ${i === 0 ? (open ? 'hit' : '') : 'miss'}">${i === 0 ? (open ? '正解' : '？') : '誤答'}</span></td>`
        + `<td>${open || i > 0 ? rich(c) : '<span class="mask">回答後に開示</span>'}</td></tr>`).join('')}
    </table>` : '';

  const group = (g, cls, label) => `<tr><td><span class="pill ${cls}">${label}</span></td><td>${esc(g.key)}</td>`
    + `<td>${open ? esc(g.any.join(' / ')) : '<span class="mask">回答後に開示</span>'}</td></tr>`;

  const rows = (q.criteria.required || []).map((g) => group(g, 'hit', '必須')).join('')
    + (q.criteria.optional || []).map((g) => group(g, 'opt', '加点')).join('')
    + (q.criteria.traps || []).map((g) => group(g, 'miss', '誤解')).join('');

  body(el['m-criteria']).innerHTML = `
    ${choiceTable}
    <h4>書いて答えるときの採点基準</h4>
    <p><b>達成基準：</b>${esc(Judge.RULE_TEXT)}</p>
    <table class="k"><tr><th>種別</th><th>観点</th><th>認める語</th></tr>${rows}</table>
    ${open ? '' : '<p class="note">受講者モードでは、正解と認める語は答えるまで伏せています。'
      + '上部の「採点基準を先に開示」を入れると先に見られます。</p>'}
    <h4>表記ゆれの吸収</h4>
    <p>照合の前に、両側を同じ手順で正規化しています。<br>
      <code>NFKC → 小文字化 → 空白と句読点・括弧を除去</code>。
      それで外れたら <code>ひらがな→カタカナ</code> と <code>長音を除去</code> した形でもう一度照合します。</p>
    <p class="note"><code>=</code> と <code>+</code> は除去しません。除去すると
      <code>==</code> が空文字になり、何にでも一致する条件ができてしまうためです。</p>`;
}

function mechLog() {
  const r = session.lastResult;
  if (!r) {
    body(el['m-log']).innerHTML = '<p class="note">まだ回答がありません。答えるとここに、'
      + '選んだもの（または入力と正規化後の文字列）と、観点ごとの当たり外れが出ます。</p>';
    return;
  }
  if (r.choice !== undefined) {
    body(el['m-log']).innerHTML = `
      <h4>選んだもの</h4><p>${rich(r.choice)}</p>
      <h4>判定</h4><p><b>${r.correct ? '正解' : '不正解'}</b>
        ${r.correct ? '' : '（正解はまだ伏せています）'}</p>
      <p class="note">選択式の判定は「選んだ文言が <code>choices</code> の先頭と一致するか」だけです。
        並びはラリーごとに混ぜているので、位置では当たりません。</p>`;
    return;
  }

  const row = (g, kind) => `<tr><td><span class="pill ${g.hit ? (kind === 'opt' ? 'opt' : 'hit') : 'miss'}">`
    + `${g.hit ? '○' : '×'}</span></td><td>${esc(g.key)}</td>`
    + `<td>${g.hit ? '<code>' + esc(g.matched) + '</code>' : '<span class="mask">一致なし</span>'}</td></tr>`;

  const traps = r.traps.length
    ? `<h4>検出した誤解</h4><ul>${r.traps.map((t) => `<li>${esc(t.key)}（<code>${esc(t.matched)}</code>）</li>`).join('')}</ul>`
    : '';

  body(el['m-log']).innerHTML = `
    <h4>入力</h4><p><code>${esc(clip(r.prepared.raw, 300) || '（空）')}</code></p>
    <h4>正規化後（照合に使った文字列）</h4><p><code>${esc(clip(r.prepared.norm, 300) || '（空）')}</code></p>
    <h4>観点ごとの判定</h4>
    <table class="k"><tr><th></th><th>観点</th><th>一致した語</th></tr>
      ${r.required.map((g) => row(g, 'req')).join('')}
      ${r.optional.map((g) => row(g, 'opt')).join('')}</table>
    ${traps}
    <p>必須 ${r.required.length - r.missing.length} / ${r.required.length} 充足
      → <b>${r.correct ? '正解' : '不正解'}</b>（充足率 ${Math.round(r.coverage * 100)}%）</p>`;
}

function mechGrade() {
  const recs = session.records.filter(Grade.isDone);
  const rows = recs.map((r) => `<tr><td>${esc(r.qid)}</td><td>L${r.level}</td>`
    + `<td>${r.skipped ? '飛ばし' : r.revealed ? '開示' : r.hintsUsed}</td>`
    + `<td>${Grade.scoreOne(r)}</td><td>×${Grade.levelWeight(r.level).toFixed(1)}</td></tr>`).join('');
  const now = Grade.scoreRally(session.records);
  const g = Grade.gradeOf(now);
  const nx = Grade.toNext(now);

  body(el['m-grade']).innerHTML = `
    <h4>1問ぶんの到達点</h4>
    <table class="k"><tr><th>ヒント</th>${Grade.BASE_BY_HINTS.map((_, i) => `<th>${i}回</th>`).join('')}<th>答えを見た</th><th>飛ばした</th></tr>
      <tr><td>到達点</td>${Grade.BASE_BY_HINTS.map((v) => `<td>${v}</td>`).join('')}<td>${Grade.REVEALED_BASE}</td><td>${Grade.SKIPPED_BASE}</td></tr></table>
    <p class="note">加点観点（書いて答えるときだけ）を全部拾うと最大 +${Grade.OPTIONAL_BONUS}。上限は 1.0。</p>
    <h4>重み付き平均</h4>
    <p><code>スコア = Σ(到達点 × レベル重み) / Σ(レベル重み) × 100</code><br>
       レベル重み = <code>0.6 + 0.2 × レベル</code>（L1=0.8 … L5=1.6）</p>
    ${rows ? `<table class="k"><tr><th>問題</th><th>Lv</th><th>ヒント</th><th>到達点</th><th>重み</th></tr>${rows}</table>` : ''}
    <p>現在 <b>${now} 点 → ${g.grade}</b>（${esc(g.label)}）
      ${nx ? `／ ${nx.grade} まであと <b>${nx.need}</b> 点` : '／ 最高評価です'}</p>
    <h4>評価の境目</h4>
    <table class="k"><tr><th>評価</th><th>下限</th><th>状態</th></tr>
      ${Grade.SCALE.map((s) => `<tr${s.grade === g.grade ? ' class="now"' : ''}><td>${s.grade}</td><td>${s.min}</td>`
        + `<td>${esc(s.label)} — ${esc(s.note)}</td></tr>`).join('')}</table>`;
}

function mechState() {
  const rec = Rally.currentRecord(session);
  const nodes = [['asking', '出題中'], ['hinting', 'ヒント中'], ['cleared', '正解・解説'],
    ['skipped', '飛ばした'], ['result', '評価']];
  const flow = nodes.map(([k, label]) =>
    `<span class="${session.phase === k ? 'now' : ''}">${label}</span>`).join('<i>→</i>');

  body(el['m-state']).innerHTML = `
    <div class="flow">${flow}</div>
    <p>不正解では <b>問題番号が進みません</b>。進める道は「正解する」か「飛ばす」かのどちらかで、
       ヒントは ${Hint.REVEAL_STAGE} 段目で答えを開示します。飛ばした問題は 0 点です。</p>
    <h4>ヒントの段階</h4>
    <table class="k"><tr><th>段</th><th>種類</th><th>出すもの</th></tr>
      ${Hint.STAGES.map((s) => `<tr${rec.hintsUsed === s.stage ? ' class="now"' : ''}>`
        + `<td>${s.stage}</td><td>${esc(s.label)}</td><td>${esc(s.desc)}</td></tr>`).join('')}</table>
    <p class="note">いまの問題：試行 ${rec.inputs.length} 回 ／ ヒント ${rec.hintsUsed} 回
      ${rec.skipped ? '／ 飛ばした' : rec.revealed ? '／ 答えを開示済み' : ''}</p>`;
}

function mechLevels() {
  const bank = session.bank;
  const cov = coverage(bank);
  const head = '<tr><th>単元</th>' + ALL_LEVELS.map((L) => `<th>L${L}</th>`).join('') + '<th>計</th></tr>';
  const rows = cov.map((c) => `<tr><td>${esc(c.unit.label)}</td>`
    + ALL_LEVELS.map((L) => `<td>${c.levels[L] || '–'}</td>`).join('') + `<td>${c.total}</td></tr>`).join('');

  body(el['m-levels']).innerHTML = `
    <p>レベルは「難しそうか」ではなく、<b>問われている行為</b>で決めています。
       上の「出題」で<b>レベル別</b>を選ぶと、その段だけを10問出します。</p>
    <table class="k"><tr><th>Lv</th><th>名前</th><th>できること</th><th>問いの形</th></tr>
      ${LEVELS.map((L) => `<tr${session.mode === 'level' && session.level === L.level ? ' class="now"' : ''}>`
        + `<td>${L.level}</td><td>${esc(L.name)}</td><td>${esc(L.ask)}</td><td>${esc(L.form)}</td></tr>`).join('')}
    </table>
    <h4>この問題集の品揃え</h4>
    <table class="k">${head}${rows}</table>
    <ul>${cov.map((c) => `<li><b>${esc(c.unit.label)}</b> — ${esc(c.unit.levelNote || '—')}</li>`).join('')}</ul>
    ${bank.generator ? `<p class="note">この問題集は「${esc(bank.generator.source)}」から
      ${bank.generator.engine === 'claude' ? 'Claude' : 'この端末'}で作られました。</p>` : ''}`;
}

/* ── 結果 ─────────────────────────────────── */

function result() {
  const s = session.summary;
  const progress = Store.progress(app.data, session.bankId);
  const bars = s.units.map((u) => `<div class="bar"><span>${esc(u.label)}</span>`
    + `<span class="track"><span class="fill" style="width:${pct(u.score)}"></span></span>`
    + `<span>${u.score}</span></div>`).join('');

  const weak = s.weak.length
    ? `<h3>次に上げるならここ</h3><table class="k"><tr><th>Lv</th><th>単元</th><th>つまずき</th><th>失点</th></tr>`
      + s.weak.slice(0, 6).map((w) => `<tr><td>L${w.level}</td><td>${esc(w.unitLabel)}</td>`
        + `<td>${w.skipped ? '飛ばした'
          : w.missedKeys.length ? esc(w.missedKeys.join('、')) + (w.revealed ? '（答えを開示）' : '')
          : w.revealed ? '答えを開示' : 'ヒント' + w.hintsUsed + '回'}</td>`
        + `<td>${w.lost}</td></tr>`).join('') + '</table>'
    : '<p>取りこぼしはありません。全問ヒント無しで到達しています。</p>';

  el.result.hidden = false;
  el.result.innerHTML = `
    <h2>おわり — ${esc(session.plan.title)}</h2>
    <div class="gradebox g-${s.grade.grade}">
      <div class="big">${s.grade.grade}</div>
      <div>
        <div class="score">${s.score} 点</div>
        <div class="note">${esc(s.grade.label)} — ${esc(s.grade.note)}<br>
          ${s.next ? `${s.next.grade} まであと ${s.next.need} 点` : '最高評価です'}
          ／ ヒント合計 ${s.hintTotal} 回 ／ 一発正解 ${s.perfect} / ${s.size} 問
          ${s.skipped ? `／ 飛ばした ${s.skipped} 問` : ''}</div>
      </div>
    </div>
    ${session.mode === 'auto' ? `<p class="note">レベルの推移：<code>${s.levelPath.join(' → ')}</code>
      （予定 <code>${s.plannedLadder.join(' → ')}</code>）</p>` : ''}
    <h3>単元ごとの到達点</h3><div class="bars">${bars}</div>
    ${weak}
    ${s.skipped ? '<p class="note">飛ばした問題は、上の「出題」で<b>復習</b>を選ぶと真っ先に出し直します。</p>' : ''}
    <p class="note">通算 ${progress.runs} 回 ／ 最高 ${progress.best} 点（${progress.bestGrade}）。</p>
    <div class="row">
      <button type="button" id="again" class="btn primary">もう一度</button>
      ${s.skipped || s.hintTotal ? '<button type="button" id="review" class="btn">つまずいた問題を復習する</button>' : ''}
    </div>`;

  on(byId('again'), 'click', () => start(session.bankId));
  on(byId('review'), 'click', () => {
    app.data.settings.mode = 'review';
    app.save();
    start(session.bankId);
  });
}
