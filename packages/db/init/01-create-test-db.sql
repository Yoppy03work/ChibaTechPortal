-- ChibaTechPortal: postgres コンテナの初回起動時に実行される初期化 SQL
--
-- WHY: ホスト側の `npm test` (packages/db の Prisma 統合テスト) が
-- `.env.test:5` の DATABASE_URL = postgresql://...:5432/chibatech_portal_test
-- を要求するため、本番用 `chibatech_portal` とは別にテスト用 DB を作っておく。
-- postgres image は `/docker-entrypoint-initdb.d/*.sql` を初回起動時にだけ
-- 自動実行する。既存ボリュームがある場合は手動で
-- `CREATE DATABASE chibatech_portal_test;` を流すか、ボリュームを作り直すこと。
--
-- 注意: `CREATE DATABASE` は IF NOT EXISTS をサポートしない。複数回実行されると
-- エラーになるが、docker-entrypoint-initdb.d は初回のみ実行されるため衝突しない。

CREATE DATABASE chibatech_portal_test;
