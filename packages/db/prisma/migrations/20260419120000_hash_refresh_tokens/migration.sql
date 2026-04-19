-- Refresh Token 保存形式を HMAC-SHA256 ハッシュに切り替え
--
-- WHY: これまで `refresh_tokens.token` には生トークン（UUID）を保存していた。
-- DB 読み取り権限だけでセッションが奪える脆弱性があったため、
-- 以降は HMAC-SHA256(raw, REFRESH_TOKEN_PEPPER) のハッシュのみを保存する。
--
-- スキーマ自体は変更なし（列名も型も同じ）だが、既存の行は生トークン形式であり
-- 新方式と互換性がないため全削除する。この結果、全ユーザーは次回アクセス時に
-- 再ログインが必要になる。
--
-- FK (users.id) 参照があるが refresh_tokens を参照している側はないため
-- TRUNCATE ではなく DELETE で十分。履歴として残す意味でも DELETE を採用。

DELETE FROM "refresh_tokens";
