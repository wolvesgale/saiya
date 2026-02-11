# Prisma P3009 Recovery Guide (Vercel / Production)

Vercel deploy で `prisma migrate deploy` が `P3009` で停止する場合、原因は **コードではなくDB側の migration 状態** です。

- エラー例: `migrate found failed migrations in the target database`
- 対象 migration: `20260211100000_add_venue_agency_id`

このドキュメントは、本番DBを壊さずに復旧するための手順です。

---

## 0. 先に必ずやること（安全対策）

1. 本番DBのバックアップ / スナップショットを取得する
2. 作業者を限定する（同時に別の migration 作業をしない）
3. 作業対象DB（production/staging）の接続先を再確認する

---

## 1. 状態確認

まず migration 状態を確認します。

```bash
npx prisma migrate status
```

あわせて以下の両方を確認してください。

### 1-A. `_prisma_migrations` を確認

`20260211100000_add_venue_agency_id` の行を確認し、`finished_at` / `rolled_back_at` / `logs` を見る。

確認SQL:

```sql
select migration_name, started_at, finished_at, rolled_back_at, logs
from "_prisma_migrations"
where migration_name = '20260211100000_add_venue_agency_id';
```

### 1-B. 実テーブル状態を確認（コピペ可）

```sql
-- (1) agencyId カラム
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'Venue' and column_name = 'agencyId';

-- (2) FK 制約名
select conname
from pg_constraint
where conname = 'Venue_agencyId_fkey';

-- (3) ON DELETE が SET NULL か確認（任意だが推奨）
-- confdeltype: 'n' = SET NULL（Postgresの内部コード）
select c.conname, c.confdeltype
from pg_constraint c
where c.conname = 'Venue_agencyId_fkey';
```

---

## 2. 分岐（A/B）

## A) 失敗 migration が DB に何も適用されていない場合

判断目安:
- `Venue.agencyId` が存在しない
- `Venue_agencyId_fkey` が存在しない

実行コマンド:

```bash
npx prisma migrate resolve --rolled-back 20260211100000_add_venue_agency_id
npx prisma migrate deploy
```

意味:
- failed migration を「ロールバック済み」と履歴修正
- 次回 deploy で migration を正しく再適用

---

## B) DBは最終状態だが migration が failed のまま残っている場合（今回の確定ケース）

判断目安:
- `Venue.agencyId` が存在する
- `Venue_agencyId_fkey` が存在する
- 必要なら `confdeltype = 'n'`（ON DELETE SET NULL）も確認できる
- `_prisma_migrations.logs` に `42701`（`column "agencyId" ... already exists`）が出ている

この場合は **再適用ではなく履歴整合** を行います（Option 2）。

実行コマンド:

```bash
npx prisma migrate resolve --applied 20260211100000_add_venue_agency_id
npx prisma migrate deploy
```

意味:
- DB実体は揃っているため、migration 履歴を applied に寄せる
- `P3009` ブロックを解除し、次の migration を進められるようにする

---

## 3. 復旧後の確認

```bash
npx prisma migrate status
```

- failed migration が残っていないこと
- `prisma migrate deploy` が正常終了すること
- Vercel deploy が完走すること

---

## 4. よくある注意点

- `P3009` はアプリコード修正では解消しない（DB migration 履歴の復旧が必要）
- 今回のように `42701 already exists` の場合、`--rolled-back` ではなく `--applied` を選ぶ
- 必ず「実テーブル状態」と「_prisma_migrations」の両面で確認してから実行する
- 本番DBの削除・リセットは行わない
