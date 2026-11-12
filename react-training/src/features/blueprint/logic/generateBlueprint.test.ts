import { describe, expect, it } from 'vitest';
import { generateBlueprint, renderTree, reviewFeatures, toPascal, toSlug, type FeatureInput } from './generateBlueprint';

const feature = (slug: string, usesServer = true, label = 'テスト'): FeatureInput => ({
  id: slug + Math.random(),
  label,
  slug,
  usesServer,
});

describe('toSlug / toPascal', () => {
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
});

describe('renderTree', () => {
  it('最後の子は └─、それ以外は ├─ でつなぐ', () => {
    const tree = renderTree({
      name: 'src/',
      children: [{ name: 'a/', children: [{ name: 'x.ts' }, { name: 'y.ts' }] }, { name: 'b/' }],
    });
    expect(tree).toBe(['src/', '├─ a/', '│   ├─ x.ts', '│   └─ y.ts', '└─ b/'].join('\n'));
  });
});

describe('reviewFeatures', () => {
  it('種類の名前（utils など）を指摘する', () => {
    const notes = reviewFeatures([feature('utils')]);
    expect(notes.some((n) => n.level === 'warn' && n.text.includes('種類'))).toBe(true);
  });

  it('同じ名前の重なりを指摘する', () => {
    const notes = reviewFeatures([feature('todo'), feature('todo')]);
    expect(notes.some((n) => n.text.includes('2回'))).toBe(true);
  });

  it('機能が無いときは、まず1つ足すように言う', () => {
    expect(reviewFeatures([])[0].level).toBe('warn');
  });

  it('問題のない構成には警告を出さない', () => {
    const notes = reviewFeatures([feature('todo-list'), feature('login')]);
    expect(notes.filter((n) => n.level === 'warn')).toEqual([]);
  });
});

describe('generateBlueprint', () => {
  it('通信ありの機能には api・hooks・components・index の4ファイルを作る', () => {
    const { files } = generateBlueprint('本棚', [feature('book-list')]);
    expect(files.map((f) => f.path)).toEqual([
      'src/app/App.tsx',
      'src/features/book-list/api/getBookList.ts',
      'src/features/book-list/hooks/useBookList.ts',
      'src/features/book-list/components/BookList.tsx',
      'src/features/book-list/index.ts',
    ]);
  });

  it('通信なしの機能には api フォルダを作らない', () => {
    const { files, tree } = generateBlueprint('電卓', [feature('calculator', false)]);
    expect(files.some((f) => f.role === 'api')).toBe(false);
    expect(tree).not.toContain('api/');
    expect(files.find((f) => f.role === 'logic')?.code).not.toContain('../api/');
  });

  it('向きを守る：画面はフックを、フックは api を読みこむ（逆は無い）', () => {
    const { files } = generateBlueprint('本棚', [feature('book-list')]);
    const code = (role: string) => files.find((f) => f.role === role)!.code;
    expect(code('ui')).toContain(`from '../hooks/useBookList'`);
    expect(code('ui')).not.toContain('../api/');
    expect(code('logic')).toContain(`from '../api/getBookList'`);
    expect(code('api')).not.toContain('import');
  });

  it('入口の App は、各機能の受付窓口（index）から読みこむ', () => {
    const { files } = generateBlueprint('本棚', [feature('book-list'), feature('login', false)]);
    const app = files[0].code;
    expect(app).toContain(`import { BookList } from '../features/book-list';`);
    expect(app).toContain(`import { Login } from '../features/login';`);
  });

  it('名前が空・重なっている機能は図とコードに入れない', () => {
    const { files } = generateBlueprint('x', [feature(''), feature('todo'), feature('todo')]);
    expect(files.filter((f) => f.role === 'index')).toHaveLength(1);
  });
});
