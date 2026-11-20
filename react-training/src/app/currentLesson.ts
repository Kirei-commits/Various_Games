// 「いま、どの回のどのパートを開くか」を決める計算。React を使わないので、単体で確かめられる。
import type { Route } from './useRoute';

type LessonLike = { id: number; parts: unknown[] };
type ProgressLike = { completedLessons: number[]; unlockAll: boolean };

/** 第1回はいつでも読める。それ以降は、前の回を完了したら開く */
export function isUnlocked(lessonId: number, progress: ProgressLike): boolean {
  return lessonId === 1 || progress.unlockAll || progress.completedLessons.includes(lessonId - 1);
}

/**
 * 住所で指定された回が開けるならそれを、そうでなければ「まだ完了していない最初の回」を開く。
 * パートの番号は、その回にある範囲におさめる。
 */
export function resolveLocation<L extends LessonLike>(
  route: Route,
  lessons: L[],
  progress: ProgressLike,
): { lesson: L; partNo: number } {
  const requested = lessons.find((l) => l.id === route.lesson);
  if (requested && isUnlocked(requested.id, progress)) {
    return { lesson: requested, partNo: Math.min(Math.max(route.part, 1), requested.parts.length) };
  }
  const next = lessons.find((l) => !progress.completedLessons.includes(l.id)) ?? lessons[0];
  return { lesson: next, partNo: 1 };
}
