import { Part1 } from './Part1';
import { Part2 } from './Part2';
import { Part3 } from './Part3';
import { Part3b } from './Part3b';
import { Part4 } from './Part4';
import { Part5 } from './Part5';
import { Part6 } from './Part6';
import { QUIZ, TASK } from './data';
import type { LessonContent } from '../types';

export const lesson3: LessonContent = {
  parts: [
    { title: '悪い例を見る', Component: Part1 },
    { title: '分け方の手順', Component: Part2 },
    { title: '良い例を読む（仕入れとキッチン）', Component: Part3 },
    { title: '良い例を読む（ホールと読む量）', Component: Part3b },
    { title: '読みこみの向きと確かめ方', Component: Part4 },
    { title: 'レビューと失敗例', Component: Part5 },
    { title: '理解度チェック', Component: Part6 },
  ],
  questions: QUIZ,
  tasks: [TASK],
};
