# こそだて日和

妊娠・出産から小学生までの、子育て情報サイト。

- サイト: https://kosodate-biyori.tsushidesuyo.chatgpt.site
- GitHub: https://github.com/tsushidayo/kosodate-biyori

## 主な機能

月齢・年齢別のガイド、チェックリスト、お世話の基本、お金・手続き、価格比較、ニュース・コラム、SNSの話題、検索、保存、LINE共有。58商品の価格と、64チェーンの情報を収録しています。価格は同じ商品・数量・送料・条件で比べ、古い掲載や未確認の価格は順位から除外します。

共有情報と利用者ごとの設定はSitesのD1に保存。GitHubにはサイトのソースと共有情報だけを保存し、誕生日・予定日・個人の保存記事・秘密は保存しません。サイトは本人限定の公開範囲を維持しています。

## GitHubとサイトの更新

GitHubの `collections/index.json` に載った収集ファイルは、サイトの `/api/refresh` から取り込みます。SNSには投稿の抜粋と収集時点の反応数を表示し、原文へのリンクを付けます。新しい同一投稿は収集日時で判断し、取得失敗時は既存データを維持します。

毎日の更新タスクでGitHubの新着を確認し、サイトへ反映した共有情報を `data/*.json` にも保存します。GitHubへのコードのpushだけでSitesが自動的に再公開されるわけではありません。画面や処理の変更はSitesの保存・公開手順が必要です。

- 毎日の更新: [docs/DAILY_UPDATE.md](docs/DAILY_UPDATE.md)
- 見た目と言葉: [docs/DESIGN_GUIDE.md](docs/DESIGN_GUIDE.md)
- 写真の出典: [docs/PHOTO_CREDITS.md](docs/PHOTO_CREDITS.md)
- 収集ファイルの以前の方針: [docs/COLLECTIONS.md](docs/COLLECTIONS.md)

## 開発・確認

Node.js 22.13以降。依存は `pnpm install`、開発は `pnpm dev`、ビルドは `pnpm build`。Sites環境ではSitesスキルのビルド・公開ヘルパーを使用します。

```sh
node node_modules/typescript/bin/tsc --noEmit
node --test tests/*.mjs
```

全自治体・全ローカル店の価格は未収録。メールとサイトを閉じている間の価格通知は未接続です。価格通知は次にサイトを開いた時の比較に対応しています。
