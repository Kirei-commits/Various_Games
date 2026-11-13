// 🚚 仕入れ業者：書きかけの設計図を、ブラウザの保存場所から出し入れするだけ。
import { readJson, removeItem, writeJson } from '../../../shared/lib/storage';
import type { FeatureInput } from '../logic/generateBlueprint';

export type BlueprintDraft = {
  appName: string;
  features: FeatureInput[];
};

const KEY = 'react-training.blueprint.v1';

/** 保存されていたままの形。古い版では shape の代わりに usesServer を持っていた */
type SavedFeature = Partial<FeatureInput> & { usesServer?: boolean };

export function loadDraft(): BlueprintDraft {
  const saved = readJson<{ appName?: unknown; features?: unknown }>(KEY, {});
  const features = Array.isArray(saved.features) ? (saved.features as SavedFeature[]) : [];
  return {
    appName: typeof saved.appName === 'string' ? saved.appName : '',
    features: features.map((f, i) => ({
      id: typeof f.id === 'string' ? f.id : `saved-${i}`,
      label: typeof f.label === 'string' ? f.label : '',
      slug: typeof f.slug === 'string' ? f.slug : '',
      shape: f.shape ?? (f.usesServer === false ? 'local' : 'list'),
    })),
  };
}

export function saveDraft(draft: BlueprintDraft): void {
  writeJson(KEY, draft);
}

export function clearDraft(): void {
  removeItem(KEY);
}
