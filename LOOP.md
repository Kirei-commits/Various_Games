# 自動改善ループの回し方

このリポジトリのゲームは「実装 → セルフレビュー → 実際に遊ぶ → 直す → push」を
1周として、人の承認を待たずに回し続ける形で育てています。
**次に回し始めるとき、このファイルから読んでください。**

## 1周でやること

| 手順 | 内容 |
| --- | --- |
| 0. CI | 直近の push に対する GitHub Actions の**全ジョブ**の conclusion を確認。赤ならそれが最優先 |
| 1. 実装 | そのゲームのロードマップ／CLAUDE.md の「つぎにやること」先頭の未着手項目を1つ。ルール実装 + ロジックテスト + E2E + ドキュメント更新まで |
| 2. セルフレビュー | `/code-review` を自分の差分にかけ、出た指摘を直す。直さないなら理由を残す |
| 3. 実際に遊ぶ | `npm run playtest`。詰み・停止・表示崩れ・JSエラー・不自然な挙動を探す。**ここで見つけた問題はロードマップより優先** |
| 4. バランス | ルールや数値を触ったら測り直す。god-arena は勝率**と手数の中央値**、gungun-farm は `npm run simulate`（育ちの速さ・詰みの有無）。テストの閾値も更新する |
| 5. 確認と push | lint / ロジック / E2E を全文ログに落として「0 failed」を明示的に確認してから push |

判断に迷ったら `god-arena/ROADMAP.md` 冒頭の
**「選択の意味・読み合い・逆転・手触り」のどれが増えるか**で決めます。

### ゲームを1つ増やすとき

ワークフローは触りません。ディレクトリを作って
`index.html` / `package.json`（`start` `lint` `test:logic` `test:e2e`）/ `README.md` /
`CLAUDE.md` / `.gitignore` を置き、入口の `index.html` と `README.md` からリンクし、
`.github/dependabot.yml` に npm の項目を足せば、CIが勝手に拾います。
`node .github/scripts/check-repo.mjs` が抜けを教えてくれます。

## 回し始める

Claude Code のセッションで、次のように定期実行を仕掛けます（1時間ごとが下限）。

```
/loop 上の「1周でやること」を毎回実行して、このリポジトリのゲームを改善し続けて
```

または、サーバー側の Routine を直接作ります（セッションが落ちても復帰する）。
cron は UTC・最短1時間間隔。`:00` や `:30` は世界中の予定と重なるので避けます。

```
cron: 13 * * * *
prompt: LOOP.md の「1周でやること」を上から実行する。人間の承認は求めない。
```

止めるときは Routine を削除するか、`/loop` を止めます。

### ブラウザが取得できない環境で回すとき

Claude のクラウドセッションのように**ブラウザの取得が封じられ、配置済みのものを使う**
環境では、`@playwright/test` を上げた直後に E2E と通しプレイがローカルで動かなくなります
（新しいリビジョンを要求され、取得は拒否される）。CIは自分で入れるので影響ありません。

`PW_CHROMIUM` に実行ファイルのパスを渡すと、それで起動します。

```bash
export PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
npm run test:e2e
npm run playtest
```

置き場所は環境によって変わるので、まず探してください。

```bash
find /opt/pw-browsers -maxdepth 4 -type f -name chrome
```

**`npx playwright install` は実行しないこと。** 取得が封じられているので失敗します。

## 前提として守っていること

- **実行時の依存パッケージはゼロ。** ビルド工程を持ち込まない
- **テスト結果は `0 failed` を明示的に確認する。** passed の件数だけで判断しない。
  ログを `tail` で切ったものを根拠にしない（全文をファイルに保存して検索する）
- **バランスの数値は測って決める。** シードは `mixSeed()` で撹拌する
  （等差のシードだと乱数列が相関して、同じ実装でも勝率が 61% と 73% に分かれた）
- **PRは明示的に頼まれるまで作らない**

各ゲームの設計上の制約と、過去に踏んだ失敗は、そのゲームの `CLAUDE.md`
（`god-arena/` `gomoku-narabe/` `gungun-farm/`）に残してあります。
**実装の前に必ず読んでください。**同じ失敗を繰り返さないための記録です。

## いまの状態（2026-09-13）

### god-arena v1.4

- 検証: lint OK / ロジック 100件 / E2E 80件 / 通しプレイ 9局 0 issues
- 強さの実測（撹拌シード600局・先後入れ替え）
  - ゴッド vs かけだし 72.9%、ベテラン vs かけだし 64.0%、ゴッド vs ベテラン 59.0%
  - 1局の手数は中央 38〜40手
- 多人数戦の公平さ: 4人戦 中央10手 / 6人戦 中央12手 / **一度も動けず退場 0%**

### gungun-farm v1.2

待ち時間を最長10秒に詰めた農園ゲーム。1画面・スクロールなし。

