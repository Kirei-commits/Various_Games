import { Part1 } from './Part1';
import { Part2 } from './Part2';
import { Part3 } from './Part3';
import { Part4 } from './Part4';
import { Part5 } from './Part5';
import { QUIZ, TASK } from './data';
import type { LessonContent } from '../types';

export const lesson2: LessonContent = {
  parts: [
    { title: '2つの片付け方', Component: Part1 },
    { title: '最小構成と受付窓口', Component: Part2 },
    { title: 'なぜ機能ごとなのか', Component: Part3 },
    { title: 'レビューと失敗例', Component: Part4 },
    { title: '理解度チェック', Component: Part5 },
  ],
  questions: QUIZ,
  tasks: [TASK],
};
