# verify-scrape Runbook（#3 scraper live 検証）

目的: `SCRAPE_ENABLED=true` + 実 creds がある時に「お知らせ取込」「課題取込」が実際に動くかを、**DB を汚さず**に確認する。

## 0. 前提
- ルート（`ChibaTechPortal/`）で実行。`tsx` はルート `node_modules/.bin` に存在済み。
- このスクリプトは **Redis 不要**（BullMQ を経由せず adapter を直接呼ぶ）。
- creds は **必ず env で**渡す（プロセス引数・ターミナル履歴への漏洩防止）。実行後 `history -c` 推奨。
- アクセス先は自分自身の creds に限定（compliance: 黙認ライン内）。他人 creds で叩かない。

## 1. まず dry-run（DB 書き込みなし）— manaba を notifications→assignments の順で

```bash
SCRAPE_ENABLED=true \
VERIFY_TARGET=manaba \
VERIFY_USER_ID='<学籍ID>' VERIFY_PASSWORD='<パスワード>' \
  npx tsx scripts/verify-scrape.ts
```

観測すべきログ（順番どおりに出る想定）:
- `[manaba] healthCheck=true` … false なら停止/未到達。CIT_Wi-Fi 不要（manaba は公開網）。
- `[manaba] login OK (cookies=N 個 …)` … cookies=0 や login 失敗例外ならログイン未確立。
- `[manaba] お知らせ取込: fetched=K 件 …` + サンプル 3 件 … **これがお知らせ取込の動作確認**。
- `[manaba] 課題取込: fetched=M 件 …` … **これが課題取込の動作確認**（manaba のみ）。
- `0 件` 警告が出たら → ログイン未確立 / HTML 構造変更 / データなし を疑う。

## 2. 次に CIT Portal（dry-run）

```bash
SCRAPE_ENABLED=true \
VERIFY_TARGET=cit-portal \
VERIFY_USER_ID='<学籍ID>' VERIFY_PASSWORD='<パスワード>' \
  npx tsx scripts/verify-scrape.ts
```

- `[cit-portal] 課題取込: … 非対応（skip）` が正常（CIT Portal は fetchAssignments を持たない）。
- お知らせ 0 件なら ViewState/ログイン or `table.infoTable` セレクタの構造変更を疑う。
- （補足）時間割 fetchTimetable はこのスクリプトでは検証対象外（#3 はお知らせ/課題が対象）。

## 3. 両方まとめて

```bash
SCRAPE_ENABLED=true VERIFY_TARGET=both \
VERIFY_USER_ID='<学籍ID>' VERIFY_PASSWORD='<パスワード>' \
  npx tsx scripts/verify-scrape.ts
```
実行順は `manaba`（notifications→assignments）→ `cit-portal`（notifications）。

## 4. （任意）DB まで通して差分エンジンを確認 — 既定では使わない
dry-run で件数が取れてから、本当に保存経路まで見たい時だけ。`--write` 単独では拒否される（二重ガード）。

```bash
SCRAPE_ENABLED=true ALLOW_DB_WRITE=true \
DATABASE_URL='postgresql://postgres:postgres@localhost:5433/chibatech_portal_test' \
VERIFY_TARGET=manaba \
VERIFY_DB_USER_ID='<DB上のUser.id>' \
VERIFY_USER_ID='<学籍ID>' VERIFY_PASSWORD='<パスワード>' \
  npx tsx scripts/verify-scrape.ts --write
```
- 本番 DB ではなく **test DB**（`scripts/setup-test-db.sh` の DB 等）を使うこと。
- `[WRITE] notifications 新着保存=… 件` / `[WRITE] assignments 新着保存=… 件` を観測。
- 2 回目以降は差分エンジンにより新着 0 件になるはず（冪等性の確認）。

## 5. 期待される合否の読み方
- login OK かつ notifications/assignments が 1 件以上 fetch → **取込は live で動いている**。
- 0 件 or login 失敗 → adapter のセレクタ/認証フローを実 HTML で要修正（バグの所在を絞る）。