- 検証: lint OK / ロジック 50件 / E2E 64件（desktop + mobile）/ 通しプレイ 0 issues
- **待ち時間（このゲームの売り・`npm run simulate` が毎回測る）**
  - 1秒以上つづいた待ち **0.1%**（時間差まきの前は 8.1%）
  - いちばん長く待たされた時間 **1300ms**（前は 3500ms）。3秒を超えたら失敗する
- 育ちの速さ: 10分でレベル中央 **14**、レベル20まで約18分
- 面白さの指標: 判断のある操作の割合 **24.9%**（収穫と植え直しを畳む前は 11.5%）

### 次に手を付けるもの（優先順）

1. **god-arena: 先手が有利すぎる。** 同レベル同士のタイマン200局で先手が 57〜59% 勝つ。
   後手への補い（初期手札+1、あるいは先手の初手は武器1つまで）を検討する
2. **god-arena: 6人戦が長い。** 1局のログが中央252件（最長491）
3. **gungun-farm: 作物選びが偽の選択。** 1秒あたりの儲けが作物の格と完全に一致していて、
   解放された中でいちばん格上を選べば常に正解。タネの一覧が飾りになっている。
   詳しくは `gungun-farm/ROADMAP.md` の A-1
4. **gungun-farm: 加工と注文に手が回っていない。** 通しプレイで収穫314回に対し加工3回・配達3回
4. `god-arena/ROADMAP.md` の B 以降（祈りの選択、捨てる操作、神の気まぐれ、演出、2人プレイ…）

## CI/CD

**ゲームの一覧をワークフローに書きません。**
`.github/scripts/discover-games.mjs` が「`package.json` と `index.html` があるディレクトリ」を
ゲームとみなして数え上げ、その結果を matrix に流し込みます。
ゲーム名を直書きすると `check-repo.mjs` が失敗します。

| ワークフロー / ジョブ | いつ動く | 中身 |
| --- | --- | --- |
| `ci.yml` / ゲームを数え上げる | 各push・PR | ゲーム一覧を作り、**リポジトリ全体の整合**を検査（入口のリンク、README、dependabot、CI用スクリプト、サブディレクトリのワークフロー） |
| `ci.yml` / 静的検査とロジックテスト | 〃 | 全ゲームぶん matrix で `npm run lint` → `npm ci` → `npm run test:logic` |
| `ci.yml` / ブラウザテスト | 〃 | 全ゲームぶん `npm run test:e2e`（desktop + mobile）。レポートを成果物に残す |
| `ci.yml` / 通しプレイ | 〃 | `playtest:ci` を持つゲームだけ。実ブラウザで最後まで遊ぶ |
| `ci.yml` / バランス計測 | 〃 | `simulate:ci` を持つゲームだけ。**実行の要約に数値の表を出す**（ブラウザ不要・数十秒） |
| `ci.yml` / 配信物の組み立てと大きさ | 〃 | `build-site.mjs` で `_site` を作り、**合計600KBの予算**を超えたら失敗。PRでも成果物として落とせる |
| `pages.yml` | デフォルトブランチへのpush | 同じ `build-site.mjs` で組み立てて GitHub Pages へ公開 |
| `dependabot.yml` | 毎月 | 開発用依存と Actions のバージョン追従 |

### CI用のスクリプトの決まり

局数や分数のような「CIでの加減」はワークフローではなく**ゲーム側の package.json** に置きます。

| script | 誰が呼ぶ | 例 |
| --- | --- | --- |
| `playtest` | 人 | `node tests/playtest.mjs`（既定はゆったり） |
| `playtest:ci` | CI | `node tests/playtest.mjs --games 1 --keep` |
| `simulate:ci` | CI | `node tests/simulate.mjs --minutes 10 --runs 8 --summary` |

**サブディレクトリ配下の `.github/workflows/` は GitHub では実行されません。**
（`gomoku-narabe/.github/workflows/ci.yml` が誰にも回されないまま残っていたので削除しました。
 いまは `check-repo.mjs` が置けないように見張っています。）

### デフォルトブランチについて

このリポジトリには **`main` がありません。** デフォルトブランチは
`claude/cyberpunk-gomoku-game-70crr8` です（作られた経緯のまま残っている）。
ワークフローの `branches:` にはこれを明記してあります。

`main` に改名するとワークフローが素直になりますが、
**クラウドセッションからはブランチの改名・デフォルト変更ができません**
（GitHub プロキシが設定系のAPIパスを拒否するため）。手元か GitHub の画面で
改名したら、`ci.yml` と `pages.yml` の `branches:` を `main` だけにしてください。

### Pages の初回設定（人の手が必要）

リポジトリの **Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** にしてください。それまで `pages.yml` は失敗します
（CIとは別のワークフローなので、CIの緑には影響しません）。
設定後は main への push で次のURLに公開されます。

```
https://kirei-commits.github.io/Various_Games/
```

Claude のクラウドセッションからは Pages の設定を変更できません
（GitHub プロキシが設定系のAPIパスを一律拒否するため）。
