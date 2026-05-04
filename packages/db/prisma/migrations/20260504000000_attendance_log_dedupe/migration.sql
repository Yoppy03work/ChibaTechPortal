-- WHY: auto出席の重複送信をDBでも止めるため、同一ユーザー・授業・日付・方式は
-- 1レコードに正規化する。既存重複は最新の attempted_at を残して削除する。
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY "user_id", "timetable_id", "class_date", "method"
      ORDER BY "attempted_at" DESC, "id" DESC
    ) AS row_number
  FROM "attendance_logs"
)
DELETE FROM "attendance_logs"
WHERE ctid IN (
  SELECT ctid FROM ranked WHERE row_number > 1
);

CREATE UNIQUE INDEX "attendance_logs_user_id_timetable_id_class_date_method_key"
ON "attendance_logs"("user_id", "timetable_id", "class_date", "method");
