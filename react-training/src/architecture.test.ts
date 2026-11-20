// このアプリ自身が、教えているルールを守っているかを確かめるテスト。
// ファイルの import を読んで、「読みこんではいけない相手」を読みこんでいないかを見る。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = import.meta.dirname;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

type Import = { from: string; to: string; spec: string };

/** src からの相対パスで、だれがだれを読みこんでいるかの一覧を作る */
function collectImports(): Import[] {
  const imports: Import[] = [];
  for (const file of listFiles(SRC)) {
    // 文字列として持っている見本コード（`...` の中）は、本物の import ではないので除く
    const code = readFileSync(file, 'utf8').replace(/`(?:[^`\\]|\\.)*`/gs, '``');
    for (const match of code.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'/g)) {
      const spec = match[1];
      if (!spec.startsWith('.')) {
        imports.push({ from: relative(SRC, file), to: spec, spec });
        continue;
      }
      const target = relative(SRC, resolve(dirname(file), spec.replace(/\?raw$/, '')));
      imports.push({ from: relative(SRC, file), to: target, spec });
    }
  }
  return imports;
}

const imports = collectImports();
const featureOf = (path: string) => /^features\/([^/]+)/.exec(path)?.[1];
const layerOf = (path: string) => /^features\/[^/]+\/(api|hooks|components|logic)\//.exec(path)?.[1];
const show = (list: Import[]) => list.map((i) => `${i.from} → ${i.spec}`);

describe('フォルダ構成のルール', () => {
  it('import を読み取れている（テスト自体が空振りしていない）', () => {
    expect(imports.length).toBeGreaterThan(80);
    expect(imports.some((i) => i.from === 'app/App.tsx' && i.to === 'features/progress')).toBe(true);
  });

  it('機能は、別の機能を読みこまない（引き合わせるのは app）', () => {
    const bad = imports.filter((i) => {
      const from = featureOf(i.from);
      const to = featureOf(i.to);
      return from && to && from !== to;
    });
    expect(show(bad)).toEqual([]);
  });

  it('app は、機能を受付窓口（index）からだけ読みこむ', () => {
    const bad = imports.filter(
      (i) => i.from.startsWith('app/') && featureOf(i.to) && !/^features\/[^/]+$/.test(i.to),
    );
    expect(show(bad)).toEqual([]);
  });

  it('機能と shared は、app を読みこまない', () => {
    // main.tsx（いちばん最初に動くファイル）だけは、入口の App を読みこんでよい
    const bad = imports.filter(
      (i) => i.from !== 'main.tsx' && !i.from.startsWith('app/') && i.to.startsWith('app/'),
    );
    expect(show(bad)).toEqual([]);
  });

  it('shared は、機能を読みこまない', () => {
    const bad = imports.filter((i) => i.from.startsWith('shared/') && featureOf(i.to));
    expect(show(bad)).toEqual([]);
  });
});

describe('3つの役割のルール', () => {
  it('🚚 api は、hooks と components を読みこまない', () => {
    const bad = imports.filter(
      (i) => layerOf(i.from) === 'api' && ['hooks', 'components'].includes(layerOf(i.to) ?? ''),
    );
    expect(show(bad)).toEqual([]);
  });

  it('🚚 api は、React を使わない', () => {
    const bad = imports.filter((i) => layerOf(i.from) === 'api' && i.to === 'react');
    expect(show(bad)).toEqual([]);
  });

  it('🍳 hooks は、components を読みこまない', () => {
    const bad = imports.filter((i) => layerOf(i.from) === 'hooks' && layerOf(i.to) === 'components');
    expect(show(bad)).toEqual([]);
  });

  it('🙋 components は、api を直接読みこまない（型だけの読みこみは除く）', () => {
    const bad = imports.filter((i) => layerOf(i.from) === 'components' && layerOf(i.to) === 'api');
    // ProgressProvider が Progress の「型」だけを使うのは、通信を呼んでいないので許す
    const calls = bad.filter((i) => {
      const code = readFileSync(join(SRC, i.from), 'utf8');
      return !new RegExp(`import type [^;]*'${i.spec.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}'`).test(code);
    });
    expect(show(calls)).toEqual([]);
  });

  it('logic（ただの計算）は、React も api・hooks・components も読みこまない', () => {
    const bad = imports.filter(
      (i) =>
        layerOf(i.from) === 'logic' &&
        (i.to === 'react' || ['api', 'hooks', 'components'].includes(layerOf(i.to) ?? '')),
    );
    expect(show(bad)).toEqual([]);
  });
});
