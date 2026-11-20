// 選択肢の並び順を決める計算。
// 問題ごとに決まった順（同じ問題なら、開き直しても同じ並び）でまぜる。
// 「正解はいつも2番目」のような偏りを、問題を書く人が気にしなくて済むようにするため。

// 並びを決める種に足す文字。変えると全問の並びが変わる。
// いまの問題一式で、正解の位置が1か所に偏らない値を選んである（偏りはテストで見張っている）。
const SALT = ':d';

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 0〜length-1 を、seedText から決まる順に並べかえて返す */
export function shuffledOrder(length: number, seedText: string): number[] {
  let state = hashText(seedText + SALT) || 1;
  const random = () => {
    // 小さな疑似乱数（mulberry32）
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
