import { describe, expect, it } from 'vitest';
import { isUnlocked, resolveLocation } from './currentLesson';

const lessons = [1, 2, 3, 4].map((id) => ({ id, parts: ['a', 'b', 'c'] }));
const progress = (completedLessons: number[], unlockAll = false) => ({ completedLessons, unlockAll });
const at = (lesson: number | null, part = 1) => ({ lesson, part });
const where = (...args: Parameters<typeof resolveLocation<(typeof lessons)[number]>>) => {
  const { lesson, partNo } = resolveLocation(...args);
  return [lesson.id, partNo];
};

describe('isUnlocked', () => {
  it('第1回はいつでも開いている', () => {
    expect(isUnlocked(1, progress([]))).toBe(true);
  });

  it('次の回は、前の回を完了したら開く', () => {
    expect(isUnlocked(2, progress([]))).toBe(false);
    expect(isUnlocked(2, progress([1]))).toBe(true);
    expect(isUnlocked(3, progress([1]))).toBe(false);
  });

  it('「すべて読めるようにする」なら、どの回も開く', () => {
    expect(isUnlocked(4, progress([], true))).toBe(true);
  });
});

describe('resolveLocation', () => {
  it('住所が無ければ、まだ完了していない最初の回', () => {
    expect(where(at(null), lessons, progress([]))).toEqual([1, 1]);
    expect(where(at(null), lessons, progress([1, 2]))).toEqual([3, 1]);
  });

  it('全部完了していて住所が無ければ、第1回（復習）', () => {
    expect(where(at(null), lessons, progress([1, 2, 3, 4]))).toEqual([1, 1]);
  });

  it('開いている回の住所なら、その回のそのパート', () => {
    expect(where(at(2, 3), lessons, progress([1]))).toEqual([2, 3]);
  });

  it('鍵のかかった回の住所は開かず、いま進めている回に戻す', () => {
    expect(where(at(3, 2), lessons, progress([]))).toEqual([1, 1]);
  });

  it('無い回・無いパートの住所でも、こわれない', () => {
    expect(where(at(9, 1), lessons, progress([]))).toEqual([1, 1]);
    expect(where(at(1, 99), lessons, progress([]))).toEqual([1, 3]);
    expect(where(at(1, 0), lessons, progress([]))).toEqual([1, 1]);
  });
});
