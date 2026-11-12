// 🙋 ホールスタッフ：画面に出して、ボタンを押してもらうだけ。
// 計算もチェックも通信もしない。ぜんぶ useShoppingList（キッチン）に頼む。
import { useState } from 'react';
import { useShoppingList } from '../hooks/useShoppingList';

export function ShoppingList() {
  const { items, isLoading, loadError, inputError, addItem } = useShoppingList();
  const [text, setText] = useState(''); // 入力中の文字は「画面の都合」なのでここで持つ

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const added = addItem(text);
    if (added) setText('');
  };

  if (isLoading) return <p>読み込み中…</p>;
  if (loadError) return <p role="alert">{loadError}</p>;

  return (
    <div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
      <form onSubmit={handleSubmit}>
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
