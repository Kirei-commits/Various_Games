# CLAUDE.md — 練習銀行アカデミー（renshu-ginko）

AI前提の開発を段階的に練習するアプリ。仕様の出典は「アプリ開発練習アプリ 仕様プロンプト v0.1」、判断の記録は `SPEC-NOTES.md`。
**ビルド工程なし・実行時の依存ゼロ**。`index.html` と `css/`・`js/` をそのまま配る（file:// でも動く）。

## 構成

```
js/core.js     SHA-256・文字列の正規化・決定的な並べ替え（純粋）
js/content.js  スキルマップ・L1-01〜05 / L2-01〜05 の中身（データだけ）。コードは String.raw で書く（\d などを守る）
js/units-more.js 追加の単元（L1-06〜10 / L2-06〜10）。content.addUnits で足す（レベル → ID の順に並べ直る）
js/units-l3.js 第2段階（L3-01〜05）。aiTask.mode で実践の進め方が変わる（spec-first / review / redteam）
js/runner.js   テストの DSL（test/expect）と実行。毎回使い捨ての Web Worker、5秒で打ち切り
js/rules.js    採点・足場・説明ゲート・マスキング検査・漏えい検査・静的解析・CI（純粋）
js/gitsim.js   ブラウザ上の簡易 Git（純粋。操作は新しい repo か { error } を返す）
js/tutor.js    ルールベースのチューター、Claude API（fetchImpl を引数でもらう）、AI実装役
js/store.js    状態の形・保存・監査ログのハッシュの鎖（純粋）
js/app.js      画面（S-01〜S-08）。ブラウザ専用
tests/lint.mjs         構文・読み込み順・外部参照・CSP・純粋さ・id の実在
tests/logic/*.test.mjs コンテンツの検査（お手本は合格・バグ入りは不合格）、評価セット（9章の受け入れ基準）
tests/e2e/*.spec.mjs   Playwright（desktop + mobile）
```

## 決まりごと

- **純粋なモジュールは DOM・乱数・時計・保存先・fetch に触れない**（lint が見張る）。時刻やネットワークは引数で渡す。
- 単元を足したら `content.test.mjs` が「お手本は通る／初期コードは落ちる／使わない行を混ぜると落ちる／AIの良い版は通り仕様不足の版は落ちる」を全部確かめる。
  AI の下書き（`aiTask.good`）は CI で src/ を全部まとめて読み込むので、**トップレベルの名前が単元をまたいでぶつからないこと**（テストあり）。
- パーソンズ問題は、テストが通っても「使わない行」を含めば不合格（return の後ろに置くと動いてしまうため）。
- `S.addMetric` は enrollment を丸ごと複製して返す。app.js では `enr.metrics = S.addMetric(...).metrics` の形で使う
  （Object.assign で丸ごと上書きすると、画面が持っている参照が切れて入力が消えた）。
- 練習で合格したら `enr.currentEx` をその問題に固定する。固定しないと、次の未解決の問題に表示が切り替わり、結果が消えたように見える（実際にそうなった）。
- AI の生成中は「テストで検証」を押せない。生成の完了が検証結果を消してしまうため。
- E2E はハッシュでの画面遷移が非同期なので、操作の前に目印の要素を待つ（helpers.mjs）。
- L3 の実践ステップは `aiTask.mode` で組み立てが変わる（app.js の stepAiOn）。spec-first は `aion.sf.phase` が spec → plan → tasks → tests → implement の順にしか進まない。
  学習者のテストはまずお手本（aiTask.good）で動かして、テスト自体が正しいかを確かめる。取り込むテストファイルは「学習者のテスト + 受け入れテスト」。
- レビュー課題の欠陥の行番号（aiTask.defects[].line）は aiTask.buggy の行に合わせる。buggy を書き換えたら行番号も直す（content.test が空行を指していないか確かめる）。
- 赤チーム演習の FAQ ボット（rules.faqBotReply）は LLM ではなく、動きを再現した関数。「秘密の質問を忘れました」のようなふつうの質問で漏れないこと（テストあり）。
- ダッシュボードの2系列の色（--series-off / --series-on）は dataviz の validate_palette で light・dark とも確認した値。変えるときは測り直す。
