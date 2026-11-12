// ❌ 悪い例：1つのファイルに、仕入れ・料理・接客がぜんぶ入っている。
// 動きは良い例とまったく同じ。読みにくさを体感するためのもの。
import { useEffect, useState } from 'react';

export function BadShoppingList() {
  const [items, setItems] = useState<{ id: number; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    let ignore = false;
    // 通信のやり方が、画面のファイルに直接書いてある
    new Promise((resolve) => setTimeout(resolve, 600))
      .then(() => [
        { id: 1, name: '牛乳' },
        { id: 2, name: 'たまご' },
        { id: 3, name: '食パン' },
      ])
      .then((data) => {
        if (!ignore) setItems(data);
      })
      .catch(() => {
        if (!ignore) setLoadError('メモを読み込めませんでした');
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (isLoading) return <p>読み込み中…</p>;
  if (loadError) return <p role="alert">{loadError}</p>;

  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          // 追加のルールが、ボタンの中に埋まっている
          const trimmed = text.trim();
          if (trimmed === '') {
            setInputError('品物の名前を入れてください');
            return;
          }
          if (items.some((item) => item.name === trimmed)) {
            setInputError(`「${trimmed}」はもうメモにあります`);
            return;
          }
          setItems([...items, { id: Date.now(), name: trimmed }]);
          setInputError(null);
          setText('');
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="買うもの"
          aria-label="買うもの"
        />
        <button type="submit">追加</button>
      </form>
      {inputError && <p role="alert">{inputError}</p>}
    </div>
  );
}
