// 🙋 ホールスタッフ：入力欄と、できあがった設計図を画面に出すだけ。
import { useBlueprint } from '../hooks/useBlueprint';
import { BlueprintResult } from './BlueprintResult';
import { FeatureRow } from './FeatureRow';

export function BlueprintBuilder() {
  const b = useBlueprint();
  const { draft, blueprint } = b;

  return (
    <div className="builder">
      <div className="builder-step">
        <p className="step-label">ステップ1　どんなアプリ？</p>
        <label className="field">
          <span>アプリの名前（日本語でOK）</span>
          <input
            value={draft.appName}
            onChange={(e) => b.setAppName(e.target.value)}
            placeholder="例：読書ノート"
          />
        </label>
        <p className="presets">
          <span>思いつかないときは見本から：</span>
          {b.presets.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="btn-mini"
              onClick={() => b.applyPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </p>
      </div>

      <div className="builder-step">
        <p className="step-label">ステップ2　機能を洗い出す</p>
        {draft.features.length === 0 && (
          <p className="muted">まだ機能がありません。「機能を足す」を押して、1つ目を書いてみよう。</p>
        )}
        <ul className="feature-list">
          {draft.features.map((f, i) => (
            <FeatureRow
              key={f.id}
              no={i + 1}
              feature={f}
              onChange={(patch) => b.updateFeature(f.id, patch)}
              onTidy={() => b.tidySlug(f.id)}
              onRemove={() => b.removeFeature(f.id)}
            />
          ))}
        </ul>
        <p className="builder-actions">
          <button type="button" className="btn" onClick={b.addFeature}>
            ＋ 機能を足す
          </button>
          {(draft.features.length > 0 || draft.appName !== '') && (
            <button type="button" className="btn-mini" onClick={b.clear}>
              最初からやり直す
            </button>
          )}
        </p>
      </div>

      <BlueprintResult blueprint={blueprint} />
    </div>
  );
}
