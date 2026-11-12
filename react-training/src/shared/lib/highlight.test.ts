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
