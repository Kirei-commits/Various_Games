// 🍳 キッチン：設計図の入力内容を持ち、足す・直す・消すの操作と、できあがった設計図を渡す。
import { useEffect, useMemo, useState } from 'react';
import { loadDraft, saveDraft, type BlueprintDraft } from '../api/blueprintStorage';
import { PRESETS, type Preset } from '../logic/presets';
import { generateBlueprint, guessShape, toSlug, type FeatureInput } from '../logic/generateBlueprint';

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
      features: [...d.features, { id: newId(), label: '', slug: '', shape: 'list' }],
    }));

  const updateFeature = (id: string, patch: Partial<Omit<FeatureInput, 'id'>>) =>
    setDraft((d) => ({
      ...d,
      features: d.features.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));

  /**
   * フォルダ名の入力が終わったとき（フォーカスが外れたとき）に、入力欄の文字も整った形にそろえる。
   * ログインなど「送る」形だと分かる名前なら、形もそれに合わせる（自分で選び直せる）。
   */
  const tidySlug = (id: string) =>
    setDraft((d) => ({
      ...d,
      features: d.features.map((f) => {
        if (f.id !== id) return f;
        const slug = toSlug(f.slug);
        const shape = f.shape === 'list' && guessShape(slug) === 'form' ? 'form' : f.shape;
        return { ...f, slug, shape };
      }),
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
    presets: PRESETS,
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
