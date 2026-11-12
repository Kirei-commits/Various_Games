# Cloudflare で公開する手順

SwipeTalk を、ほかのゲームと別の住所（`https://swipetalk.<あなたのサブドメイン>.workers.dev`）で公開するための手順。
リポジトリ側の準備（`wrangler.jsonc`・`cloudflare/_headers`・`.github/workflows/cloudflare.yml`）は済んでいる。
下の 1〜3 を終えるまで、公開のワークフローは何もせずに終わる（GitHub Pages の公開は今までどおり動く）。

## 1. Cloudflare でやること

1. https://dash.cloudflare.com でアカウントを作る（無料）。**二段階認証を有効にする。**
2. 「Workers & Pages」を一度開く（初回に `◯◯.workers.dev` のサブドメインを決める画面が出る）。
3. アカウントID を控える（「Workers & Pages」の右側、または URL の `dash.cloudflare.com/` の次の英数字）。
4. API トークンを作る: 右上の人のアイコン → My Profile → API Tokens → Create Token →
   テンプレート「Edit Cloudflare Workers」。Account Resources は自分のアカウントだけ、Zone Resources は不要なら外す。
   **トークンはチャットやコードに貼らない。** 次の手順で GitHub に直接入れる。

## 2. GitHub でやること

リポジトリの Settings → Secrets and variables → Actions → **Secrets** に2つ作る。

| 名前 | 値 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | 上で作ったトークン |
| `CLOUDFLARE_ACCOUNT_ID` | 上で控えたアカウントID |

そのあと Actions → 「Cloudflare」→ Run workflow（ブランチはデフォルトのまま）で初回の公開をする。
公開先の URL は、実行結果の Summary に出る。

## 3. Firebase でやること（ログインを使うために必要）

Firebase コンソール → Authentication → Settings → 承認済みドメイン に、公開先のドメイン
（`swipetalk.<サブドメイン>.workers.dev`）を**1つだけ**足す。お試し用の URL（先頭に版の番号が付くもの）は足さない。

これをするまで、新しい URL では Google ログインが失敗する（ログインなしでは使える）。

## 引っ越しで気をつけること

- **ログインしていない人の学習記録は、URL が変わると引き継がれない。** 記録は URL ごとにブラウザへ保存されるため。
  古い URL（GitHub Pages）で一度ログインしてクラウドに保存し、新しい URL でログインすれば引き継げる。
- ホーム画面に置いたアイコンは古い URL のまま。新しい URL で置き直す。
- 当面は古い URL も動かしておく（`pages.yml` はそのまま）。全員が移ったら、古い方を案内ページに変える。

## しくみ

- `tools/cf-site.mjs` が、公開する物（`index.html`・`audio/`・`_headers`）だけを `.cf-site/` に集める。
- デフォルトブランチへの push（`eikaiwa-swipe/` が変わったとき）で本番を入れ替える。
- ほかのブランチを選んで手動実行すると、本番は変えずにお試し用の URL だけ作る（**URL を知っていれば誰でも見られる**）。
- `cloudflare/_headers` が守りのヘッダー（CSP・埋め込み禁止など）を付ける。外部の読み込み先を増やしたら CSP にも足す。
- 無料枠は1回の公開で 20,000 ファイルまで。今は約 13,500。近づくと `cf-site.mjs` が止める（そのときは録音を R2 へ）。
