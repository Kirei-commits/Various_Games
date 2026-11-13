// 設計図づくりの「レシピ」。入力（アプリ名と機能の一覧）から、
// フォルダ構成図・ひな形コード・レビューの指摘を作る。
// React も保存も使わない、ただの計算なので、単体でテストできる。

/** 機能の形。ひな形コードの中身がこれで変わる */
export type FeatureShape =
  /** 一覧を取ってきて、見せる・足す（例：本の一覧） */
  | 'list'
  /** 入力して、サーバーに送る（例：ログイン、問い合わせ） */
  | 'form'
  /** 画面の中だけで終わる。サーバーとやり取りしない（例：電卓、絞りこみ） */
  | 'local';

export type FeatureInput = {
  id: string;
  /** 日本語の呼び名（例：本の一覧） */
  label: string;
  /** フォルダ名になる英語（例：book-list）。整える前の、入力されたままの文字でもよい */
  slug: string;
  shape: FeatureShape;
};

export type FileRole = 'api' | 'logic' | 'ui' | 'index' | 'app';

export type GeneratedFile = {
  path: string;
  role: FileRole;
  featureSlug: string | null;
  code: string;
};

export type ReviewNote = { level: 'warn' | 'info'; text: string };

export type Blueprint = {
  tree: string;
  files: GeneratedFile[];
  notes: ReviewNote[];
};

