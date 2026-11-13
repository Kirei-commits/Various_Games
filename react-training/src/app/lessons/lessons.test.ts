import { describe, expect, it } from 'vitest';
import { shuffledOrder } from '../../features/quiz';
import { LESSONS } from './lessons';

const questions = LESSONS.flatMap((lesson) => lesson.questions);
// 仕分け練習は、どの問題も同じ3択を同じ順で出す（並びをまぜない）
const shuffled = questions.filter((q) => !q.id.includes('-sort-'));

describe('各回の問題', () => {
  it('問題IDが重なっていない（重なると、答えの保存がまざる）', () => {
    const ids = [...questions.map((q) => q.id), ...LESSONS.flatMap((l) => l.tasks.map((t) => t.id))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('正解の番号が、選択肢の範囲に入っている', () => {
    for (const q of questions) {
      expect(q.answerIndex, q.id).toBeGreaterThanOrEqual(0);
      expect(q.answerIndex, q.id).toBeLessThan(q.choices.length);
    }
  });

  it('画面に出る正解の位置が、1か所に偏っていない', () => {
    const counts = new Map<number, number>();
    for (const q of shuffled) {
      const position = shuffledOrder(q.choices.length, q.id).indexOf(q.answerIndex);
      counts.set(position, (counts.get(position) ?? 0) + 1);
    }
    const most = Math.max(...counts.values());
    expect(shuffled.length).toBeGreaterThanOrEqual(16);
    expect(counts.size).toBeGreaterThanOrEqual(3);
    expect(most / shuffled.length).toBeLessThanOrEqual(0.45);
  });

  it('どの回にも、パートと理解度チェックがある', () => {
    for (const lesson of LESSONS) {
      expect(lesson.parts.length).toBeGreaterThanOrEqual(5);
      expect(lesson.questions.length).toBeGreaterThanOrEqual(4);
      expect(lesson.tasks).toHaveLength(1);
    }
  });
});
