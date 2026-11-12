// 仕入れ業者：学習の進み具合を、ブラウザの保存場所から出し入れするだけ。
import { readJson, writeJson } from '../../../shared/lib/storage';

export type Progress = {
  /** 完了した回の番号 */
  completedLessons: number[];
  /** クイズの答え（問題ID → 選んだ選択肢の番号） */
  answers: Record<string, number>;
  /** チェックリストやミニ課題の「確認した」印 */
  confirmed: Record<string, boolean>;
  /** すべての回を自由に読めるようにするか */
  unlockAll: boolean;
};

export const EMPTY_PROGRESS: Progress = {
  completedLessons: [],
  answers: {},
  confirmed: {},
  unlockAll: false,
};

const KEY = 'react-training.progress.v1';

export function loadProgress(): Progress {
  const saved = readJson<Partial<Progress>>(KEY, {});
  return { ...EMPTY_PROGRESS, ...saved };
}

export function saveProgress(progress: Progress): void {
  writeJson(KEY, progress);
}
