# SwipeTalk（スワイプ式 英会話フレーズ学習）

Tinder 風のスワイプで英会話フレーズを仕分けて覚える、モバイルファーストの学習アプリです。
Claude の Artifacts（React）にそのまま貼り付けて動く **単一ファイルの React コンポーネント** として作っています。

- 本体: [`EikaiwaSwipe.jsx`](./EikaiwaSwipe.jsx)（`export default function App`）
- 依存: React / Tailwind CSS / lucide-react のみ

## 使い方（Claude Artifacts）

`EikaiwaSwipe.jsx` の中身をそのまま React アーティファクトとして貼り付けてください。

## 機能

| 画面 | 内容 |
|---|---|
| 学習 | カードを右スワイプ（⭕️ 覚えた）で出題キューから外し、左スワイプ（❌ 覚えてない）で最後尾へ。タップで裏返して日本語訳と A/B の会話例を表示。🔊 で英語を読み上げ。PC では ← / → / Space でも操作可能。 |
| 一覧 | 全22フレーズを英語・日本語で検索、未習得／覚えたで絞り込み。各行から音声再生、会話例の展開、ステータスの切り替え。 |
| 進捗 | 覚えた割合の円グラフ、連続学習日数、今日の仕分け数、累計スワイプ、レベル、マスター状況のマップ。 |

- 音声: Web Speech API の `SpeechSynthesis`（en-US。自然な音声があれば優先して選択）
- 保存: LocalStorage（キー `swipetalk:v1`）。使えない環境ではメモリ上のみで動き、進捗画面に注意書きを出します。

## 設計メモ

- **framer-motion は使っていません。** Artifacts で読み込めないとアプリ全体が表示されなくなるため、
  スワイプは Pointer Events + CSS transition で実装しています（要件の代替案に沿った判断）。
- Tailwind は Artifacts で使えるコアのユーティリティクラスのみを使い、
  3D 回転（`perspective` / `backface-visibility`）などはインラインスタイルで指定しています。
- 保存データは読み込み時に初期データと突き合わせるので、フレーズを追加・削除しても壊れません。
