export type LessonMeta = {
  id: number;
  title: string;
  metaphor: string;
  goal: string;
};

export const LESSONS: LessonMeta[] = [
  {
    id: 1,
    title: 'アプリの全体像をつかむ',
    metaphor: 'レストランで理解する構造',
    goal: 'コードには3つの役割があり、なぜ分けるのかを自分の言葉で言える',
  },
  {
    id: 2,
    title: 'フォルダの分け方',
    metaphor: '散らからない部屋の片付け術',
    goal: '新しい機能を足すとき、どこにフォルダを作るか迷わない',
  },
  {
    id: 3,
    title: '実際のコードを見てみる',
    metaphor: '「お買い物メモ」を分解',
    goal: '分割されたコードを見て、どのファイルが何をしているか読み取れる',
  },
  {
    id: 4,
    title: '実践演習',
    metaphor: 'あなたのアプリの設計図を作る',
    goal: 'そのままエディタを開いて開発を始められる',
  },
];
