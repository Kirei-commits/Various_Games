import { describe, expect, it } from 'vitest';
import { highlight } from './highlight';

describe('highlight', () => {
  it('つなげると元のコードに戻る（1文字も失わない）', () => {
    const code = `import { useState } from 'react';\n// コメント\nconst n = 42; /* 複数行\nコメント */\nexport function App() { return <p>{n}</p>; }`;
    expect(highlight(code).map((t) => t.text).join('')).toBe(code);
  });

  it('コメント・文字列・予約語・数字・型を見分ける', () => {
    const tokens = highlight(`const a: Item = 'x'; // memo\nreturn 10;`);
    const kindOf = (text: string) => tokens.find((t) => t.text === text)?.kind;
    expect(kindOf('const')).toBe('keyword');
    expect(kindOf('Item')).toBe('type');
    expect(kindOf(`'x'`)).toBe('string');
    expect(kindOf('// memo')).toBe('comment');
    expect(kindOf('10')).toBe('number');
  });

  it('文字列の中の // はコメントにしない', () => {
    const tokens = highlight(`fetch('https://example.com/api');`);
    expect(tokens.some((t) => t.kind === 'comment')).toBe(false);
  });
});

describe('toLines', () => {
  it('行ごとに分け、字下げの数を別に数える', async () => {
    const { toLines } = await import('./highlight');
    const lines = toLines(highlight('if (a) {\n    return 1; // x\n\n}'));
    expect(lines.map((l) => l.indent)).toEqual([0, 4, 0, 0]);
    expect(lines[1].tokens.map((t) => t.text).join('')).toBe('return 1; // x');
    expect(lines[2].tokens).toEqual([]);
  });

  it('複数行のコメントも行ごとに分かれる', async () => {
    const { toLines } = await import('./highlight');
    const lines = toLines(highlight('/* a\n   b */\nx'));
    expect(lines).toHaveLength(3);
    expect(lines[1].tokens[0].kind).toBe('comment');
  });
});
