# Saiya (Xrule)

催事販売管理（Xrule）をマルチテナントSaaSとして構築するための、Next.js App Router + Prisma + Vercel連携の最小プロダクトです。

## 構成
- **Next.js App Router + TypeScript + Tailwind**
- **認証**: メール + パスワード（bcrypt）/ HttpOnly Cookie セッション
- **DB**: Postgres（Vercel Marketplace / Neon など）
- **ORM**: Prisma
- **ファイル**: Vercel Blob
- **KV / レート制限**: Upstash Redis（必要に応じて拡張）
- **定期処理**: Vercel Cron Jobs
- **通知**: 送信プロバイダは抽象化（Resend / SES 差し替え）

## ローカル起動
```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

## 環境変数
### 必須
- `DATABASE_URL` : Postgres接続文字列（Vercel Marketplaceで作成）
- `BLOB_READ_WRITE_TOKEN` : Vercel BlobのRWトークン

### 任意（メール通知）
- `EMAIL_PROVIDER` : `console`（開発用 / デフォルト）, `resend`, `ses`
- Resendを使う場合
  - `RESEND_API_KEY` : ResendのAPIキー
  - `RESEND_FROM` : 送信元メールアドレス（Resendで検証済み）
- SESを使う場合（実装は差し替え前提）
  - `AWS_ACCESS_KEY_ID` : IAMユーザーのアクセスキー
  - `AWS_SECRET_ACCESS_KEY` : IAMユーザーのシークレット
  - `SES_FROM` : SESで検証済みの送信元アドレス

## 初期データ（Seed）
- 初回テナント: `Xrule`
- SuperAdmin: `wolvesgale0512@gmail.com` / `initpass`

```bash
npm run seed
```

## 認証フロー
- `/login` からログイン
- `/api/auth/login` -> セッションCookie発行
- `/api/auth/logout` -> セッション破棄
- `/api/auth/me` -> ログインユーザー取得

## 管理者によるパスワード再設定
- エンドポイント: `POST /api/users/:id/reset-password`
- 管理画面から仮パスワードを発行し、ユーザーに共有
- 初回ログイン時に `/reset-password` で変更

## Vercelデプロイ手順
1. GitHubに `saiya` リポジトリを作成してpush
2. VercelでImportし、環境変数を設定
3. Postgres/Blob/Upstash RedisをVercel Marketplace経由で作成
4. `vercel.json` に定義したCron Jobsが有効化される

## ユーザーが準備すること（Codex以外で実施）
1. **GitHub**
   - リポジトリ `saiya` を作成し初回push
2. **Vercel**
   - GitHub連携でImport
   - Storageを追加
     - Postgres（Neonなど）
     - Vercel Blob
     - Upstash Redis（KV用途）
   - 環境変数
     - `DATABASE_URL`
     - `BLOB_READ_WRITE_TOKEN`
     - 任意: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM`
3. **メール送信プロバイダ**
   - Resend: 管理画面でAPIキー発行 → `RESEND_API_KEY` を設定
   - SES: Verified identityを作成し `SES_FROM` を設定

## Cron Jobs
Hobbyプランは1日1回までの制限があるため日次で実行します。
- `/api/cron/check-missing-sales`
- `/api/cron/check-unaccessed-events`

## API概要
- `/api/agencies` : 代理店CRUD
- `/api/users` : ユーザーCRUD（Admin/Agent/Broker）
- `/api/venues` : 会場CRUD
- `/api/events` : スケジュールCRUD
- `/api/sales` : 売上入力（Agent/Broker）
- `/api/broker/complete` : Broker完了（Agent入力ロック解除）
- `/api/attachments/upload` : Vercel Blobへアップロード

## RBAC & テナント分離
- **SuperAdmin**: 全テナント横断
- **Admin**: 自テナント内フル権限
- **Agent**: 閲覧 + 売上入力 + メモ追記のみ
- **Broker**: 当日完了のみ

すべてのAPIで `tenantId` フィルタを適用し、SuperAdminのみ例外です。

## 添付アップロード
- `POST /api/attachments/upload` (formData)
  - `file` (File)
  - `entityType` (VENUE / EVENT)
  - `entityId`

## CORS/Preflight
同一オリジンを前提としているため不要です。将来的にAPI Gatewayを使う場合は、CORS処理をGatewayに固定してください。

## 受け入れ基準（E2E簡易チェック）
- 初期管理者でログインできる
- Xruleテナントが存在する
- Adminがユーザー/代理店/会場/スケジュールを作成できる
- Agentは編集できず、売上入力のみ
- Broker完了がないとAgent当日売上入力が弾かれる
- 添付がアップロードでき、Agentは削除できない
