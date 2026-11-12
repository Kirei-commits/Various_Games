// 設計図づくりの「レシピ」。入力（アプリ名と機能の一覧）から、
// フォルダ構成図・ひな形コード・レビューの指摘を作る。
// React も保存も使わない、ただの計算なので、単体でテストできる。

export type FeatureInput = {
  id: string;
  /** 日本語の呼び名（例：本の一覧） */
  label: string;
  /** フォルダ名になる英語（例：book-list） */
  slug: string;
  /** サーバーや保存場所とデータをやり取りするか */
  usesServer: boolean;
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

// 「機能の名前」ではなく「種類の名前」になってしまっているもの
const KIND_NAMES = new Set([
  'components', 'component', 'hooks', 'hook', 'api', 'apis', 'utils', 'util', 'common',
  'shared', 'misc', 'other', 'others', 'main', 'app', 'lib', 'helpers', 'types', 'pages',
]);

export function reviewFeatures(features: FeatureInput[]): ReviewNote[] {
  const notes: ReviewNote[] = [];
  const valid = features.filter((f) => f.slug !== '');

  if (valid.length === 0) {
    notes.push({ level: 'warn', text: '機能がまだありません。まず1つ、いちばん大事な機能を足してみよう。' });
    return notes;
  }
  for (const f of features) {
    if (f.slug === '') {
      notes.push({
        level: 'warn',
        text: `「${f.label || '名前のない機能'}」のフォルダ名（英語）が空です。半角の英字で入れてください。`,
      });
    } else if (KIND_NAMES.has(f.slug)) {
      notes.push({
        level: 'warn',
        text: `「${f.slug}」は機能の名前ではなく「種類」の名前です。「何をする場所か」が分かる名前（例：book-list, login）にしよう。`,
      });
    } else if (/^\d/.test(f.slug)) {
      notes.push({ level: 'warn', text: `「${f.slug}」は数字で始まっています。英字で始めよう。` });
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
  if (valid.every((f) => !f.usesServer)) {
    notes.push({
      level: 'info',
      text: 'どの機能もデータのやり取りが「なし」です。あとで保存したくなったら、その機能に api フォルダを足せば OK。',
    });
  }
  return notes;
}

// ---- フォルダ構成図 ----

export type TreeNode = { name: string; children?: TreeNode[] };

/** 入れ子のデータを、├─ └─ の線でつないだ図にする */
export function renderTree(root: TreeNode): string {
  const lines: string[] = [root.name];
  const walk = (nodes: TreeNode[], prefix: string) => {
    nodes.forEach((node, i) => {
      const last = i === nodes.length - 1;
      lines.push(`${prefix}${last ? '└─ ' : '├─ '}${node.name}`);
      if (node.children) walk(node.children, prefix + (last ? '    ' : '│   '));
    });
  };
  walk(root.children ?? [], '');
  return lines.join('\n');
}

// ---- ひな形コード ----

function apiCode(f: FeatureInput, pascal: string): string {
  return `// 🚚 仕入れ業者：「${f.label}」のデータを取ってくるだけ。
// TODO: ${pascal}Data の中身を、自分のアプリのデータに合わせて書きかえる

export type ${pascal}Data = {
  id: number;
  name: string;
};

export async function get${pascal}(): Promise<${pascal}Data[]> {
  // TODO: 本物の通信に置きかえる
  //   const response = await fetch('/api/${f.slug}');
  //   return response.json();
  return [{ id: 1, name: 'サンプル' }];
}
`;
}

function hookCode(f: FeatureInput, pascal: string): string {
  if (!f.usesServer) {
    return `// 🍳 キッチン：「${f.label}」のデータを持ち、変更のルールを決める。
// 画面の見た目（JSX）はここに書かない。
import { useState } from 'react';

export function use${pascal}() {
  // TODO: この機能で覚えておくデータを決める
  const [value, setValue] = useState('');

  // TODO: 「〜する」という操作を、関数として足していく
  const update = (next: string) => {
    setValue(next);
  };

  return { value, update };
}
`;
  }
  return `// 🍳 キッチン：「${f.label}」のデータを持ち、変更のルールを決める。
// 画面の見た目（JSX）はここに書かない。通信のやり方は get${pascal} にまかせる。
import { useEffect, useState } from 'react';
import { get${pascal}, type ${pascal}Data } from '../api/get${pascal}';

export function use${pascal}() {
  const [data, setData] = useState<${pascal}Data[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    get${pascal}()
      .then((result) => {
        if (!ignore) setData(result);
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

  return { data, isLoading, error };
}
`;
}

function componentCode(f: FeatureInput, pascal: string): string {
  if (!f.usesServer) {
    return `// 🙋 ホールスタッフ：「${f.label}」を画面に出して、操作してもらうだけ。
// 計算やチェックは use${pascal}（キッチン）に頼む。
import { use${pascal} } from '../hooks/use${pascal}';

export function ${pascal}() {
  const { value, update } = use${pascal}();

  return (
    <section>
      <h2>${f.label}</h2>
      {/* TODO: 見た目を作る */}
      <input value={value} onChange={(event) => update(event.target.value)} />
    </section>
  );
}
`;
  }
  return `// 🙋 ホールスタッフ：「${f.label}」を画面に出して、操作してもらうだけ。
// 計算やチェック、通信は use${pascal}（キッチン）に頼む。
import { use${pascal} } from '../hooks/use${pascal}';

export function ${pascal}() {
  const { data, isLoading, error } = use${pascal}();

  if (isLoading) return <p>読み込み中…</p>;
  if (error) return <p role="alert">{error}</p>;

  return (
    <section>
      <h2>${f.label}</h2>
      {/* TODO: 見た目を作る */}
      <ul>
        {data.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </section>
  );
}
`;
}

function indexCode(f: FeatureInput, pascal: string): string {
  return `// 「${f.label}」の受付窓口。外から使ってよいものだけを並べる。
export { ${pascal} } from './components/${pascal}';
`;
}

function appCode(appName: string, features: FeatureInput[]): string {
  const imports = features
    .map((f) => `import { ${toPascal(f.slug)} } from '../features/${f.slug}';`)
    .join('\n');
  const body = features.map((f) => `      <${toPascal(f.slug)} />`).join('\n');
  return `// アプリの入口：機能を並べるだけ。中身のことは各機能にまかせる。
${imports}

export function App() {
  return (
    <main>
      <h1>${appName || 'わたしのアプリ'}</h1>
${body}
    </main>
  );
}
`;
}

export function generateBlueprint(appName: string, features: FeatureInput[]): Blueprint {
  const notes = reviewFeatures(features);

  // 図とコードに使うのは、名前がちゃんとしていて重なっていない機能だけ
  const seen = new Set<string>();
  const usable = features.filter((f) => {
    if (f.slug === '' || /^\d/.test(f.slug) || seen.has(f.slug)) return false;
    seen.add(f.slug);
    return true;
  });

  const files: GeneratedFile[] = [];
  const featureNodes: TreeNode[] = [];

  for (const f of usable) {
    const pascal = toPascal(f.slug);
    const base = `src/features/${f.slug}`;
    const children: TreeNode[] = [];
    if (f.usesServer) {
      children.push({ name: 'api/', children: [{ name: `get${pascal}.ts` }] });
      files.push({ path: `${base}/api/get${pascal}.ts`, role: 'api', featureSlug: f.slug, code: apiCode(f, pascal) });
    }
    children.push({ name: 'hooks/', children: [{ name: `use${pascal}.ts` }] });
    files.push({ path: `${base}/hooks/use${pascal}.ts`, role: 'logic', featureSlug: f.slug, code: hookCode(f, pascal) });
    children.push({ name: 'components/', children: [{ name: `${pascal}.tsx` }] });
    files.push({ path: `${base}/components/${pascal}.tsx`, role: 'ui', featureSlug: f.slug, code: componentCode(f, pascal) });
    children.push({ name: 'index.ts' });
    files.push({ path: `${base}/index.ts`, role: 'index', featureSlug: f.slug, code: indexCode(f, pascal) });
    featureNodes.push({ name: `${f.slug}/${f.label ? `          ← ${f.label}` : ''}`, children });
  }

  if (usable.length > 0) {
    files.unshift({ path: 'src/app/App.tsx', role: 'app', featureSlug: null, code: appCode(appName, usable) });
  }

  const tree = renderTree({
    name: 'src/',
    children: [
      { name: 'app/', children: [{ name: 'App.tsx          ← 機能を並べるだけの入口' }] },
      { name: 'features/', children: featureNodes },
      { name: 'shared/           ← 2つ以上の機能で使うものだけ（最初は空でいい）' },
    ],
  });

  return { tree, files, notes };
}
