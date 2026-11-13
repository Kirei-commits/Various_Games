// @vitest-environment jsdom
// 🍳 キッチンだけを確かめるテスト。仕入れ業者は「にせもの」に差しかえる。
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { getItems } from '../api/getItems';
import { useShoppingList } from './useShoppingList';

// この1行で、getItems が「呼ばれ方を記録するだけの、にせの関数」に入れかわる。
// 本物のサーバー（この教材では0.6秒の待ち時間）には行かない。
vi.mock('../api/getItems');

beforeEach(() => {
  // にせの業者は、いつも「牛乳」だけをすぐに届ける
  vi.mocked(getItems).mockResolvedValue([{ id: 1, name: '牛乳' }]);
});

// 読みこみが終わったところまで進めておく
async function loaded() {
  const view = renderHook(() => useShoppingList());
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view.result;
}

it('最初に、業者から届いたメモを持つ', async () => {
  const hook = await loaded();
  expect(hook.current.items).toEqual([{ id: 1, name: '牛乳' }]);
});

it('空の名前は断る', async () => {
  const hook = await loaded();
  let added = true;
  act(() => {
    added = hook.current.addItem('   ');
  });
  expect(added).toBe(false);
  expect(hook.current.inputError).toBe('品物の名前を入れてください');
  expect(hook.current.items).toHaveLength(1);
});

it('もうある品物は断る', async () => {
  const hook = await loaded();
  act(() => {
    hook.current.addItem('牛乳');
  });
  expect(hook.current.inputError).toBe('「牛乳」はもうメモにあります');
  expect(hook.current.items).toHaveLength(1);
});

it('新しい品物は、前後の空白を取って追加する', async () => {
  const hook = await loaded();
  let added = false;
  act(() => {
    added = hook.current.addItem(' りんご ');
  });
  expect(added).toBe(true);
  expect(hook.current.items.map((item) => item.name)).toEqual(['牛乳', 'りんご']);
  expect(hook.current.inputError).toBeNull();
});

it('入力し直し始めたら、エラーは消える', async () => {
  const hook = await loaded();
  act(() => {
    hook.current.addItem('');
  });
  act(() => {
    hook.current.clearInputError();
  });
  expect(hook.current.inputError).toBeNull();
});

it('業者が失敗したら、読みこみエラーになる', async () => {
  vi.mocked(getItems).mockRejectedValue(new Error('つながらない'));
  const hook = await loaded();
  expect(hook.current.loadError).toBe('メモを読み込めませんでした');
  expect(hook.current.items).toEqual([]);
});
