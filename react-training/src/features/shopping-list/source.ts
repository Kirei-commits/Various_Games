// 教材として「中身のコード」を見せるための、特別な出口。
// ふつうのアプリには要らない。ここでは、表示するコードと動いているコードがずれないように、
// ファイルの中身を文字としてそのまま読みこんでいる（?raw）。
import api from './api/getItems.ts?raw';
import component from './components/ShoppingList.tsx?raw';
import hook from './hooks/useShoppingList.ts?raw';
import hookTest from './hooks/useShoppingList.test.ts?raw';

export const shoppingListSource = { api, hook, component, hookTest };
