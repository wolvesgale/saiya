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

あわせて以下のどちらか（可能なら両方）で状態を確認します。

### 1-A. `_prisma_migrations` を確認

`20260211100000_add_venue_agency_id` の行を確認し、`finished_at` / `rolled_back_at` / `logs` を見る。

確認SQL例:

```sql
select migration_name, started_at, finished_at, rolled_back_at, logs
from "_prisma_migrations"
where migration_name = '20260211100000_add_venue_agency_id';
```

### 1-B. 実テーブル状態を確認

migration が作るはずの実体があるか確認する。

- `Venue.agencyId` カラムが存在するか
- `Venue_agencyId_fkey` が存在するか

確認SQL例:

```sql
-- カラム確認
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'Venue'
  and column_name = 'agencyId';

-- FK確認
select conname
from pg_constraint
where conname = 'Venue_agencyId_fkey';
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

## B) 途中まで適用されている場合（列/FKが一部存在する等）

判断目安:
- `Venue.agencyId` はあるが FK がない
- あるいは migration.sql 相当の状態と一致していない

手順:
1. 手動SQLでDBを **migration.sql の意図する最終状態** に揃える
   - 不足分のカラム/FKを追加
2. その後に履歴を applied として解決

実行コマンド:

```bash
npx prisma migrate resolve --applied 20260211100000_add_venue_agency_id
npx prisma migrate deploy
```

意味:
- 実体は揃っているので、履歴のみ「適用済み」に寄せる
- 以降の migration を前進可能にする

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
- `resolve --applied` / `--rolled-back` の選択を誤ると、次回 deploy で再失敗する
- 必ず「実テーブル状態」と「_prisma_migrations」の両面で確認してから実行する
