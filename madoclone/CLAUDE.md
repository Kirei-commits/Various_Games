# CLAUDE.md

個人用・無課金の「まどクロ」クローン（Unity 6 / 2D URP / C#、Android のみ）。配布しない。応答・コメント・ドキュメントはすべて日本語。

## 最初に読むもの（この順）

1. `docs/02_実装編（Fable向け）.md` ― どう作るか（モジュール・スキーマ・テスト・順番）。約10分。
2. `docs/04_詳細設計（実装の順に）.md` ― **実装の直前の設計**（型・手順・テスト項目をスライス順に。S1〜S9）。実装に入るときは、該当のスライスの節を先に読む。
2.5. `docs/05_コーディング指針.md` ― **コードを書く前に読む**。リファクタリングで得た観点（何を直すべきと見るか、書くときの約束、テストの書き方、変更の種類ごとのやること、見つけたバグの再発防止）。
2.6. `docs/06_現状と次の開発候補.md` ― 今どこまでできていて、何ができていないか。次の候補。セッションの終わりに更新する。
3. `docs/01_仕様・要件定義書.md` ― 何を作るか。式は第2章、戦闘は第3章、キャラは第4章、敵は第6章、育成・運営要素は第7章、技術方針は第9章、工程は第10章、画面遷移は3.7節。
3. `dev/キャラデータ.md` ― 105体のスキル・凸・魔晶。`tools/Mado.Importer` の初回取り込みの入力。取り込んだあとは `characters.json`・`skills.json` が正で、調整は JSON を直す。**コミットしない**。
4. `dev/計測メモ_動画20本.md` ― 元ゲームの動画から取った実測メモ。数値の根拠を確かめたいときだけ読む。**コミットしない**。
5. `docs/03_設計見直し_2026-11-15.md` ― 見直しで変えた点と、ユーザーに確認が要る点。フェーズ3に入る前に「要確認」を片付ける。

食い違いを見つけたら、`docs/01` の式・数値が正。`docs/02` は設計の提案で、理由を付ければ変えてよい（不変条件を除く）。

## 不変条件（変える場合はユーザーに聞く）

1. Core に UnityEngine への依存を入れない（asmdef は noEngineReferences）。依存の向きは View → Core → Data の一方向。Core の中では Battle が育成・経済を参照しない（入力は解決済みの BattleSetup だけ）。
2. 数値・文言は Data（JSON）に置き、コードに埋めない。表示テキストは `text/ja.json`。
3. ジェム・チケット・コインなど素材の増減は、必ず `Wallet.Pay` / `Wallet.Grant` を通す（開発者モードのため）。残高の辞書を Wallet の外から触らない。
4. 戦闘は 0.1 秒刻みと、自前のシード付き乱数で決定的に進める（同じ実行環境で、同じ BattleSetup なら同じイベント列）。`System.Random`、`DateTime`、戦闘ループ内の `Math.Pow` は使わない。

## 守ること

- 名前と見た目は自作。元作品のキャラ名・技名・画像・音・文章を、JSON・`text/ja.json`・素材・ビルドに入れない。数値と挙動は元に合わせる。
- 元ゲームの資料（スクリーンショット、動画、名前の対応表 `dev/sourcemap.json`）は `dev/` に置く。`.gitignore` 済み。`Resources/` や `StreamingAssets/` に置かない。
- 絵・音・エフェクトはフリー素材か自作。出どころとライセンスを `ledger/assets.json` に記録する（`docs/02` 第8節）。ルートに小文字の `assets/` フォルダを作らない（Windows・macOS では Unity の `Assets/` と同じフォルダになる）。
- Core・Data のソースは Unity と dotnet の両方でコンパイルする。dotnet 側は netstandard2.1・C# 9 に固定する（`docs/02` 第2節）。
- 完全オフライン。通信・広告・課金・アカウント機能は作らない。
- 課金の代わりに、ジェム・チケットなどの無料の入手経路で同じ機能を残す。ログインボーナス・日次制限・期間限定・メールは作らない（実績報酬に吸収済み）。

## 仕様書の印

`[確定]`・`[実測]` はそのまま実装。`[推定]` は実装して計測で確かめる。`[仮]` は Data に置いて調整する。`[仮]` の値を変えたら、`docs/01` と `docs/02` 第9.1節の該当箇所も直す。

## コマンド（フェーズ0で `scripts/` に作る。詳細は `docs/02` 6.10節）

