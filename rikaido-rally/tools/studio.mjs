/**
 * 講師用のローカルサーバー（任意）。
 *
 * ブラウザだけでも問題は作れる（js/author/generate.js）。このサーバーは、
 * 「Claude に作らせる」経路を足すためだけのもの。
 *
 * **API キーはこのサーバーの中にしか置かない。** ブラウザには渡さない。
 * 静的サイトから直接 Anthropic を叩く作りにすると、鍵がページを開いた全員に配られる。
 * だから公開先（GitHub Pages）では Claude 経路は出てこず、この場で立てたときだけ現れる。
 *
 *   ANTHROPIC_API_KEY=... npm run studio
 *   → http://127.0.0.1:8082/ を開いて、講師モードの「Claude に作らせる」を選ぶ
 *
 * 生成結果は、ブラウザ側と同じ検査（js/author/validate.js）を必ず通す。
 * 通らなかった問題は捨て、理由を返す。検査を緩めるくらいなら問題数が減る方がよい。
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { validateQuestion, validateBank, MAX_REQUIRED } from '../js/author/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8082);
const MODEL = process.env.RR_MODEL || 'claude-opus-5';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon'
};

/* ── 出力の形をスキーマで固定する ─────────── */

const GROUP = {
  type: 'object', additionalProperties: false,
  required: ['key', 'any', 'why'],
  properties: {
    key: { type: 'string', description: '観点の名前。答えの語そのものは書かない（受講者に見せるため）' },
    any: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' }, description: '正解と認める語。言い換えを並べる' },
    why: { type: 'string', description: 'なぜこの観点を必須にしたのか' }
  }
};
const TRAP = {
  type: 'object', additionalProperties: false,
  required: ['key', 'any', 'hint'],
  properties: {
    key: { type: 'string' },
    any: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
    hint: { type: 'string', description: 'その誤解をしている人へのひとこと' }
  }
};

const BANK_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['units', 'questions'],
  properties: {
    units: {
      type: 'array', minItems: 1, maxItems: 6,
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'label', 'summary', 'levelNote'],
        properties: {
          id: { type: 'string' }, label: { type: 'string' },
          summary: { type: 'string' }, levelNote: { type: 'string' }
        }
      }
    },
    questions: {
      type: 'array', minItems: 5, maxItems: 40,
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'unit', 'level', 'prompt', 'criteria', 'hints', 'model', 'why', 'source'],
        properties: {
          id: { type: 'string' },
          unit: { type: 'string' },
          level: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          prompt: { type: 'string' },
          criteria: {
            type: 'object', additionalProperties: false,
            required: ['required', 'optional', 'traps'],
            properties: {
              required: { type: 'array', minItems: 1, maxItems: MAX_REQUIRED, items: GROUP },
              optional: { type: 'array', maxItems: 3, items: GROUP },
              traps: { type: 'array', maxItems: 3, items: TRAP }
            }
          },
          hints: { type: 'array', minItems: 2, maxItems: 3, items: { type: 'string' } },
          model: { type: 'string' },
          why: { type: 'string' },
          source: { type: 'string' }
        }
      }
    }
  }
};

/** 採点エンジンの約束ごとを、そのまま指示にしたもの */
const SYSTEM = `あなたは研修の作問担当です。渡された資料から、記述式（自由記述）の理解度テストを作ります。

採点エンジンは次のように動きます。この仕様を外れた問題は自動的に捨てられます。

- 正解の判定は「必須観点（criteria.required）のすべてで、その観点の any に並べた語のいずれか1語が
  受講者の回答に部分一致すること」だけで決まります。意味の解釈は行われません。
- criteria.optional は加点だけ、criteria.traps は誤解の検出だけに使われ、正誤には影響しません。
- したがって次を必ず守ってください。
  1. model（模範解答）は、その問題の必須観点をすべて満たす文にする。満たさないと問題ごと捨てられます。
  2. prompt（設問文）の中に、必須観点の any の語を書かない。書くと「設問を写すだけで正解」になり捨てられます。
  3. any の語は2文字以上にする。1文字や記号だけの語は、無関係な回答にも一致してしまいます。
  4. 必須観点は最大 ${MAX_REQUIRED} 個。多いほど「言い落とし」で不正解になり、テストが理解度を測らなくなります。

レベルは「難しそうか」ではなく、受講者に求めている行為で決めます。
  1 再生（用語や事実を思い出せる） / 2 説明（仕組みを自分の言葉で言える） /
  3 使い分け（条件で答えが変わると分かる） / 4 予測（具体例の結末を当てられる） /
  5 判断（トレードオフや背景を語れる）

そのほかの決まり。
- 資料に書かれていないことは問わない。source には資料の中のどこを根拠にしたかを書く。
- why には「なぜその観点を必須にしたのか」を書く。模範解答の言い換えにしない。
- hints は2〜3個。1つ目は考える向きを示すだけにし、答えの語は最後まで書かない。
- unit の id は units で定義したものだけを使う。単元ごとにレベルが偏らないようにする。`;

/* ── 生成 ─────────────────────────────────── */

function buildUserMessage({ text, rubric, prompt, perUnit }) {
  return `# 達成基準（この資料を読んだ人ができているべきこと）
${rubric || '（指定なし）'}

# 作問の方針（研修担当からの指示）
${prompt || '（指定なし）'}

# 作る量
単元は資料の構成に合わせて2〜5個。1単元あたり最大 ${perUnit} 問。
達成基準に直結する問題を優先し、レベル1〜5がなるべく揃うようにしてください。

# 資料
${text}`;
}

