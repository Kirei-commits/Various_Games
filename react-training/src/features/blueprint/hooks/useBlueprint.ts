// 🍳 キッチン：設計図の入力内容を持ち、足す・直す・消すの操作と、できあがった設計図を渡す。
import { useEffect, useMemo, useState } from 'react';
import { loadDraft, saveDraft, type BlueprintDraft } from '../api/blueprintStorage';
import { generateBlueprint, toSlug, type FeatureInput } from '../logic/generateBlueprint';

export type Preset = { name: string; appName: string; features: Omit<FeatureInput, 'id'>[] };

export const PRESETS: Preset[] = [
  {
    name: 'ToDoアプリ',
    appName: 'やることリスト',
    features: [
      { label: 'やることの一覧と追加', slug: 'todo-list', usesServer: true },
      { label: '絞りこみ（未完了だけ表示など）', slug: 'todo-filter', usesServer: false },
    ],
  },
  {
    name: '読書記録',
    appName: '読書ノート',
    features: [
      { label: '読んだ本の一覧', slug: 'book-list', usesServer: true },
      { label: '感想を書く', slug: 'book-review', usesServer: true },
      { label: '月ごとの冊数グラフ', slug: 'reading-stats', usesServer: true },
    ],
  },
  {
    name: '家計簿',
    appName: 'おこづかい帳',
    features: [
      { label: '支出を記録する', slug: 'expense-entry', usesServer: true },
      { label: '月の合計を見る', slug: 'monthly-summary', usesServer: true },
      { label: 'ログイン', slug: 'login', usesServer: true },
    ],
  },
];

let counter = 0;
const newId = () => `f${Date.now()}-${counter++}`;

export function useBlueprint() {
  const [draft, setDraft] = useState<BlueprintDraft>(loadDraft);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const blueprint = useMemo(() => generateBlueprint(draft.appName, draft.features), [draft]);

  const setAppName = (appName: string) => setDraft((d) => ({ ...d, appName }));

  const addFeature = () =>
    setDraft((d) => ({
      ...d,
      features: [...d.features, { id: newId(), label: '', slug: '', usesServer: true }],
    }));

  const updateFeature = (id: string, patch: Partial<Omit<FeatureInput, 'id'>>) =>
    setDraft((d) => ({
      ...d,
      features: d.features.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));

  /** フォルダ名は、入力が終わったとき（フォーカスが外れたとき）に形をそろえる */
  const tidySlug = (id: string) =>
    setDraft((d) => ({
      ...d,
      features: d.features.map((f) => (f.id === id ? { ...f, slug: toSlug(f.slug) } : f)),
    }));

  const removeFeature = (id: string) =>
    setDraft((d) => ({ ...d, features: d.features.filter((f) => f.id !== id) }));

  const applyPreset = (preset: Preset) =>
    setDraft({
      appName: preset.appName,
      features: preset.features.map((f) => ({ ...f, id: newId() })),
    });

  const clear = () => setDraft({ appName: '', features: [] });

  return {
    draft,
    blueprint,
    setAppName,
    addFeature,
    updateFeature,
    tidySlug,
    removeFeature,
    applyPreset,
    clear,
  };
}
