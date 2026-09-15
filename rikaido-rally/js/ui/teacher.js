/**
 * 講師の画面。資料 → テキスト → 問題集。
 *
 * 作り方は2通りあるが、**そのあとの道は1本しかない**。
 * どちらで作っても js/author/validate.js を必ず通り、通らなかった問題は捨てて理由を出す。
 * 「作れたけど採点できない問題」を受講者に出さないための一本道。
 */
import { byId, esc, rich, on, clip } from './dom.js';
import { extractFile, SUPPORTED_EXTENSIONS } from '../author/extract.js';
import { generateBank } from '../author/generate.js';
import { validateBank } from '../author/validate.js';
import * as LLM from '../author/llm.js';
import * as Store from '../core/store.js';
import { levelName } from '../core/banks.js';

let app = null;
let draft = null;              // 生成したがまだ保存していない問題集
let claudeStatus = { server: false, claude: false, reason: '' };

const el = {};
function cache() {
  for (const id of ['drop', 'file', 'pick', 'extracted', 'source-text', 'rubric', 'prompt',
    'engine', 'per-unit', 'bank-name', 'engine-note', 'generate', 'gen-status', 'gen-report',
    'bank-list', 'import', 'import-file', 'import-note', 'drop-formats']) {
    el[id] = byId(id);
  }
}

export function mount(context) {
  app = context;
  cache();

  el['drop-formats'].textContent = '読めるもの：' + SUPPORTED_EXTENSIONS.map((e) => '.' + e).join(' ');
  el.rubric.value = app.data.studio.rubric;
  el.prompt.value = app.data.studio.prompt;
  el.engine.value = app.data.studio.engine;
  el['per-unit'].value = String(app.data.studio.perUnit);

  on(el.pick, 'click', () => el.file.click());
  on(el.file, 'change', (e) => ingest([...e.target.files]));

  for (const type of ['dragenter', 'dragover']) {
    on(el.drop, type, (e) => { e.preventDefault(); el.drop.classList.add('over'); });
  }
  for (const type of ['dragleave', 'drop']) {
    on(el.drop, type, (e) => { e.preventDefault(); el.drop.classList.remove('over'); });
  }
  on(el.drop, 'drop', (e) => ingest([...(e.dataTransfer?.files || [])]));

  for (const [id, key] of [['rubric', 'rubric'], ['prompt', 'prompt']]) {
    on(el[id], 'change', () => { app.data.studio[key] = el[id].value; app.save(); });
  }
  on(el.engine, 'change', async () => {
    app.data.studio.engine = el.engine.value;
    app.save();
    engineNote();
    // 生成サーバーの有無は、Claude を選んだときに初めて調べる。
    // 起動時に毎回叩くと、サーバーが居ない公開ページでコンソールに 404 が残る。
    if (el.engine.value === 'claude' && !claudeStatus.server) await probeClaude();
  });
  on(el['per-unit'], 'change', () => {
    app.data.studio.perUnit = Number(el['per-unit'].value); app.save();
  });

  on(el.generate, 'click', generate);
  on(el.import, 'click', () => el['import-file'].click());
  on(el['import-file'], 'change', (e) => importJson(e.target.files[0]));

  if (app.data.studio.engine === 'claude') probeClaude();
  renderBanks();
}

export function refresh() { renderBanks(); engineNote(); }

/* ── 1. 資料を読む ─────────────────────────── */

async function ingest(files) {
  if (!files.length) return;
  el.extracted.hidden = false;
  el.extracted.innerHTML = '';
  const texts = [];

  for (const file of files) {
    const row = document.createElement('div');
    row.className = 'file';
    row.innerHTML = `<b>${esc(file.name)}</b><span class="note">読み込み中…</span>`;
    el.extracted.appendChild(row);
    try {
      const got = await extractFile(file);
      texts.push(`# ${file.name}\n${got.text}`);
      row.innerHTML = `<b>${esc(got.name)}</b>`
        + `<span class="note">${esc(got.kind)} / ${esc(got.encoding)} / ${Math.round(got.bytes / 102.4) / 10}KB `
        + `→ ${got.text.length.toLocaleString('ja-JP')}文字</span>`
        + got.warnings.map((w) => `<span class="warn">⚠ ${esc(w)}</span>`).join('');
    } catch (e) {
      row.innerHTML = `<b>${esc(file.name)}</b><span class="err">✘ ${esc(e.message)}</span>`;
    }
  }

  if (texts.length) {
    const joined = texts.join('\n\n');
    el['source-text'].value = el['source-text'].value.trim()
      ? el['source-text'].value.trim() + '\n\n' + joined
      : joined;
    if (!el['bank-name'].value.trim()) {
      el['bank-name'].value = files[0].name.replace(/\.[^.]+$/, '');
    }
  }
}

/* ── 4. 作る ──────────────────────────────── */

