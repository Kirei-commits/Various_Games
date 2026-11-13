// 🍳 キッチン：メモのデータを持ち、「追加する」ときのルールを決める。
// 画面の見た目（JSX）は書かない。通信のやり方は getItems にまかせる。
import { useEffect, useState } from 'react';
import { getItems, type Item } from '../api/getItems';

export function useShoppingList() {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  // 最初に1回だけ、仕入れ業者にデータを頼む
  useEffect(() => {
    let ignore = false; // 画面が閉じられたあとに結果が届いても、無視するための印
    getItems()
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

  // 追加のルール：空はダメ、同じ品物もダメ。追加できたら true を返す
  const addItem = (name: string): boolean => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setInputError('品物の名前を入れてください');
      return false;
    }
    if (items.some((item) => item.name === trimmed)) {
      setInputError(`「${trimmed}」はもうメモにあります`);
      return false;
    }
    setItems([...items, { id: Date.now(), name: trimmed }]);
    setInputError(null);
    return true;
  };

  // 入力し直し始めたら、前のエラーは消す
  const clearInputError = () => setInputError(null);

  return { items, isLoading, loadError, inputError, addItem, clearInputError };
}
