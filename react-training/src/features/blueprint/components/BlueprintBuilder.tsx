// 🙋 ホールスタッフ：入力欄と、できあがった設計図を画面に出すだけ。
import { useState } from 'react';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import type { Role } from '../../../shared/components/RoleBadge';
import { PRESETS, useBlueprint } from '../hooks/useBlueprint';
import type { FileRole } from '../logic/generateBlueprint';

const BADGE: Record<FileRole, Role | undefined> = {
  api: 'api',
  logic: 'logic',
  ui: 'ui',
  index: undefined,
  app: undefined,
};

export function BlueprintBuilder() {
  const b = useBlueprint();
  const [openPath, setOpenPath] = useState<string | null>(null);
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
          {PRESETS.map((preset) => (
            <button key={preset.name} type="button" className="btn-mini" onClick={() => b.applyPreset(preset)}>
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
            <li key={f.id} className="feature-row">
              <span className="feature-no">{i + 1}</span>
              <label className="field">
                <span>何をする機能？（日本語）</span>
                <input
                  value={f.label}
                  onChange={(e) => b.updateFeature(f.id, { label: e.target.value })}
                  placeholder="例：本の一覧を見る"
                />
              </label>
              <label className="field">
                <span>フォルダ名（半角英字）</span>
                <input
                  value={f.slug}
                  onChange={(e) => b.updateFeature(f.id, { slug: e.target.value })}
                  onBlur={() => b.tidySlug(f.id)}
                  placeholder="例：book-list"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={f.usesServer}
                  onChange={(e) => b.updateFeature(f.id, { usesServer: e.target.checked })}
                />
                <span>データを取ってくる・保存する（仕入れ業者が要る）</span>
              </label>
              <button type="button" className="btn-mini danger" onClick={() => b.removeFeature(f.id)}>
                この機能を消す
              </button>
            </li>
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

      <div className="builder-step">
        <p className="step-label">ステップ3　設計図のレビュー（自動チェック）</p>
        {blueprint.notes.length === 0 ? (
          <p className="note note-ok">⭕ 名前のつけ方に問題は見つかりませんでした。下のチェックリストで自分でも確かめよう。</p>
        ) : (
          <ul className="notes">
            {blueprint.notes.map((note) => (
              <li key={note.text} className={`note note-${note.level}`}>
                {note.level === 'warn' ? '⚠️ ' : '💡 '}
                {note.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="builder-step">
        <p className="step-label">ステップ4　できあがった設計図</p>
        <CodeBlock title="フォルダ構成図" lang="text" code={blueprint.tree} />
        {blueprint.files.length > 0 && (
          <>
            <p>
              最初に作るファイルは <strong>{blueprint.files.length}個</strong>。ファイル名を押すと、ひな形コードが開きます。
              そのままコピーしてエディタに貼れば、開発を始められます。
            </p>
            <ul className="file-list">
              {blueprint.files.map((file) => {
                const open = openPath === file.path;
                return (
                  <li key={file.path}>
                    <button
                      type="button"
                      className="file-toggle"
                      aria-expanded={open}
                      onClick={() => setOpenPath(open ? null : file.path)}
                    >
                      <span>{open ? '▼' : '▶'}</span> {file.path}
                    </button>
                    {open && <CodeBlock title={file.path} role={BADGE[file.role]} code={file.code} />}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