```text
scripts/check.sh   # コミット前の関門: validate（いまは Python 版）/ dotnet test / golden
scripts/check.sh --strict   # needsReview が残っていたら失敗にする（フェーズ4の完了条件）
scripts/coverage.sh   # テストのカバレッジ（下限を下回ると失敗）。--lines 名前 で通っていない行を出す
dotnet run --project tools/Mado.Sim -- golden [--update]   # ゴールデンの確認／期待値の更新（更新のコミットには理由を書く）
dotnet run --project tools/Mado.Sim -- battle --case 名前 --n 1000   # 1,000戦の勝率・決着時間
scripts/sim.sh     # データ変更後: 戦闘と経済のシミュレーション
dotnet run --project tools/Mado.Sim -- economy [--minutes 120]   # 遊び手に遊ばせて育ち具合を見る（「1〜2時間で★6」の確かめ）
dotnet run --project tools/Mado.Sim -- calibrate [--write]   # 敵の強さの倍率を自動で合わせる（docs/02 6.5節）。戦闘ルールやスキルを変えたら流す
Unity -batchmode -runTests -testPlatform EditMode   # Unity 側で同じテスト
Unity -batchmode -runTests -testPlatform PlayMode   # フェーズ完了時
```

変更したら、テストとスキーマ検証を通してから終える（`scripts/check.sh`、カバレッジは `scripts/coverage.sh`）。バグを直すときは、先に再現するテストを書く。
コードを書く・整理するときは `docs/05_コーディング指針.md` に従う（長い関数は段階で分ける、同じ形が3回出たらまとめる、魔法の数は定数かデータに、上限・容量には「達したとき」のテストを書く、など）。

## 進捗欄（セッションの終わりに必ず更新する）

