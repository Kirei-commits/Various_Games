// 🙋 ホールスタッフ：機能1つ分の入力欄を出すだけ。
import { toSlug, type FeatureInput, type FeatureShape } from '../logic/generateBlueprint';

const SHAPES: { value: FeatureShape; label: string }[] = [
  { value: 'list', label: '一覧を取ってきて見せる・足す（例：本の一覧）' },
  { value: 'form', label: '入力してサーバーに送る（例：ログイン）' },
  { value: 'local', label: '画面の中だけで終わる（例：電卓、絞りこみ）' },
];

type Props = {
  /** 何番目の機能か（1から数える） */
  no: number;
  feature: FeatureInput;
  onChange: (patch: Partial<Omit<FeatureInput, 'id'>>) => void;
  /** フォルダ名の入力が終わったとき */
  onTidy: () => void;
  onRemove: () => void;
};

export function FeatureRow({ no, feature: f, onChange, onTidy, onRemove }: Props) {
  return (
    <li className="feature-row">
      <span className="feature-no">{no}</span>
      <label className="field">
        <span>何をする機能？（日本語）</span>
        <input
          value={f.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="例：本の一覧を見る"
        />
      </label>
      <label className="field">
        <span>フォルダ名（半角英字）</span>
        <input
          value={f.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          onBlur={() => onTidy()}
          placeholder="例：book-list"
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>
      {f.slug !== toSlug(f.slug) && toSlug(f.slug) !== '' && (
        <p className="slug-preview">
          フォルダ名は <code>{toSlug(f.slug)}</code> になります
        </p>
      )}
      <label className="field">
        <span>この機能の形</span>
        <select value={f.shape} onChange={(e) => onChange({ shape: e.target.value as FeatureShape })}>
          {SHAPES.map((shape) => (
            <option key={shape.value} value={shape.value}>
              {shape.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn-mini danger" onClick={() => onRemove()}>
        この機能を消す
      </button>
    </li>
  );
}
