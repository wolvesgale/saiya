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
### Prisma / Supabase（最重要）
`prisma/schema.prisma` は以下2変数を参照します。

- `POSTGRES_PRISMA_URL`（必須）: Supabase Pooler **Transaction** URL（通常 `:6543` + `pgbouncer=true`）
  - 例: `postgresql://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`
- `POSTGRES_URL_NON_POOLING`（必須推奨）: Prisma migrate 用の **direct** URL（`db.<project-ref>.supabase.co:5432`）
  - 例: `postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres`
  - 未設定時は migrate 実行スクリプトが `POSTGRES_PRISMA_URL` へフォールバック

補助変数（任意）:
- `DATABASE_URL` / `DIRECT_URL`: ランタイム互換のためのエイリアス（未設定でも上記2変数から補完）
- `POSTGRES_URL`: **非推奨**（既存互換のみ。新規設定は禁止）

必須アプリ設定:
- `XRULE_TENANT_ID` : 任意（単一テナント運用の固定テナントID）
- `FILE_STORAGE_PROVIDER` : `blob`（デフォルト）/ `gdrive`
- `BLOB_READ_WRITE_TOKEN` : `FILE_STORAGE_PROVIDER=blob` の場合に必須

### Supabaseキー
- `NEXT_PUBLIC_SUPABASE_URL`（公開可）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`（公開可）
- `SUPABASE_SERVICE_ROLE_KEY`（秘密）
- `SUPABASE_SECRET_KEY`（秘密）
- `SUPABASE_JWT_SECRET`（秘密）

> 秘密情報は `.env.local` などのgit管理外ファイルに保存し、リポジトリには絶対にコミットしないでください。

### Google Sheets（売上連携）
- `GOOGLE_SHEETS_SPREADSHEET_ID` : `1BcUh6QbeJoSxCdSfbabvTi1dlJ05ifVJ`
- `GOOGLE_SHEETS_SHEET_NAME` : `シート2`（シート名）
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` : サービスアカウントJSONをBase64化した文字列
- `GOOGLE_SHEETS_SCOPE` : `https://www.googleapis.com/auth/spreadsheets`（任意）
- **運用必須**: スプレッドシートをサービスアカウントの `client_email` に編集権限で共有する

#### サービスアカウント鍵（SECRET KEY）の発行手順
1. Google Cloud Console → **IAM と管理** → **サービス アカウント** を開く
2. 対象サービスアカウントを選択し、**鍵** タブで「**鍵を追加**」→「**新しい鍵を作成**」→ JSON
3. 取得した JSON を base64 化して `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` に設定する
   - 例: `base64 -i service-account.json | tr -d '\n'`
4. 既存キーを使わない場合は古いキーを削除してローテーションする

### Google Driveを使う場合のみ
- `GOOGLE_DRIVE_FOLDER_ID` : 共有フォルダID（例: `1IIgvvF-IC2cgVXh1YgGCVqqpZnPfbpN1`）
- `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` : サービスアカウントJSONをBase64化した文字列

### 任意（メール通知）
- `EMAIL_PROVIDER` : `console`（開発用 / デフォルト）, `ses`
- SESを使う場合
  - `AWS_REGION` : SESのリージョン
  - `AWS_ACCESS_KEY_ID` : IAMユーザーのアクセスキー
  - `AWS_SECRET_ACCESS_KEY` : IAMユーザーのシークレット
  - `SES_FROM` : SESで検証済みの送信元アドレス（例: `wolvesgale0512@gmail.com`）

## 初期データ（Seed）
- 初回テナント: `Xrule`
- SuperAdmin: `wolvesgale0512@gmail.com` / `initpass`

```bash
npm run seed
```

## 本番DBへの反映（Vercelでは自動でseedされません）
本番DBに初期管理者が存在しないとログインできません。Vercelの自動ビルドでは seed は実行されないため、手動で実行してください。
```bash
POSTGRES_PRISMA_URL="Pooler接続文字列(6543, pgbouncer=true)" \
POSTGRES_URL_NON_POOLING="Direct接続文字列(db.<project-ref>.supabase.co:5432)" \
npm run prisma:migrate:deploy

POSTGRES_PRISMA_URL="Pooler接続文字列(6543, pgbouncer=true)" \
POSTGRES_URL_NON_POOLING="Direct接続文字列(db.<project-ref>.supabase.co:5432)" \
npx prisma db seed
```

### Prisma migrate resolve（P3009復旧）
Vercel で `P3009` が出た場合は、まず復旧手順書を参照してください。

- 手順書: `docs/migrations/P3009-Recovery.md`

最短確認コマンド:
```bash
npx prisma migrate status
```

`20260211100000_add_venue_agency_id` の復旧コマンド（ケース別）:
```bash
# A) DBに変更が入っていない場合
npx prisma migrate resolve --rolled-back 20260211100000_add_venue_agency_id
npx prisma migrate deploy

# B) 途中まで適用済みの場合
npx prisma migrate resolve --applied 20260211100000_add_venue_agency_id
npx prisma migrate deploy
```

