import { Part1 } from './Part1';
import { Part2 } from './Part2';
import { Part3 } from './Part3';
import { Part4 } from './Part4';
import { Part5 } from './Part5';
import { Part6 } from './Part6';
import { QUIZ, TASK } from './data';
import type { LessonContent } from '../types';

export const lesson4: LessonContent = {
  parts: [
    { title: '機能の見つけ方', Component: Part1 },
    { title: '設計図を作る', Component: Part2 },
    { title: 'なぜ設計図を作るのか', Component: Part3 },
    { title: 'エディタで始める', Component: Part4 },
    { title: 'よくある失敗', Component: Part5 },
    { title: '理解度チェック', Component: Part6 },
  ],
  questions: QUIZ,
  tasks: [TASK],
};