async function probeClaude() {
  claudeStatus = { ...(await LLM.probe()), checked: true };
  engineNote();
}

function engineNote() {
  const engine = el.engine.value;
  if (engine === 'claude' && !claudeStatus.server && !claudeStatus.checked) {
    el['engine-note'].textContent = '生成サーバーを確認しています…';
    return;
  }
  if (engine === 'local') {
    el['engine-note'].textContent =
      'この端末の中だけで作ります。鍵も通信も要りません。資料の一文をそのまま根拠にするので、'
      + '作文された正解が混ざりません。そのぶん問い方は型どおりになります。';
    return;
  }
  el['engine-note'].innerHTML = claudeStatus.claude
    ? `生成サーバーに繋がっています（model=<code>${esc(claudeStatus.model || '-')}</code>）。`
      + 'API キーはサーバー側にだけ置かれ、この画面には渡りません。'
    : `<span style="color:var(--bad)">${esc(claudeStatus.reason || '生成サーバーがありません。')}</span>`
      + ' 手元で <code>ANTHROPIC_API_KEY=… npm run studio</code> を動かすと使えるようになります。'
      + '公開ページから直接 Claude を呼ぶ作りにはしていません（鍵が全員に配られてしまうため）。';
}

async function generate() {
  const text = el['source-text'].value.trim();
  if (!text) { status('先に資料を読み込むか、本文を貼り付けてください。', 'bad'); return; }

  const payload = {
    text,
    rubric: el.rubric.value.trim(),
    prompt: el.prompt.value.trim(),
    source: el['bank-name'].value.trim() || '資料',
    name: el['bank-name'].value.trim(),
    perUnit: Number(el['per-unit'].value)
  };
  app.data.studio.rubric = payload.rubric;
  app.data.studio.prompt = payload.prompt;
  app.save();

  el.generate.disabled = true;
  status('作っています…', '');
  try {
    let out;
    if (el.engine.value === 'claude') {
      if (!claudeStatus.claude) await probeClaude();
      if (!claudeStatus.claude) throw new Error(claudeStatus.reason || '生成サーバーに繋がりません。');
      out = await LLM.generateWithClaude(payload);
    } else {
      out = generateBank(payload);
    }
    draft = out.bank;
    report(out.bank, out.report);
    status(`${out.bank.questions.length} 問できました。`, 'ok');
  } catch (e) {
    draft = null;
    el['gen-report'].hidden = true;
    status(e.message, 'bad');
  } finally {
    el.generate.disabled = false;
  }
}

const status = (text, kind) => {
  el['gen-status'].textContent = text;
  el['gen-status'].style.color = kind === 'bad' ? 'var(--bad)' : kind === 'ok' ? 'var(--ok)' : '';
};

