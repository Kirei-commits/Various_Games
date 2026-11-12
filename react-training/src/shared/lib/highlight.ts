// コードに色をつけるための、とても簡単な「単語分け」。
// 外部ライブラリを使わず、コメント・文字列・予約語・数字・型っぽい名前だけを見分ける。

export type TokenKind = 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'type';
export type Token = { kind: TokenKind; text: string };

const KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'const', 'let', 'var', 'function', 'return',
  'if', 'else', 'for', 'while', 'of', 'in', 'new', 'async', 'await', 'try', 'catch',
  'finally', 'throw', 'type', 'interface', 'extends', 'as', 'null', 'undefined', 'true',
  'false', 'typeof', 'void',
]);

const PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g;

export function highlight(code: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  const push = (kind: TokenKind, text: string) => {
    if (text === '') return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.kind === kind) prev.text += text;
    else tokens.push({ kind, text });
  };

  for (const match of code.matchAll(PATTERN)) {
    const index = match.index;
    push('plain', code.slice(last, index));
    const [text, comment, str, num, word] = match;
    if (comment !== undefined) push('comment', text);
    else if (str !== undefined) push('string', text);
    else if (num !== undefined) push('number', text);
    else if (word !== undefined && KEYWORDS.has(word)) push('keyword', text);
    else if (word !== undefined && /^[A-Z]/.test(word)) push('type', text);
    else push('plain', text);
    last = index + text.length;
  }
  push('plain', code.slice(last));
  return tokens;
}
