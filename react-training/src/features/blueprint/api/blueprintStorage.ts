// 🚚 仕入れ業者：書きかけの設計図を、ブラウザの保存場所から出し入れするだけ。
import { readJson, writeJson } from '../../../shared/lib/storage';
import type { FeatureInput } from '../logic/generateBlueprint';

export type BlueprintDraft = {
  appName: string;
  features: FeatureInput[];
};

const KEY = 'react-training.blueprint.v1';

export function loadDraft(): BlueprintDraft {
  const saved = readJson<Partial<BlueprintDraft>>(KEY, {});
  return {
    appName: typeof saved.appName === 'string' ? saved.appName : '',
    features: Array.isArray(saved.features) ? saved.features : [],
  };
}

export function saveDraft(draft: BlueprintDraft): void {
  writeJson(KEY, draft);
}
