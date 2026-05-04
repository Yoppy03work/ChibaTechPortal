-- attendanceSettings JSON の旧形式 { autoAttend: boolean } を新形式 { mode: AttendanceMode } に正規化
--
-- WHY: 3モード設計（manual/confirm/auto）への移行。runtime 側でも
-- `normalizeAttendanceSettings()` で同じロジックを通すが、DB を 1 回統一しておくことで
-- GET 時の不整合や、後続クエリでの判定揺れを減らす。
--
-- 変換ルール:
--   - { autoAttend: true }  → { mode: 'auto' }
--   - { autoAttend: false / null / 値なし } → { mode: 'confirm' }（デフォルトは半自動）
--   - 既に { mode: ... } 形式 → 触らない
--   - NULL 行 → 触らない（runtime で confirm にフォールバック）

UPDATE "users"
SET "attendance_settings" = jsonb_build_object('mode', 'auto')
WHERE "attendance_settings"->>'autoAttend' = 'true'
  AND NOT ("attendance_settings" ? 'mode');

UPDATE "users"
SET "attendance_settings" = jsonb_build_object('mode', 'confirm')
WHERE "attendance_settings" ? 'autoAttend'
  AND "attendance_settings"->>'autoAttend' IS DISTINCT FROM 'true'
  AND NOT ("attendance_settings" ? 'mode');
