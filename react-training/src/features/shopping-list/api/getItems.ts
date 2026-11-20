// 🚚 仕入れ業者：サーバーから「お買い物メモ」を取ってくるだけ。
// 画面のことも、追加のルールも、ここには書かない。

export type Item = {
  id: number;
  name: string;
};

export async function getItems(): Promise<Item[]> {
  // 本物のアプリなら、ここがサーバーとの通信になる：
  //   const response = await fetch('/api/items');
  //   return response.json();
  // この教材ではサーバーが無いので、0.6秒待ってから決まったデータを返す。
  await new Promise((resolve) => setTimeout(resolve, 600));
  return [
    { id: 1, name: '牛乳' },
    { id: 2, name: 'たまご' },
    { id: 3, name: '食パン' },
  ];
}
