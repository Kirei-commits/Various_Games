import { describe, expect, it } from 'vitest';
import { shuffledOrder } from './shuffle';

describe('shuffledOrder', () => {
  it('同じ問題なら、いつも同じ並びになる', () => {
    expect(shuffledOrder(4, 'q1')).toEqual(shuffledOrder(4, 'q1'));
  });

  it('すべての選択肢が1回ずつ出る', () => {
    expect([...shuffledOrder(4, 'abc')].sort()).toEqual([0, 1, 2, 3]);
  });

  it('問題がちがえば、並びも変わる（全部同じにはならない）', () => {
    const orders = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => shuffledOrder(3, id).join('')));
    expect(orders.size).toBeGreaterThan(1);
  });
});
