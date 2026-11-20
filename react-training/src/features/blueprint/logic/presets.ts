// 思いつかないときに選べる、設計図の見本。
import type { FeatureInput } from './generateBlueprint';

export type Preset = { name: string; appName: string; features: Omit<FeatureInput, 'id'>[] };

export const PRESETS: Preset[] = [
  {
    name: 'ToDoアプリ',
    appName: 'やることリスト',
    features: [
      { label: 'やることの一覧と追加', slug: 'todo-list', shape: 'list' },
      { label: '絞りこみ（未完了だけ表示など）', slug: 'todo-filter', shape: 'local' },
    ],
  },
  {
    name: '読書記録',
    appName: '読書ノート',
    features: [
      { label: '読んだ本の一覧', slug: 'book-list', shape: 'list' },
      { label: '感想を書く', slug: 'book-review', shape: 'list' },
      { label: '月ごとの冊数グラフ', slug: 'reading-stats', shape: 'list' },
    ],
  },
  {
    name: '家計簿',
    appName: 'おこづかい帳',
    features: [
      { label: '支出を記録する', slug: 'expense-entry', shape: 'list' },
      { label: '月の合計を見る', slug: 'monthly-summary', shape: 'list' },
      { label: 'ログイン', slug: 'login', shape: 'form' },
    ],
  },
];