運用では npm scripts も利用できます:
```bash
npm run prisma:migrate:status

# A) DBに変更が入っていない場合
npm run prisma:migrate:resolve:rolledback
npm run prisma:migrate:deploy

# B) DBが既に最終状態（例: 42701 already exists）の場合
npm run prisma:migrate:resolve:applied
npm run prisma:migrate:deploy
```

### セキュリティ注意
- `.env` などの秘密情報は **絶対にコミットしない** でください。
- もし過去にコミットしてしまった場合は、DBパスワードやトークンを **必ずローテーション** してください。

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
5. `Project Settings -> Environment Variables` に `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` / `FILE_STORAGE_PROVIDER` を必ず登録
6. `FILE_STORAGE_PROVIDER=blob` の場合は `BLOB_READ_WRITE_TOKEN` を登録
7. `FILE_STORAGE_PROVIDER=gdrive` の場合は `GOOGLE_DRIVE_FOLDER_ID` / `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` を登録
8. Build Command を `npm run vercel-build` に設定し、migrate deploy を自動実行する
9. 単一テナント運用の場合、`XRULE_TENANT_ID` を設定して tenant 解決を確実にする（任意）

## ユーザーが準備すること（Codex以外で実施）
1. **GitHub**
   - リポジトリ `saiya` を作成し初回push
2. **Vercel**
   - GitHub連携でImport
   - Storageを追加
     - Postgres（Neonなど）
     - Vercel Blob
     - Upstash Redis（KV用途）
   - 環境変数（Preview/Production 両方に同じ値を設定）
     - `POSTGRES_PRISMA_URL`（Supabase Transaction pooler / `:6543` / `pgbouncer=true`）
     - `POSTGRES_URL_NON_POOLING`（Supabase direct接続 / `db.<project-ref>.supabase.co:5432`）
     - `DATABASE_URL`（任意エイリアス）
     - `DIRECT_URL`（任意エイリアス）
     - `FILE_STORAGE_PROVIDER`（`blob` or `gdrive`）
     - `BLOB_READ_WRITE_TOKEN`（`FILE_STORAGE_PROVIDER=blob` の場合）
     - `GOOGLE_SHEETS_SPREADSHEET_ID`
     - `GOOGLE_SHEETS_SHEET_NAME`
     - `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`
     - `GOOGLE_DRIVE_FOLDER_ID`（`FILE_STORAGE_PROVIDER=gdrive` の場合）
     - `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64`（`FILE_STORAGE_PROVIDER=gdrive` の場合）
     - `EMAIL_PROVIDER=ses`
     - `AWS_REGION`
     - `AWS_ACCESS_KEY_ID`
     - `AWS_SECRET_ACCESS_KEY`
     - `SES_FROM`（`wolvesgale0512@gmail.com`）
   - 環境変数を保存したら **再デプロイ** を実行
3. **AWS (SES)**
   - 送信元アドレスを検証済みにする（`SES_FROM`）
   - IAMユーザーを作成し、アクセスキーを発行
     - 付与する最小権限: `ses:SendEmail`, `ses:SendRawEmail`（対象リージョン）
   - SES が **sandbox** の場合、検証済みの送信先にしか送信できません
     - 本番送信先へ送るには production access 申請が必要です

## Google Drive（gdriveを使う場合のみ）
1. Google Cloudで **Drive API** を有効化
2. サービスアカウントを作成し、キーJSONを発行
3. サービスアカウントのメールアドレスを共有フォルダに **編集者** として追加
4. JSONをBase64化して `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` に登録
   - 例: `base64 -i service-account.json | tr -d '\n'`
5. `GOOGLE_DRIVE_FOLDER_ID` は共有フォルダのIDを指定
6. 共有リンクを **public** にするのは推奨しません（Drive側の共有権限で制御）

## Cron Jobs
Hobbyプランは1日1回までの制限があるため日次で実行します。
- `/api/cron/check-missing-sales`
- `/api/cron/check-unaccessed-events`

## API概要
- `/api/agencies` : 代理店CRUD
- `/api/users` : ユーザーCRUD（Admin/Agent）
- `/api/intermediaries` : 仲介業者CRUD
- `/api/venues` : 会場CRUD
- `/api/events` : スケジュールCRUD
- `/api/sales` : 売上入力（Agent）
- `/api/sales/summary` : 月次売上集計（Admin/Agent）
- `/api/attachments/upload` : Blob / Driveへアップロード（`FILE_STORAGE_PROVIDER` で切替）

## RBAC & テナント分離
- **SuperAdmin**: 全テナント横断
- **Admin**: 自テナント内フル権限
- **Agent**: 会場/イベント閲覧 + 売上入力 + メモ追記のみ

すべてのAPIで `tenantId` フィルタを適用し、SuperAdminのみ例外です。