/** 生成の結果を、採否の理由まで含めて出す */
function report(bank, gen) {
  const verdict = validateBank(bank, { requireFullLevels: false });
  const levels = [1, 2, 3, 4, 5].map((L) => `L${L}:${gen.byLevel[L] || 0}`).join(' / ');

  const rejected = (gen.rejected || []).length
    ? `<div class="banner warn"><b>採点できないので捨てた問題が ${gen.rejected.length} 件あります。</b>
        <ul>${gen.rejected.slice(0, 6).map((r) => `<li>${esc(r.id)}：${esc((r.problems || []).join(' / '))}</li>`).join('')}</ul>
        <p class="note">捨てているのは、模範解答が自分の採点基準を通らない・設問が答えを漏らしている、といった問題です。
        通してしまうと受講者が正解に辿り着けません。</p></div>`
    : '';

  const warns = verdict.warnings.length
    ? `<div class="banner warn"><ul>${verdict.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';

  const blockers = verdict.problems.length
    ? `<div class="banner bad"><b>このままでは出題できません。</b>
        <ul>${verdict.problems.slice(0, 8).map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : '';

  const preview = bank.units.map((u) => {
    const qs = bank.questions.filter((q) => q.unit === u.id);
    return `<h3>${esc(u.label)}<span class="note"> — ${esc(u.summary || '')}</span></h3>`
      + qs.map(previewQuestion).join('');
  }).join('');

  el['gen-report'].hidden = false;
  el['gen-report'].innerHTML = `
    <div class="banner ${verdict.ok ? 'ok' : 'bad'}">
      <b>${esc(bank.name)}</b> — ${bank.units.length} 単元 / ${bank.questions.length} 問（${levels}）
      ${gen.engine === 'claude' ? ` ／ Claude（${esc(gen.model || '')}）が下書きした ${gen.drafted} 問のうち ${gen.accepted} 問が検査を通りました` : ''}
      ${gen.boosted && gen.boosted.length ? `<br><span class="note">達成基準・出題方針から重みを上げた語：${esc(gen.boosted.join('、'))}</span>` : ''}
    </div>
    ${blockers}${rejected}${warns}
    <div class="row">
      <button type="button" class="btn primary" id="save-bank"${verdict.ok ? '' : ' disabled'}>このテストを保存する</button>
      <button type="button" class="btn" id="export-draft">JSON で書き出す</button>
      <button type="button" class="btn ghost" id="drop-draft">捨てる</button>
    </div>
    <h2>できた問題</h2>
    ${preview}`;

  on(byId('save-bank'), 'click', () => {
    app.data = Store.putAuthored(app.data, bank);
    app.data.settings.bank = bank.id;
    app.save();
    app.registry.add(bank, { replace: true });
    draft = null;
    el['gen-report'].hidden = true;
    status('保存しました。受講者の画面から選べます。', 'ok');
    renderBanks();
  });
  on(byId('export-draft'), 'click', () => exportBank(bank));
  on(byId('drop-draft'), 'click', () => {
    draft = null; el['gen-report'].hidden = true; status('捨てました。', '');
  });
}

function previewQuestion(q) {
  const groups = (list, cls, label) => (list || []).map((g) =>
    `<dt><span class="pill ${cls}">${label}</span> ${esc(g.key)}</dt><dd>${esc(g.any.join(' / '))}</dd>`).join('');
  return `<div class="qpreview">
    <div class="qhead"><span class="pill">L${q.level} ${esc(levelName(q.level))}</span>
      ${q.kind ? `<span class="pill">${esc(q.kind)}</span>` : ''}
      <span class="note">${esc(q.id)}</span></div>
    <p class="qprompt">${rich(q.prompt)}</p>
    <dl>${groups(q.criteria.required, 'hit', '必須')}${groups(q.criteria.optional, 'opt', '加点')}
      <dt class="note">模範解答</dt><dd>${esc(clip(q.model, 160))}</dd>
      <dt class="note">出典</dt><dd>${esc(q.source)}</dd></dl>
  </div>`;
}

/* ── 保存済みの一覧 ───────────────────────── */

function renderBanks() {
  const rows = app.registry.list().map((b) => {
    const authored = b.origin === 'authored';
    const stat = `${b.units.length} 単元 / ${b.questions.length} 問`;
    return `<div class="bankrow" data-bank="${esc(b.id)}">
      <div class="head"><b>${esc(b.name)}</b><span class="note">${authored ? '講師作成' : '同梱'}</span></div>
      <div class="note">${esc(b.subtitle || '')} — ${stat}
        ${b.generator ? `／ 出典：${esc(b.generator.source)}（${b.generator.engine === 'claude' ? 'Claude' : 'この端末'}）` : ''}</div>
      <div class="row">
        <button type="button" class="btn" data-act="use">これで出題する</button>
        <button type="button" class="btn" data-act="export">書き出す</button>
        ${authored ? '<button type="button" class="btn danger" data-act="delete">消す</button>' : ''}
      </div>
    </div>`;
  }).join('');

  el['bank-list'].innerHTML = `<div class="banklist">${rows}</div>`;

  for (const row of el['bank-list'].querySelectorAll('.bankrow')) {
    const bank = app.registry.get(row.dataset.bank);
    on(row.querySelector('[data-act="use"]'), 'click', () => app.goLearner(bank.id));
    on(row.querySelector('[data-act="export"]'), 'click', () => exportBank(bank));
    const del = row.querySelector('[data-act="delete"]');
    if (del) {
      on(del, 'click', () => {
        if (!confirm(`「${bank.name}」を消します。この端末からは戻せません。よろしいですか。`)) return;
        app.data = Store.removeAuthored(app.data, bank.id);
        app.registry.remove(bank.id);
        if (app.data.settings.bank === bank.id) app.data.settings.bank = app.registry.list()[0].id;
        app.save();
        renderBanks();
      });
    }
  }
}

/* ── 取り込み・持ち出し ───────────────────── */

function exportBank(bank) {
  const blob = new Blob([JSON.stringify(bank, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${bank.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importJson(file) {
  if (!file) return;
  try {
    const bank = JSON.parse(await file.text());
    if (!Store.looksLikeBank(bank)) throw new Error('問題集の形をしていません。');
    const verdict = validateBank(bank, { requireFullLevels: false });
    if (!verdict.ok) {
      el['import-note'].innerHTML = `<span style="color:var(--bad)">読み込めませんでした：`
        + `${esc(verdict.problems.slice(0, 3).join(' / '))}</span>`;
      return;
    }
    bank.origin = 'authored';
    app.data = Store.putAuthored(app.data, bank);
    app.save();
    app.registry.add(bank, { replace: true });
    el['import-note'].textContent = `「${bank.name}」を読み込みました（${bank.questions.length} 問）。`;
    renderBanks();
  } catch (e) {
    el['import-note'].innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`;
  }
}
