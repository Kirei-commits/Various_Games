import { lesson1 } from './lesson1';
import { lesson2 } from './lesson2';
import { lesson3 } from './lesson3';
import { lesson4 } from './lesson4';
import type { LessonContent } from './types';

export type Lesson = LessonContent & {
  id: number;
  title: string;
  metaphor: string;
  goal: string;
};

export const LESSONS: Lesson[] = [
  {
    id: 1,
    title: 'アプリの全体像をつかむ',
    metaphor: 'レストランで理解する構造',
    goal: 'コードには3つの役割があり、なぜ分けるのかを自分の言葉で言える',
    ...lesson1,
  },
  {
    id: 2,
    title: 'フォルダの分け方',
    metaphor: '散らからない部屋の片付け術',
    goal: '新しい機能を足すとき、どこにフォルダを作るか迷わない',
    ...lesson2,
  },
  {
    id: 3,
    title: '実際のコードを見てみる',
    metaphor: '「お買い物メモ」を分解',
    goal: '分割されたコードを見て、どのファイルが何をしているか読み取れる',
    ...lesson3,
  },
  {
    id: 4,
    title: '実践演習',
    metaphor: 'あなたのアプリの設計図を作る',
    goal: 'そのままエディタを開いて開発を始められる',
    ...lesson4,
  },
];
