#!/usr/bin/env bash
# テスト用 DB (chibatech_portal_test) を起動し Prisma スキーマを適用する。
#
# WHY: docker compose up は init SQL で `CREATE DATABASE chibatech_portal_test` を
# 行うが、Prisma スキーマ適用 (テーブル作成) は別途必要。これらを 1 コマンドにまとめ、
# `npm run test --workspace=@chibatech/db` を回す前に 1 回流すだけにする。
#
# 使い方: scripts/setup-test-db.sh
# 既存ボリュームがある場合は init SQL が走らないので、必要なら手動で
#   docker compose exec -T postgres psql -U postgres -c 'CREATE DATABASE chibatech_portal_test;'
# を流すか、ボリュームを作り直してから本スクリプトを実行すること。

set -euo pipefail

# WHY: スクリプトの場所からリポジトリルートに移動。実行 cwd に依存しない。
cd "$(dirname "$0")/.."

echo "[1/3] postgres / redis を起動..."
docker compose up -d postgres redis

echo "[2/3] postgres + init SQL 完了を待機 (最大 60 秒)..."
# WHY: 公式 postgres image は init フェーズ中に一時的なローカルソケットだけで
# 起動して /docker-entrypoint-initdb.d/*.sql を実行し、終わったら TCP listen に
# 切り替える。`pg_isready -U postgres` (デフォルト socket / "postgres" DB) は
# init 中でも通ってしまうため、init SQL で作る `chibatech_portal_test` への
# 実クエリを通じて (1) TCP listen 完了 (2) 対象 DB 作成完了 を同時に検証する。
ready=0
for _ in $(seq 1 60); do
  if docker compose exec -T postgres \
       psql -h 127.0.0.1 -U postgres -d chibatech_portal_test -c 'SELECT 1' \
       >/dev/null 2>&1; then
    ready=1
    echo "  chibatech_portal_test reachable via TCP"
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "  ERROR: chibatech_portal_test に 60 秒以内に接続できなかった" >&2
  echo "  hint: 既存ボリュームを使っているなら init SQL が走らないので、手動で" >&2
  echo "    docker compose exec -T postgres psql -U postgres -c 'CREATE DATABASE chibatech_portal_test;'" >&2
  exit 1
fi

echo "[3/3] chibatech_portal_test にスキーマを適用 (prisma migrate deploy)..."
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/chibatech_portal_test' \
  npx prisma migrate deploy --schema packages/db/prisma/schema.prisma

echo ""
echo "✓ test DB (chibatech_portal_test) is ready"
echo "  次は: npm run test --workspace=@chibatech/db"