async function callClaude(client, payload) {
  const request = {
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildUserMessage(payload) }],
    output_config: { format: { type: 'json_schema', schema: BANK_SCHEMA } }
  };

  // 断られたときに自動で別モデルへ回す（server-side fallback）。
  // 使えない環境では素の呼び出しに落とす。
  try {
    const stream = client.beta.messages.stream({
      ...request,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default'
    });
    return await stream.finalMessage();
  } catch (e) {
    if (!/fallback|beta|unsupported|unrecognized/i.test(String(e && e.message))) throw e;
    const stream = client.messages.stream(request);
    return await stream.finalMessage();
  }
}

const textOf = (message) => (message.content || [])
  .filter((b) => b.type === 'text').map((b) => b.text).join('');

/**
 * 生成して、ブラウザ側とまったく同じ検査を通す。
 * 通らなかった問題は捨て、理由を返す（検査を緩めるより問題数が減る方がまし）。
 */
export async function generateWithClaude(client, payload) {
  const message = await callClaude(client, payload);
  if (message.stop_reason === 'refusal') {
    throw new Error('この資料での作問は断られました（' + (message.stop_details?.category || '理由不明') + '）。');
  }

  const raw = textOf(message);
  let draft;
  try {
    draft = JSON.parse(raw);
  } catch (e) {
    throw new Error('生成結果を JSON として読めませんでした。' + raw.slice(0, 200));
  }

  const now = Date.now();
  const unitIds = new Set((draft.units || []).map((u) => u.id));
  const accepted = [];
  const rejected = [];
  const seen = new Set();

  for (const [i, q] of (draft.questions || []).entries()) {
    const question = { ...q, id: q.id && !seen.has(q.id) ? q.id : `q${i + 1}` };
    seen.add(question.id);
    question.criteria = { required: [], optional: [], traps: [], ...question.criteria };
    if (!unitIds.has(question.unit)) {
      rejected.push({ id: question.id, problems: [`単元 ${question.unit} が定義されていません`] });
      continue;
    }
    const check = validateQuestion(question);
    if (check.ok) accepted.push(question);
    else rejected.push({ id: question.id, problems: check.problems });
  }

  const usedUnits = new Set(accepted.map((q) => q.unit));
  const bank = {
    id: payload.id || `authored-claude-${now.toString(36)}`,
    name: payload.name || `${payload.source} の理解度テスト`,
    subtitle: (draft.units || []).filter((u) => usedUnits.has(u.id)).map((u) => u.label).join(' / '),
    blurb: payload.rubric ? `達成基準：${payload.rubric}` : 'Claude が資料から作った問題集です。',
    origin: 'authored',
    createdAt: now,
    generator: {
      engine: 'claude', model: message.model || MODEL,
      source: payload.source, rubric: payload.rubric, prompt: payload.prompt,
      usage: message.usage || null
    },
    units: (draft.units || []).filter((u) => usedUnits.has(u.id)),
    questions: accepted
  };

  const verdict = validateBank(bank, { requireFullLevels: false });
  return {
    bank,
    report: {
      engine: 'claude',
      model: message.model || MODEL,
      drafted: (draft.questions || []).length,
      accepted: accepted.length,
      rejected,
      byLevel: Object.fromEntries([1, 2, 3, 4, 5].map((L) => [L, accepted.filter((q) => q.level === L).length])),
      warnings: verdict.warnings,
      problems: verdict.problems,
      usage: message.usage || null
    }
  };
}

/* ── サーバー ─────────────────────────────── */

async function readBody(req, limit = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('資料が大きすぎます（4MBまで）');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const hasKey = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // 講師画面はこれを見て「Claude に作らせる」を出すかどうかを決める
  if (url.pathname === '/api/status') {
    return json(res, 200, { ok: true, claude: hasKey(), model: MODEL });
  }

  if (url.pathname === '/api/generate') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST してください' });
    if (!hasKey()) {
      return json(res, 503, { error: 'このサーバーに ANTHROPIC_API_KEY が設定されていません。ブラウザ内生成を使ってください。' });
    }
    try {
      const payload = await readBody(req);
      if (!payload.text || !payload.text.trim()) return json(res, 400, { error: '資料のテキストが空です' });
      const client = new Anthropic();
      const out = await generateWithClaude(client, {
        perUnit: 5, source: '資料', name: '', rubric: '', prompt: '', ...payload
      });
      return json(res, 200, out);
    } catch (e) {
      return json(res, 500, { error: String(e && e.message ? e.message : e) });
    }
  }

  // 静的配信
  try {
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(String(err.code || err));
  }
});

if (process.argv[1] && process.argv[1].endsWith('studio.mjs')) {
  server.listen(PORT, () => {
    console.log(`理解度アップ・テストラリー（講師用）: http://127.0.0.1:${PORT}/`);
    console.log(hasKey()
      ? `Claude での作問: 有効（model=${MODEL}）`
      : 'Claude での作問: 無効（ANTHROPIC_API_KEY が未設定。ブラウザ内生成は使えます）');
  });
}

export { server, BANK_SCHEMA, SYSTEM };
