import { transformWithOxc } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  generateBlueprint,
  guessShape,
  renderTree,
  reviewFeatures,
  toPascal,
  toSlug,
  type FeatureInput,
  type FeatureShape,
} from './generateBlueprint';

let count = 0;
const feature = (slug: string, shape: FeatureShape = 'list', label = 'テスト'): FeatureInput => ({
  id: `f${count++}`,
  label,
  slug,
  shape,
});

/** できたコードが、コードとして読めるか（書き方のまちがいが無いか）を確かめる */
async function expectValidCode(path: string, code: string) {
  await expect(transformWithOxc(code, path.split('/').pop()!), path).resolves.toBeDefined();
}

it('確かめ方そのものが働いている（壊れたコードは、ちゃんと失敗する）', async () => {
  await expect(transformWithOxc('export const A = () => <h2><メモ> {a}</h2>;', 'A.tsx')).rejects.toBeDefined();
});

describe('toSlug / toPascal / guessShape', () => {
  it('いろいろな書き方をフォルダ名の形にそろえる', () => {
    expect(toSlug('Book List')).toBe('book-list');
    expect(toSlug('bookList')).toBe('book-list');
    expect(toSlug('  book_list  ')).toBe('book-list');
    expect(toSlug('本の一覧')).toBe('');
    expect(toSlug('--todo--')).toBe('todo');
  });

  it('フォルダ名を部品の名前にする', () => {
    expect(toPascal('book-list')).toBe('BookList');
    expect(toPascal('login')).toBe('Login');
  });

  it('ログインなどは「送る」形だと当てる', () => {
    expect(guessShape('login')).toBe('form');
    expect(guessShape('Sign Up')).toBe('form');
    expect(guessShape('book-list')).toBe('list');
  });
});

describe('renderTree', () => {
  it('最後の子は └─、それ以外は ├─ でつなぎ、説明は ← のあとに付ける', () => {
    const tree = renderTree({
      name: 'src/',
      children: [{ name: 'a/', children: [{ name: 'x.ts', note: 'メモ' }, { name: 'y.ts' }] }, { name: 'b/' }],
    });
    expect(tree).toBe(['src/', '├─ a/', '│   ├─ x.ts  ← メモ', '│   └─ y.ts', '└─ b/'].join('\n'));
  });
});

describe('reviewFeatures', () => {
  it('種類の名前（utils など）を指摘する', () => {
    const notes = reviewFeatures([feature('utils')]);
    expect(notes.some((n) => n.level === 'warn' && n.text.includes('種類'))).toBe(true);
  });

  it('入力途中の大文字（Utils）でも同じように指摘する', () => {
    expect(reviewFeatures([feature('Utils')]).some((n) => n.text.includes('種類'))).toBe(true);
  });

  it('同じ名前の重なりを指摘する（書き方がちがっても同じとみなす）', () => {
    const notes = reviewFeatures([feature('todo-list'), feature('Todo List')]);
    expect(notes.some((n) => n.text.includes('2回'))).toBe(true);
  });

  it('use- で始まるフォルダ名を指摘する', () => {
    expect(reviewFeatures([feature('use-timer')]).some((n) => n.text.includes('use-'))).toBe(true);
  });

  it('機能が無いときは、まず1つ足すように言う', () => {
    expect(reviewFeatures([])[0].level).toBe('warn');
  });

  it('問題のない構成には警告を出さない', () => {
    const notes = reviewFeatures([feature('todo-list'), feature('login', 'form')]);
    expect(notes.filter((n) => n.level === 'warn')).toEqual([]);
  });
});

describe('generateBlueprint', () => {
  it('一覧の機能には api・hooks・components・index の4ファイルを作る', () => {
    const { files } = generateBlueprint('本棚', [feature('book-list')]);
    expect(files.map((f) => f.path)).toEqual([
      'src/app/App.tsx',
      'src/features/book-list/api/getBookList.ts',
      'src/features/book-list/hooks/useBookList.ts',
      'src/features/book-list/components/BookList.tsx',
      'src/features/book-list/index.ts',
    ]);
  });

  it('入力途中のフォルダ名（My Memo）でも、整えた名前で作る', () => {
    const { files, tree } = generateBlueprint('x', [feature('My Memo')]);
    expect(files[1].path).toBe('src/features/my-memo/api/getMyMemo.ts');
    expect(tree).toContain('my-memo/');
    expect(tree).not.toContain('My Memo');
  });

  it('「送る」形の機能は、get ではなく send の名前になる', () => {
    const { files } = generateBlueprint('x', [feature('login', 'form')]);
    expect(files.map((f) => f.path)).toContain('src/features/login/api/sendLogin.ts');
    expect(files.some((f) => f.path.includes('getLogin'))).toBe(false);
  });

  it('画面の中だけの機能には api フォルダを作らない', () => {
    const { files, tree } = generateBlueprint('電卓', [feature('calculator', 'local')]);
    expect(files.some((f) => f.role === 'api')).toBe(false);
    expect(tree).not.toContain('api/');
    expect(files.find((f) => f.role === 'logic')?.code).not.toContain('../api/');
  });

  it('use- で始まるフォルダ名でも、useUse〜 というフックは作らない', () => {
    const { files } = generateBlueprint('x', [feature('use-timer', 'local')]);
    expect(files.find((f) => f.role === 'logic')?.path).toBe('src/features/use-timer/hooks/useTimer.ts');
  });

  it('向きを守る：画面はフックを、フックは api を読みこむ（逆は無い）', () => {
    for (const shape of ['list', 'form'] as const) {
      const { files } = generateBlueprint('本棚', [feature('book-list', shape)]);
      const code = (role: string) => files.find((f) => f.role === role)!.code;
      expect(code('ui')).toContain(`from '../hooks/useBookList'`);
      expect(code('ui')).not.toContain('../api/');
      expect(code('logic')).toContain(`from '../api/`);
      expect(code('api')).not.toContain('import');
    }
  });

  it('入口の App は、各機能の受付窓口（index）から読みこむ', () => {
    const { files } = generateBlueprint('本棚', [feature('book-list'), feature('login', 'form')]);
    const app = files[0].code;
    expect(app).toContain(`import { BookList } from '../features/book-list';`);
    expect(app).toContain(`import { Login } from '../features/login';`);
  });

  it('名前が空・重なっている機能は図とコードに入れない', () => {
    const { files } = generateBlueprint('x', [feature(''), feature('todo'), feature('todo')]);
    expect(files.filter((f) => f.role === 'index')).toHaveLength(1);
  });

  it('どの形のひな形も、そのままコードとして読める', async () => {
    const { files } = generateBlueprint('読書ノート', [
      feature('book-list', 'list'),
      feature('login', 'form'),
      feature('calculator', 'local'),
    ]);
    expect(files).toHaveLength(1 + 4 + 4 + 3);
    for (const file of files) await expectValidCode(file.path, file.code);
  });

  it('名前に < > { } や改行が入っていても、コードが壊れない', async () => {
    const nasty = '<メモ> {a} `x` ${y} "q"\n2行目 */';
    const { files } = generateBlueprint(nasty, [
      feature('memo', 'list', nasty),
      feature('contact', 'form', nasty),
      feature('counter', 'local', nasty),
    ]);
    for (const file of files) await expectValidCode(file.path, file.code);
    expect(files[0].code).toContain('<h1>{"<メモ> {a}');
  });
});
