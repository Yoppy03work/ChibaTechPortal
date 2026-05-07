-- attendanceSettings JSON の旧形式 { autoAttend: boolean } を新形式 { mode: AttendanceMode } に正規化
--
-- WHY: 3モード設計（manual/confirm/auto）への移行。runtime 側でも
-- `normalizeAttendanceSettings()` で同じロジックを通すが、DB を 1 回統一しておくことで
-- GET 時の不整合や、後続クエリでの判定揺れを減らす。
--
-- 変換ルール:
--   - { autoAttend: true / false / null / 値なし } → { mode: 'confirm' }（デフォルト=半自動）
--   - 既に { mode: ... } 形式 → 触らない
--   - NULL 行 → 触らない（runtime で confirm にフォールバック）
--
-- 重要: 旧 autoAttend=true を新 mode='auto' に移行しない。
-- 旧 boolean フラグと新 3 モード設計は意味が異なる (新 auto は 6 条件ガード前提)。
-- 既存ユーザーを暗黙的に auto に昇格させると未確認のまま自動送信に巻き込む
-- 危険があるため、true / false どちらも安全側 (confirm) に倒す。
-- auto を選びたいユーザーは新 UI で明示的に選択する (現状は「準備中」で disabled)。

UPDATE "users"
SET "attendance_settings" = jsonb_build_object('mode', 'confirm')
WHERE "attendance_settings" ? 'autoAttend'
  AND NOT ("attendance_settings" ? 'mode');
