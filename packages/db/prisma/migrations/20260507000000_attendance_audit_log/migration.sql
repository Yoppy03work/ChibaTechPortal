-- attendance_audit_logs (append-only)
--
-- WHY: 出席 auto 解禁条件 (AGENTS.md) の「送信前後の監査ログが残る」を満たす
-- ための専用テーブル。AttendanceLog は最終結果の上書き保存だが、本テーブルは
-- 試行ごとの時系列ログを蓄積する。
--
-- append-only 設計:
--   - コード側は create のみ呼ぶ。update/delete は提供しない。
--   - 一意制約は付けない (同一ジョブで pre_attempt と post_attempt の両方を残すため)
--   - 運用フェーズで Postgres role の DML 権限を分けて、UPDATE/DELETE を DB
--     レベルでも禁止する (将来対応)。

CREATE TABLE "attendance_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "timetable_id" TEXT,
    "class_date" DATE,
    "method" TEXT,
    "phase" TEXT NOT NULL,
    "outcome" TEXT,
    "reason" TEXT,
    "job_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_audit_logs_pkey" PRIMARY KEY ("id")
);

-- WHY: 「ユーザーごとの最近のイベント順閲覧」を高速化
CREATE INDEX "attendance_audit_logs_user_id_created_at_idx"
    ON "attendance_audit_logs"("user_id", "created_at");

-- WHY: 「特定授業日の試行履歴を引く」を高速化
CREATE INDEX "attendance_audit_logs_user_id_timetable_id_class_date_idx"
    ON "attendance_audit_logs"("user_id", "timetable_id", "class_date");

-- WHY: 同一ジョブの pre_attempt → post_attempt を結びつけて時系列を再構築する
CREATE INDEX "attendance_audit_logs_job_id_idx"
    ON "attendance_audit_logs"("job_id");

ALTER TABLE "attendance_audit_logs"
    ADD CONSTRAINT "attendance_audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_audit_logs"
    ADD CONSTRAINT "attendance_audit_logs_timetable_id_fkey"
    FOREIGN KEY ("timetable_id") REFERENCES "timetables"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
