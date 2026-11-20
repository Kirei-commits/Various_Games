import { Part1 } from './Part1';
import { Part2 } from './Part2';
import { Part3 } from './Part3';
import { Part4 } from './Part4';
import { Part5 } from './Part5';
import { QUIZ, SORTING, TASK } from './data';
import type { LessonContent } from '../types';

export const lesson1: LessonContent = {
  parts: [
    { title: '3つの役割', Component: Part1 },
    { title: 'なぜ分けるのか', Component: Part2 },
    { title: '見分け方と練習', Component: Part3 },
    { title: 'レビューと失敗例', Component: Part4 },
    { title: '理解度チェック', Component: Part5 },
  ],
  questions: [...SORTING, ...QUIZ],
  tasks: [TASK],
};
