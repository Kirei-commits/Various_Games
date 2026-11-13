// 🙋 ホールスタッフ：できあがった設計図（自動チェック・構成図・ひな形コード）を出すだけ。
import { useState } from 'react';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { FolderTree } from '../../../shared/components/FolderTree';
import type { Role } from '../../../shared/components/RoleBadge';
import type { Blueprint, FileRole } from '../logic/generateBlueprint';

const BADGE: Record<FileRole, Role | undefined> = {
  api: 'api',
  logic: 'logic',
  ui: 'ui',
  index: undefined,
  app: undefined,
};

export function BlueprintResult({ blueprint }: { blueprint: Blueprint }) {
  // どのファイルのひな形を開いているか（画面の都合なので、ここで持つ）
  const [openPath, setOpenPath] = useState<string | null>(null);

  return (
    <>
      <div className="builder-step">
        <p className="step-label">ステップ3　設計図のレビュー（自動チェック）</p>
        {blueprint.notes.length === 0 ? (
          <p className="note note-ok">
            ⭕ 名前のつけ方に問題は見つかりませんでした。下のチェックリストで自分でも確かめよう。
          </p>
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
        <FolderTree title="フォルダ構成図" code={blueprint.tree} />
        {blueprint.files.length > 0 && (
          <>
            <p>
              最初に作るファイルは <strong>{blueprint.files.length}個</strong>
              。ファイル名を押すと、ひな形コードが開きます。
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
    </>
  );
}
