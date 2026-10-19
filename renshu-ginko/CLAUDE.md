# CLAUDE.md — 練習銀行アカデミー（renshu-ginko）

AI前提の開発を段階的に練習するアプリ。仕様の出典は「アプリ開発練習アプリ 仕様プロンプト v0.1」、判断の記録は `SPEC-NOTES.md`。
**ビルド工程なし・実行時の依存ゼロ**（設定で TypeScript を選んだときだけ、js/ts.js がコンパイラを jsDelivr から読み込む）。`index.html` と `css/`・`js/` をそのまま配る（file:// でも動く）。

## 構成

```
js/core.js     SHA-256・文字列の正規化・決定的な並べ替え（純粋）
js/content.js  スキルマップ・L1-01〜05 / L2-01〜05 の中身（データだけ）。コードは String.raw で書く（\d などを守る）
js/units-more.js 追加の単元（L1-06〜10 / L2-06〜10）。content.addUnits で足す（レベル → ID の順に並べ直る）
js/units-l3.js 第2段階（L3-01〜05）。aiTask.mode で実践の進め方が変わる（spec-first / review / redteam）
js/runner.js   テストの DSL（test/expect）と実行。毎回使い捨ての Web Worker、5秒で打ち切り
js/rules.js    採点・足場・説明ゲート・マスキング検査・漏えい検査・静的解析・CI（純粋）
js/gitsim.js   ブラウザ上の簡易 Git（純粋。操作は新しい repo か { error } を返す）
js/tutor.js    ルールベースのチューター、LLM の呼び出し（Claude と Gemini。callLLM が設定の provider で振り分ける。fetchImpl を引数でもらう）、AI実装役
js/store.js    状態の形・保存・監査ログのハッシュの鎖（純粋）
js/ts.js       TypeScript 対応。compile(ts, libs, code) は ts と型定義を引数でもらう（Node のテストは npm の typescript を渡す）
js/hackathon.js ハッカソン・レビューモードの登場人物・採点・進み具合（純粋）。問題の形は先頭のコメント
js/hack-sprints-a/b/c.js スプリント1〜8 / 9〜16 / 17〜24 の中身（データだけ。addSprints で足す）
js/hack-consults.js スプリントごとの「聞きに行く」相談と、毎日の雑談（データだけ）
js/texts.js    言語テキストのコース・章・進み具合・バッジ（純粋）。形は先頭のコメント。問題の形と採点はハッカソンと共通
js/text-js/react/java/python.js 各言語のテキストの中身（データだけ。addCourse で足す）
js/text-view.js 言語テキストの画面（#/texts…）。問題の部品は hack-view.js のものを使う
js/work.js     配属先モード（実案件）の週・経営シミュレーション（力の配分 → 数字）・障害の抽選（週の番号で決まる）（純粋）
js/work-weeks-a/b.js 第1〜12週 / 第13〜24週の中身と抽選の障害（データだけ）
js/work-view.js 配属先モードの画面（#/work…）
js/challenge.js チャレンジの出題（3モードの問題から。日付・開始の合図で決まる順）と記録（純粋）
js/challenge-view.js チャレンジの画面（#/challenge…）。入力は挑戦ごとの使い捨てで、学習の記録に触れない
js/journey.js  モードのつながり: スプリント↔テキストの章の対応（章の資料の「スプリントN「」から）・今日やること・称号（純粋）
js/bonds.js    絆とエピソード（絆は保存せず、終えたスプリント・相談・会話・配属先の週から毎回数える）（純粋）
js/bond-episodes.js 16人×2話のエピソード（データだけ。恋愛・ライバルの要素は入れない。テストあり）
js/moneychat.js 作っているアプリのデモの中身（スプリント → 機能、直す前のバグと直した後の動き。返答はルール）（純粋）
js/report.js   メンター用の学習レポート（進み具合の数と状態だけ。会話・本文・鍵は入れない。テストあり）（純粋）
js/report-view.js レポートの画面（#/report）。ダッシュボードの「すべてのモードの記録」も同じ表示
js/messenger.js チャット（個別・グループ）の部屋・発言の種類・ルールの返事（ハッシュで決まる）・LLM への頼み方（グループは JSON の配列）（純粋）
js/chat-lines-a/b.js 一人ひとりのチャットのせりふ（データだけ。発言の種類ごと。messenger.test が全員そろっているか見張る）
js/chat-view.js チャットの画面（#/chat・#/chat/<部屋>）
js/hack-view.js ハッカソンの画面（#/hack…）。app.js が渡す ui（h・update・render・state() など）で描く
js/app.js      画面（S-01〜S-08）。ブラウザ専用
tests/lint.mjs         構文・読み込み順・外部参照・CSP・純粋さ・簡易 SAST・id の実在
tests/coverage.mjs     ロジックテスト（npm run test:logic）をカバレッジつきで動かし、基準を下回ると失敗
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
- TypeScript の版は js/ts.js の VERSION と package.json の devDependencies をそろえる（ts.test が確かめる）。E2E は CDN への要求を node_modules のファイルで答える。
- TypeScript で型チェックするのは「ゼロから」（strict）と実践のコード（strict を外す。AI の書いた JavaScript も通すため）。パーソンズ・穴埋め・修正は渡されたコードが JavaScript なので型チェックしない。
- ヒントは3〜5段階（練習は rules.hintsFor が並べ替え・穴埋めに1段足す。ハッカソンは問題データに3〜5個）。全部開けたときだけ「答えを見る」を出す。答えを見た問題は state.retry に入れ、自力で解いたら消す。
- ハッカソンの問題データの `{名前}` は登場人物の id に置き換わる（hack.test が不明な名前を見張る）。せりふやヒントに JSX の `{sending}` などを書くと引っかかるので言い換える。
  行番号（defects[].line・bugLine・focus）は code の行に合わせる。採点の基準を表すフィールドは `checks`（`points` は問題のポイント）。
- lint の純粋さの検査は、テンプレート文字列（問題として見せるコード）の中は見ない。ふつうの文字列の中の `Math.random` などは引っかかる。
- E2E で保存データ（localStorage）を書き換えても、ページを離れるとき（pagehide）に画面の状態で上書きされる。状態を作るときは `window.__RGA_APP.state` を直接変えて、ハッシュで移動する。
- 登場人物のペルソナは `PERSONAS.md`（オーナー監修）が正。CAST とせりふはそれに合わせる。ライバル関係や衝突と和解の青春要素は入れない。
- 関係者の割り込み・技術ユーザーの仕様のひっくり返しは3〜4スプリントに1回だけ（event.interrupt: true。hack.test が間隔を見張る）。ほかの回は PO・ユーザー・チームとのやりとりにする。
- 言語テキストの図（figure.text）は等幅で、全角を2文字と数えて44桁以内（スマホで横にはみ出さないように）。
- text-js.js の問題のコードにテンプレート文字列を書くときは、ファイル内のタグ R（ˋ をバッククォート、＄{ を ${ に置き換える String.raw）を使う。ふつうの文字列にバッククォートを書くと lint の「テンプレート文字列の中は見ない」がずれる。
- 配属先モードの障害の抽選は乱数を使わず、週の番号のハッシュで決める（同じ配分なら同じ結果。テストが確かめる）。抽選の障害は何度か起きうるので、起きるたびに入力をまっさらにする。
- 並べ替え問題（order）の最初の並びは hack.initialOrder（決まった並べ替え。答えと同じにならない）。
- 称号は app.js の render のたびに journey.newTitles で確かめ、state.titles に記録してお祝いする（どの画面で条件を満たしても気づく）。
- E2E でファイルを選ばせるとき（setInputFiles）は、ファイルを英数字だけのパス（os.tmpdir() の下）に置く。日本語の長いテスト名から作られる test-results のフォルダだと、選択が黙って空になった。
- lint の簡易 SAST は文字列とコメントを除いたコードだけを見る。new Function は runner.js だけに許している。
- API キーは store.SECRETS（Claude の apiKey・Gemini の geminiKey）に並べ、主の保存先（localStorage の本体）には書かない。書き出しは store.exportable を通す。新しい鍵を足すときも SECRETS に足す（gemini.test が確かめる）。
- LLM を呼ぶ画面は tutor.hasAI / modelFor / callLLM を使う（会社ごとの分岐を画面に書かない）。CSP の connect-src は Anthropic と Google の API だけ（lint が確かめる）。
- チャットに話せる人を足したら、chat-lines-a/b.js に全部の発言の種類（open〜default）のせりふを足す（messenger.test が確かめる）。上司は「{player}くん」。グループの顔ぶれは messenger.GROUPS。
- チャットの個別の部屋で話した回数も絆に入る（ハッカソンの会話と合わせて5点まで）。会話の本文はレポートに入れない。
- Gemini のモデルは既定で自動（tutor.callGeminiAuto）。一覧（models.list）を rankGeminiModels で並べ、キーごとに覚える。モデル名を決め打ちしない（gemini-2.5-flash は新しい利用者には提供が終わり、実際に止まった）。
- チャットの LLM への頼み方は messenger.llmRequest（雑談の場。部署や得意分野は背景だけで、相手が振らない限り仕事・技術の話をしない）。hack.personaPrompt やスプリントの状況は渡さない（渡すと全員が仕事の話に引っぱられた）。
- チャットの好感度は保存せず messenger.statsOf で毎回数える（土台 PROFILES[id].base ＋ 絆×3 ＋ 個別で話した回数 ＋ うれしい言葉×3 ＋ グループでの発言）。人柄の数値は PROFILES（PERSONAS.md から決めた目安）。話せる人を足したら PROFILES にも足す（messenger.test が確かめる）。
- 個別とグループの返事は互いに引き継ぐ（llmRequest が呼び方・口調の例・仲・相手の部屋の最近のやりとりを入れる）。