| フェーズ | 状態 | メモ（やったこと・決めたこと・次にやること） |
|---|---|---|
| 0 準備 | 途中 | 済：リポジトリ、105体の取り込み（characters／skills／crystals）、基礎マスタ（system／tiers／stat_tables／buffs／difficulty／currencies）、スキーマ6本、検証（`tools/bootstrap/validate.py`）、`scripts/check.sh`。2026-11-15：asmdef 4本（Data／Core／View／Core.Tests）、dotnet 用プロジェクト（`tools/Mado.CoreLib`＝netstandard2.1・C# 9 でCore と Data を取り込む、`tests/Mado.Core.Tests`）、乱数 `Rng`（xoshiro128**、`Core/Util`）とそのテスト。（以前は未コンパイルだったが、上記のとおりコンパイル済み）（乱数の期待値だけは Python の参照実装 `tools/bootstrap/rng_reference.py` で確かめ済み）。`check_sources.py` で Core・Data の不変条件（Unity 参照なし・System.Random なし・名前空間の向き）を文字列で検査している。**S1（Data の型と読み込み。docs/04 3節）を書いた**：`Assets/Game/Data` に型・列挙・`Ranked<T>`・`DataLoader`・`DataValidator`・文字表、`Assets/Game/Tests/Data` にテスト。これも**未コンパイル**。代わりに `tools/bootstrap/check_csharp.py`（`check.sh` に入っている）が、C# の型と実データの突き合わせ・括弧の釣り合いを確かめる（壊した4通りで検出できることを確認済み）。**2026-11-15（続き）：クラウドのセッションで `apt-get install dotnet-sdk-8.0` が通り、dotnet 8 で初めてビルド・テストした。S0〜S1 はコンパイルエラーなしで36件が緑。続けて S3（`Core/Wallet`：Money／Cost／Reward／Wallet／DevMode）を実装し、テスト13件を足して計49件が緑。続けて S4（セーブ：`Core/Save` に SaveData／SaveCodec／SaveMigrator／SaveValidator、`Rng.GetState`／`FromState`、フィクスチャ `Tests/Fixtures/save_v1.json`）を実装し、計64件が緑。続けて S5（`Core/Growth`：CrystalService／RosterService。魔晶の移動・入れ替え・6凸での固有魔晶の配置。不変条件 (a)〜(d) を1万本のランダム操作で確認）を実装し、計73件が緑。続けて S6（`Core/Stats`：StatResolver／補正の3つの輪／ProfileModifierSource、`Data/SimProfiles.cs`・`sim_profiles.json`（空）・スキーマ）を実装し、計85件が緑。続けて S7 の戦闘本体（`Core/Battle`：BattleSim／DamageCalc／型。バフ・状態異常・トリガー・連鎖の上限・決定性のハッシュ。1000刻みで確保0バイトをテスト済み）を実装し、計140件が緑。続けて S7 の育成側（`Core/Growth`：BuffBook／SkillResolver／FormationRules／BattleSetupBuilder／StageFactory）と S8（`tools/Mado.Sim`：validate／golden／battle、ゴールデン10本＋スナップショット10戦、`compare_validate.py`）を実装し、計162件が緑。1,000戦は約1秒。決めた細部は `docs/decisions/2026-11-15_S7戦闘の実装で決めたこと.md`。**2026-11-16：`Mado.Sim calibrate`（SimPolicy・共通倍率・enemyScale の二分探索）を実装して `--write` で書き込み済み（結果と所見は `docs/decisions/2026-11-16_calibrateの結果と所見.md`。ボス勝率は全ランク 77〜85％・決着 29〜30 秒。味方の副ステータスの標準値（`sim_profiles.json` の `allySubstats`）を入れて再 calibrate 済み：「推奨の70％で勝率10％未満」はランク10〜15のみ未達（13〜17％）。敵の HP 倍率は最大445倍）。計170件が緑。**同日：リファクタリングとテストの強化（`docs/decisions/2026-11-16_リファクタリングとテストの強化.md`）。挙動は変えず（ゴールデン・calibrate の結果は不変）、テストは264件、カバレッジは行98.7％・分岐93.9％（`scripts/coverage.sh`。下限 96％・91％）。** **同日（続き）：A の最初の塊を実装（`IClock`・`NumberFormat`・`ISaveStore`＋`SaveLoader`・`MetricCounter`・`LevelService`・`AwakenService`・`RewardCalculator`・`rewards.json`＋`Mado.Sim rewards`）。経験値は敵を倒すとドロップ（ユーザー回答）。記憶カード・放置報酬の仮の数値を検証済み（`docs/decisions/2026-11-16_記憶カードと放置報酬の数値の検証.md`）：固定値は基礎の単位に換算する、カードLvの上限は絆ガチャの最大Lv（140）。計314件が緑。ランク10〜15の70％ライン：「難しいくらいでよい」（ユーザー）なのでラインは緩めず、敵の専用スキル・ボスの特徴で直す（B）。** **同日（続き）：A を完了（記憶カード・リーダー神殿・放置報酬・SaveRepair・GameSession）。計429件が緑、カバレッジ行98.8％・分岐92.9％。決めたことは `docs/decisions/2026-11-16_Aの完了で決めたこと.md`。**同日（続き）：B を実装（`enemy_kits.json`：型ごとの専用スキル・ボスの特徴・最終ボス、エンジンに属性耐性）。敵の防御の配分を10倍にして、70％ラインを全32ランクで達成（敵のHP倍率は最大458倍→136倍）。計457件が緑。記録は `docs/decisions/2026-11-16_敵の専用スキルとボスの特徴（Bの実装）.md`。ランク27〜32 の特徴を弱めて再校正済み（攻撃倍率 0.01→0.3、70％ラインは全ランク維持）。自動絆ガチャ・カード売却も実装（計467件）。フェーズ3の最初：広場（使い魔の里・霊界。`plazas.json`、計483件）。同日（続き）：試練7種と `RepeatGate`（歯止め）を実装（`trials.json`、報酬は実測の比例式と一致、計506件）。同日（続き）：サポート（使い魔・契約霊・竜）をエンジンと育成側に実装（計528件）。同日（続き）：竜の巣（属性ごとのツリー）、霊石版、研究・タロット・コレクション・図鑑・リーダー特殊ツリー、機能の解放、キャラガチャ、Unity の View（MadoHost・MadoApp・ホーム／編成／試練／ガチャ／戦闘の画面。UnityStubs に対して dotnet で型確認。ショップ・交換所・ルーレット・実績、覚醒のコピー消費と欠片ドロップ、`Mado.Sim economy`（90分で★6を確認）。vsハデス型・闘技の対戦・レース・パス・NPCギルドも実装（計702件）。残りの計画は docs/06 の7節（/loop で上から順に進める）。S9 は Unity が要る。** 未実装：S2 のうち Python 版にしか無い検査の移植。S2・S6〜S8 は済み、次は S9（Unity が要る）。**S4 で未実装なのは `Repair`（直せる違反の自動修復。docs/04 6.2節）と、ISaveStore を使った3世代バックアップ（View 側）。** 残り：（dotnet はクラウドでも入るので、以後の C# は毎回コンパイルして確かめる）、PC で Unity 6 の 2D(URP) プロジェクトを作る（ProjectSettings／Packages／.meta／`Assets/link.xml`）、`dotnet new sln` で `tools/Mado.Tools.sln`、残りのスキーマ（system・stat_tables・difficulty）。確認待ち（needsReview）は0件で、`scripts/check.sh --strict` が通る。元資料が曖昧だった箇所は推測で確定した（`docs/decisions/2026-11-15_確認待ちの確定.md`）（`python3 tools/bootstrap/import_characters.py` はもう流さない。JSON を直す） |
| 1 戦闘シミュレータ | 未着手 | |
| 2 育成の基礎 | 未着手 | |
| 3 育成の場所 | 未着手 | 始める前に `docs/03` の「要確認」（収入の歯止め）をユーザーに聞く |
| 4 全キャラ・全ランク | 未着手 | |
| 5 経済と周辺 | 未着手 | |

「必須になるマスタ」（フェーズごと。空のマスタは validate を通す）:
- （フェーズ0で決めてここに書く）

## 決めたことの記録

`docs/decisions/` に 1 ファイル 1 件、1〜2 行で書く（日付・決めたこと・理由）。