/** 入力された文字を、フォルダ名に使える形（小文字とハイフン）に整える */
export function toSlug(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** book-list → BookList */
export function toPascal(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
}

/** 「送る」形の機能でよくある名前。フォルダ名から形を当てるのに使う */
const FORM_SLUGS = new Set([
  'login', 'logout', 'signup', 'sign-up', 'signin', 'sign-in', 'register', 'contact',
  'search', 'upload', 'checkout', 'feedback', 'password-reset',
]);

export function guessShape(slug: string): FeatureShape {
  return FORM_SLUGS.has(toSlug(slug)) ? 'form' : 'list';
}

// 「機能の名前」ではなく「種類の名前」になってしまっているもの
const KIND_NAMES = new Set([
  'components', 'component', 'hooks', 'hook', 'api', 'apis', 'utils', 'util', 'common',
  'shared', 'misc', 'other', 'others', 'main', 'app', 'lib', 'helpers', 'types', 'pages',
]);

type Named = FeatureInput & { slug: string };

/** フォルダ名を整えた形にそろえる（入力途中の「My Memo」も my-memo として扱う） */
function normalize(features: FeatureInput[]): Named[] {
  return features.map((f) => ({ ...f, slug: toSlug(f.slug), label: f.label.trim() }));
}

export function reviewFeatures(input: FeatureInput[]): ReviewNote[] {
  const features = normalize(input);
  const notes: ReviewNote[] = [];
  const valid = features.filter((f) => f.slug !== '');

  if (valid.length === 0 && features.length === 0) {
    notes.push({ level: 'warn', text: '機能がまだありません。まず1つ、いちばん大事な機能を足してみよう。' });
    return notes;
  }
  for (const f of features) {
    if (f.slug === '') {
      notes.push({
        level: 'warn',
        text: `「${f.label || '名前のない機能'}」のフォルダ名が空です。半角の英字で入れてください（日本語はフォルダ名にできません）。`,
      });
    } else if (KIND_NAMES.has(f.slug)) {
      notes.push({
        level: 'warn',
        text: `「${f.slug}」は機能の名前ではなく「種類」の名前です。「何をする場所か」が分かる名前（例：book-list, login）にしよう。`,
      });
    } else if (/^\d/.test(f.slug)) {
      notes.push({ level: 'warn', text: `「${f.slug}」は数字で始まっています。英字で始めよう。` });
    } else if (/^use-/.test(f.slug)) {
      notes.push({
        level: 'warn',
        text: `「${f.slug}」の頭の use- は要りません。use はフック（キッチン）のファイル名に付ける印で、フォルダ名には付けません（例：${f.slug.replace(/^use-/, '')}）。`,
      });
    }
  }
  const seen = new Set<string>();
  for (const f of valid) {
    if (seen.has(f.slug)) {
      notes.push({ level: 'warn', text: `「${f.slug}」が2回出ています。同じ引き出しは1つにまとめよう。` });
    }
    seen.add(f.slug);
  }
  if (valid.length > 6) {
    notes.push({
      level: 'info',
      text: `機能が${valid.length}個あります。最初は「これが無いとアプリにならない」2〜3個から作り始めるのがおすすめ。残りはフォルダだけ決めておけば十分。`,
    });
  }
  if (valid.length === 1) {
    notes.push({
      level: 'info',
      text: '機能が1つだけなら、この構成で十分です。2つ目ができたとき、隣に引き出しを足すだけで済みます。',
    });
  }
  if (valid.length > 0 && valid.every((f) => f.shape === 'local')) {
    notes.push({
      level: 'info',
      text: 'どの機能も「画面の中だけ」です。あとで保存したくなったら、その機能に api フォルダを足せば OK。',
    });
  }
  return notes;
}

// ---- フォルダ構成図 ----

export type TreeNode = { name: string; note?: string; children?: TreeNode[] };

/** 入れ子のデータを、├─ └─ の線でつないだ図にする。説明は「←」のあとに付ける */
export function renderTree(root: TreeNode): string {
  const withNote = (text: string, note?: string) => (note ? `${text}  ← ${note}` : text);
  const lines: string[] = [withNote(root.name, root.note)];
  const walk = (nodes: TreeNode[], prefix: string) => {
    nodes.forEach((node, i) => {
      const last = i === nodes.length - 1;
      lines.push(withNote(`${prefix}${last ? '└─ ' : '├─ '}${node.name}`, node.note));
      if (node.children) walk(node.children, prefix + (last ? '    ' : '│   '));
    });
  };
  walk(root.children ?? [], '');
  return lines.join('\n');
}

// ---- ひな形コード ----

/** コメント（// の行）に入れても安全な1行にする */
const forComment = (text: string) => text.replace(/\s+/g, ' ').trim();

/** 画面のタグの中に入れても壊れない形にする（< > { } は、そのままだとコードとして読まれてしまう） */
function forJsx(text: string): string {
  const clean = forComment(text);
  return /[<>{}]/.test(clean) ? `{${JSON.stringify(clean)}}` : clean;
}

type Names = { f: Named; pascal: string; label: string };

/** フックの名前。フォルダ名が use- で始まっていても useUse〜 にはしない */
const hookName = (pascal: string) => (/^Use[A-Z]/.test(pascal) ? `use${pascal.slice(3)}` : `use${pascal}`);

/** 通信の関数の名前。一覧なら get〜、送る形なら send〜 */
const apiName = (n: Names) => (n.f.shape === 'form' ? `send${n.pascal}` : `get${n.pascal}`);

function apiCode(n: Names): string {
  const { f, pascal, label } = n;
  if (f.shape === 'form') {
    return `// 🚚 仕入れ業者：「${label}」の入力内容を、サーバーに届けるだけ。
// TODO: ${pascal}Input の中身を、自分のアプリの入力項目に合わせて書きかえる

export type ${pascal}Input = {
  text: string;
};

export async function send${pascal}(input: ${pascal}Input): Promise<void> {
  // TODO: 本物の通信に置きかえる
  //   const response = await fetch('/api/${f.slug}', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(input),
  //   });
  //   if (!response.ok) throw new Error('送れませんでした');
  void input;
}
`;
  }
  return `// 🚚 仕入れ業者：「${label}」のデータを取ってくるだけ。
// TODO: ${pascal}Item の中身を、自分のアプリのデータに合わせて書きかえる

export type ${pascal}Item = {
  id: number;
  name: string;
};

export async function get${pascal}(): Promise<${pascal}Item[]> {
  // TODO: 本物の通信に置きかえる
  //   const response = await fetch('/api/${f.slug}');
  //   return response.json();
  return [{ id: 1, name: 'サンプル' }];
}
`;
}

function hookCode(n: Names): string {
  const { f, pascal, label } = n;
  const hook = hookName(pascal);
  if (f.shape === 'local') {
    return `// 🍳 キッチン：「${label}」の入力を覚えて、結果を計算する。
// 画面の見た目（JSX）はここに書かない。
import { useState } from 'react';

export function ${hook}() {
  // TODO: この機能で覚えておくものを決める
  const [input, setInput] = useState('');

  // TODO: 入力から結果を作る計算に書きかえる（いまは文字数を数えているだけ）
  const result = input.trim().length;

  // TODO: 「〜する」という操作を、関数として足していく
  const clear = () => setInput('');

  return { input, setInput, result, clear };
}
`;
  }
  if (f.shape === 'form') {
    return `// 🍳 キッチン：「${label}」の入力をチェックして、送る。送信中・失敗の状態も覚える。
// 画面の見た目（JSX）はここに書かない。通信のやり方は send${pascal} にまかせる。
import { useState } from 'react';
import { send${pascal} } from '../api/send${pascal}';

export function ${hook}() {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const submit = async (text: string) => {
    // TODO: 入力のルールを、自分のアプリに合わせて書きかえる
    if (text.trim() === '') {
      setError('入力してください');
      return;
    }
    setIsSending(true);
    setError(null);
    try {
      await send${pascal}({ text: text.trim() });
      setIsDone(true);
    } catch {
      setError('送れませんでした。もう一度ためしてください');
    } finally {
      setIsSending(false);
    }
  };

  return { isSending, error, isDone, submit };
}
`;
  }
  return `// 🍳 キッチン：「${label}」のデータを持ち、変更のルールを決める。
// 画面の見た目（JSX）はここに書かない。通信のやり方は get${pascal} にまかせる。
import { useEffect, useState } from 'react';
import { get${pascal}, type ${pascal}Item } from '../api/get${pascal}';

export function ${hook}() {
  const [items, setItems] = useState<${pascal}Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    get${pascal}()
      .then((result) => {
        if (!ignore) setItems(result);
      })
      .catch(() => {
        if (!ignore) setError('読み込めませんでした');
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // TODO: 「追加する」「消す」などの操作を、関数として足していく

  return { items, isLoading, error };
}
`;
}

function componentCode(n: Names): string {
  const { f, pascal, label } = n;
  const hook = hookName(pascal);
  const heading = forJsx(n.f.label || f.slug);
  if (f.shape === 'local') {
    return `// 🙋 ホールスタッフ：「${label}」を画面に出して、操作してもらうだけ。
// 計算は ${hook}（キッチン）に頼む。
import { ${hook} } from '../hooks/${hook}';

export function ${pascal}() {
  const { input, setInput, result, clear } = ${hook}();

  return (
    <section>
      <h2>${heading}</h2>
      {/* TODO: 見た目を作る */}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
      <p>結果：{result}</p>
      <button type="button" onClick={clear}>
        クリア
      </button>
    </section>
  );
}
`;
  }
  if (f.shape === 'form') {
    return `// 🙋 ホールスタッフ：「${label}」の入力欄とボタンを出すだけ。
// チェックと送信は ${hook}（キッチン）に頼む。
import { useState } from 'react';
import { ${hook} } from '../hooks/${hook}';

export function ${pascal}() {
  const { isSending, error, isDone, submit } = ${hook}();
  const [text, setText] = useState(''); // 入力中の文字は「画面の都合」なのでここで持つ

  if (isDone) return <p>送りました。</p>;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(text);
      }}
    >
      <h2>${heading}</h2>
      {/* TODO: 入力欄を、自分のアプリに合わせて作る */}
      <input value={text} onChange={(event) => setText(event.target.value)} />
      <button type="submit" disabled={isSending}>
        {isSending ? '送信中…' : '送る'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
`;
  }
  return `// 🙋 ホールスタッフ：「${label}」を画面に出して、操作してもらうだけ。
// 計算やチェック、通信は ${hook}（キッチン）に頼む。
import { ${hook} } from '../hooks/${hook}';

export function ${pascal}() {
  const { items, isLoading, error } = ${hook}();

  if (isLoading) return <p>読み込み中…</p>;
  if (error) return <p role="alert">{error}</p>;

  return (
    <section>
      <h2>${heading}</h2>
      {/* TODO: 見た目を作る */}
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </section>
  );
}
`;
}

function indexCode(n: Names): string {
  return `// 「${n.label}」の受付窓口。外から使ってよいものだけを並べる。
export { ${n.pascal} } from './components/${n.pascal}';
`;
}

function appCode(appName: string, features: Named[]): string {
  const imports = features
    .map((f) => `import { ${toPascal(f.slug)} } from '../features/${f.slug}';`)
    .join('\n');
  const body = features.map((f) => `      <${toPascal(f.slug)} />`).join('\n');
  return `// アプリの入口：機能を並べるだけ。中身のことは各機能にまかせる。
${imports}

export function App() {
  return (
    <main>
      <h1>${forJsx(appName) || 'わたしのアプリ'}</h1>
${body}
    </main>
  );
}
`;
}

export function generateBlueprint(appName: string, input: FeatureInput[]): Blueprint {
  const notes = reviewFeatures(input);

  // 図とコードに使うのは、名前がちゃんとしていて重なっていない機能だけ
  const seen = new Set<string>();
  const usable = normalize(input).filter((f) => {
    if (f.slug === '' || /^\d/.test(f.slug) || seen.has(f.slug)) return false;
    seen.add(f.slug);
    return true;
  });

  const files: GeneratedFile[] = [];
  const featureNodes: TreeNode[] = [];

  for (const f of usable) {
    const pascal = toPascal(f.slug);
    const n: Names = { f, pascal, label: forComment(f.label) || f.slug };
    const base = `src/features/${f.slug}`;
    const hook = hookName(pascal);
    const children: TreeNode[] = [];
    const add = (folder: string, file: string, role: FileRole, code: string, note: string) => {
      children.push({ name: `${folder}/`, children: [{ name: file, note }] });
      files.push({ path: `${base}/${folder}/${file}`, role, featureSlug: f.slug, code });
    };
    if (f.shape !== 'local') {
      add('api', `${apiName(n)}.ts`, 'api', apiCode(n), f.shape === 'form' ? '🚚 送るだけ' : '🚚 取ってくるだけ');
    }
    add('hooks', `${hook}.ts`, 'logic', hookCode(n), '🍳 データとルール');
    add('components', `${pascal}.tsx`, 'ui', componentCode(n), '🙋 見せるだけ');
    children.push({ name: 'index.ts', note: '受付窓口' });
    files.push({ path: `${base}/index.ts`, role: 'index', featureSlug: f.slug, code: indexCode(n) });
    featureNodes.push({ name: `${f.slug}/`, note: forComment(f.label) || undefined, children });
  }

  if (usable.length > 0) {
    files.unshift({ path: 'src/app/App.tsx', role: 'app', featureSlug: null, code: appCode(appName, usable) });
  }

  const tree = renderTree({
    name: 'src/',
    children: [
      { name: 'app/', children: [{ name: 'App.tsx', note: '機能を並べるだけの入口' }] },
      { name: 'features/', children: featureNodes },
      { name: 'shared/', note: '2つ以上の機能で使うものだけ（最初は空でいい）' },
    ],
  });

  return { tree, files, notes };
}