## 添付アップロード
- `POST /api/attachments/upload` (formData)
  - `file` (File)
  - `entityType` (VENUE / EVENT)
  - `entityId`
  - `FILE_STORAGE_PROVIDER=blob` の場合は `blobUrl` に保存
  - `FILE_STORAGE_PROVIDER=gdrive` の場合は `driveFileId` / `driveWebViewLink` に保存

## CORS/Preflight
同一オリジンを前提としているため不要です。将来的にAPI Gatewayを使う場合は、CORS処理をGatewayに固定してください。
- preflight(OPTIONS)は **API Gatewayの自動応答** に固定し、Vercel/Lambda側でOPTIONSを持たない
- 検証curl例:
  ```bash
  curl -i -X OPTIONS "https://example.com/api/auth/login" \
    -H "Origin: https://saiya.vercel.app" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: content-type, authorization"
  ```

## パスワードについて
- パスワードは復元不可です。再設定は管理API（`/api/users/:id/reset-password`）で実施します。

## 受け入れ基準（E2E簡易チェック）
- 初期管理者でログインできる
- Xruleテナントが存在する
- Adminがユーザー/代理店/会場/スケジュールを作成できる
- Agentは会場/イベント閲覧と売上入力のみ
- 売上入力がGoogle Sheetsに連携される
- 添付がアップロードでき、Agentは削除できない

## 売上登録の検証（手動）
1. 認証ユーザーが `User` テーブルに存在しない状態で `POST /api/sales` を実行し、成功すること
   - 例: `authUserId` が未登録の認証ユーザーでログイン → 売上登録
2. 既存ユーザーでも `POST /api/sales` が成功すること
3. `tenantId` / `agencyId` が不正なセッションでは 403/400 で明示エラーになること

## 代理店管理（Agency）
- 代理店の追加項目: `email`, `shopName`, `password`（未指定の場合は `initpass`）
- Adminのみ作成/編集可能

## Google Sheets 連携設定
1. Google Cloudで **Service Account** を作成し、スプレッドシートAPIを有効化
2. サービスアカウントのキーJSONを発行し、Base64化して `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` に設定
   - 例: `base64 -i service-account.json | tr -d '\n'`
3. 対象スプレッドシートにサービスアカウントのメールを **編集者** で共有
4. `GOOGLE_SHEETS_SPREADSHEET_ID` にスプレッドシートIDを設定
5. `GOOGLE_SHEETS_SHEET_NAME` に対象シート名を設定（例: `シート2`）
6. セルマッピングは `lib/googleSheets.ts` の `SHEET_BLOCKS` で集約管理しています（J4/P4/J14/P14 ブロックを基準に書き込み）。

## Prisma反映手順
- 開発環境: `npx prisma migrate dev`
- 本番環境: `npx prisma migrate deploy`
- 確認のみ: `npx prisma db push`

### Vercel用の接続設定
- `POSTGRES_PRISMA_URL` を正とし、Supabase Transaction pooler (`:6543`) + `pgbouncer=true` を設定
- `POSTGRES_URL_NON_POOLING` は必ず direct host (`db.<project-ref>.supabase.co:5432`) を設定
- Prisma migrate系コマンドは `node scripts/prisma-command.mjs` 経由で実行し、`POSTGRES_URL_NON_POOLING` 未設定時のみ `POSTGRES_PRISMA_URL` にフォールバック
- ランタイム（`lib/db.ts`）は `DATABASE_URL` / `DIRECT_URL` が空でも上記2変数から補完
- `POSTGRES_URL` は非推奨。設定されている場合は `POSTGRES_PRISMA_URL` に統一する

## DynamoDBへ戻す場合のチェックリスト（将来用）
- PK/SK設計（`TENANT#{tenantId}` / `USER#{userId}`）
- ログイン参照キー（例 `USER#email`）とGSIが完全一致しているか
- テナント跨ぎ検索が起きないか


## 秘密情報ローテーション手順（Supabase）
このリポジトリから Supabase ダッシュボードを直接操作することはできないため、必ず管理者が以下を実施してください。

1. Supabase Dashboard で以下を再発行/更新
   - DB Password
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `SUPABASE_JWT_SECRET`
2. 直後に Vercel Production 環境変数を差し替え
   ```bash
   vercel env rm POSTGRES_PRISMA_URL production
   vercel env add POSTGRES_PRISMA_URL production

   vercel env rm POSTGRES_URL_NON_POOLING production
   vercel env add POSTGRES_URL_NON_POOLING production

   vercel env rm SUPABASE_SERVICE_ROLE_KEY production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production

   vercel env rm SUPABASE_SECRET_KEY production
   vercel env add SUPABASE_SECRET_KEY production

   vercel env rm SUPABASE_JWT_SECRET production
   vercel env add SUPABASE_JWT_SECRET production
   ```
3. `npm run prisma:env:check` で形式チェック後、再デプロイ
