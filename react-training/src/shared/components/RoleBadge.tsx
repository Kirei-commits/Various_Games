// 3つの役割のラベル。アプリ全体で同じ色・同じ絵文字を使い、どの回でも見分けられるようにする。

export type Role = 'ui' | 'logic' | 'api';

export const ROLE_INFO: Record<Role, { emoji: string; name: string; code: string }> = {
  ui: { emoji: '🙋', name: 'ホールスタッフ', code: 'コンポーネント' },
  logic: { emoji: '🍳', name: 'キッチン', code: 'カスタムフック' },
  api: { emoji: '🚚', name: '仕入れ業者', code: 'API・通信' },
};

export function RoleBadge({ role, long = false }: { role: Role; long?: boolean }) {
  const info = ROLE_INFO[role];
  return (
    <span className={`role role-${role}`}>
      {info.emoji} {info.name}
      {long && <small>（{info.code}）</small>}
    </span>
  );
}
