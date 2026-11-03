# Runbook: 出席 confirm / auto 実送信テスト（本番ライブ）

> 対象: 出席 confirm 送信と auto 自動送信を、**実際の授業ウィンドウ**で人間が
> 安全に実送信テストするための手順。外部システム（CIT 出席システム）に本物の
> HTTP を出すため、各段で env / 観測 / 即時 rollback を厳密に定義する。
>
> auto の解禁は **開発者コード方式**（姉妹アプリ モチカタと統一、2026-11-03〜）。
> 旧 env マスタースイッチ + allowlist（`ATTENDANCE_AUTO_EXECUTION_ENABLED` /
> `ATTENDANCE_AUTO_ALLOWLIST*`）は廃止した。

---

## 0. このランブックの前提と不変条件

実送信は**リポジトリ最高リスク**の操作なので、以下を絶対に崩さない。

- **段階順序を飛ばさない**: `confirm 単発` → `開発者コードで auto 解禁（UI）` → `auto dry-run` → `auto 実送信`。前段の合格証跡（DB 行）が取れるまで次段に進まない。
- **fail-closed を信頼する**: 開発者コード env `ATTENDANCE_AUTO_DEV_CODE` を設定しなければ、設定画面で auto を選べず（`verifyAutoDevCode` が常に false）、誰も解禁できない。解禁は**ユーザー毎**（各自が UI でコードを入力して自分の `autoUnlocked` を立てる）。
- **校内ネットワーク必須**: 実送信は CIT_Wi-Fi（campus network）からのみ到達する。`AttendanceHttpAdapter.healthCheck()`（`apps/worker/src/scrapers/adapters/attendance-http.ts`）が校外では false を返し、全 guard が `post_network` で reject される。テスト実施者は対象教室の CIT_Wi-Fi 圏内にいること。
- **本番で mock を使わない**: `ATTENDANCE_ADAPTER=mock` は `NODE_ENV=production` で factory が throw する（`apps/worker/src/scrapers/adapter-factory.ts`）。ライブテストは必ず実 adapter。mock はステージング/校外リハーサル専用。
- **テスト対象は実施者自身のアカウント1件のみ**。自分が設定画面で開発者コードを入力して解禁する。他ユーザーは各自が同じ手順を踏むまで auto は走らない。
- **rollback は mode 戻し / autoUnlocked 解除 / dry-run / dev code 削除**。コード変更や DB 手術を rollback 手段にしない。

### 関連コードの場所（読んで挙動を確認すること）

| 関心事 | ファイル |
| --- | --- |
| confirm 送信 API（サーバ guard + enqueue） | `apps/web/src/app/api/attendance/submit/route.ts` |
| confirm guard（純粋関数） | `packages/shared/src/lib/attendance-confirm-guard.ts` |
| QR セッション作成 API | `apps/web/src/app/api/attendance/qr-validate/route.ts` |
| 出席モード設定 API（dev code 検証 + autoUnlocked 付与） | `apps/web/src/app/api/attendance/settings/route.ts` |
| auto guard（pre-network / full） | `packages/shared/src/lib/attendance-auto-guard.ts` |
| 開発者コード解禁 / dry-run 判定（fail-closed） | `packages/shared/src/lib/attendance-rollout.ts` |
| Worker 本体（claim + 監査 + attend） | `apps/worker/src/jobs/attendance-job.ts` |
| Scheduler（auto 投入 / confirm リマインダ） | `apps/worker/src/jobs/scheduler.ts` |
| 出席 HTTP adapter（healthCheck / attend） | `apps/worker/src/scrapers/adapters/attendance-http.ts` |
| 時限開始時刻・JST 正規化 | `packages/shared/src/lib/attendance-schedule.ts` |

### 授業ウィンドウ（JST 固定・`PERIOD_START_TIMES`・10限制 1時限60分）

実送信が許可されるのは「授業開始 5 分前 ±2 分」= 開始 7 分前〜3 分前。

| 時限 | 開始(JST) | 送信ウィンドウ(JST) |
| --- | --- | --- |
| 1 | 09:00 | 08:53–08:57 |
| 2 | 10:00 | 09:53–09:57 |
| 3 | 11:00 | 10:53–10:57 |
| 4 | 12:00 | 11:53–11:57 |
| 5 | 13:00 | 12:53–12:57 |
| 6 | 14:00 | 13:53–13:57 |
| 7 | 15:00 | 14:53–14:57 |
| 8 | 16:00 | 15:53–15:57 |
| 9 | 17:00 | 16:53–16:57 |
| 10 | 18:00 | 17:53–17:57 |

このウィンドウ外では confirm も auto も `outside_time_window` / `current time does not match target class period` で skip される。テストは実授業の曜日・時限に合わせて実施する（曜日も `dayOfWeek` 一致が必要）。授業は通常2時限連続（例: 3-4限=11:00–13:00）で、連続コマは先頭ブロックで1回登録すればよい。

---

## 1. 事前準備（全段共通・一度だけ）

### 1.1 観測の口を開ける

別ターミナルで以下を常時流しておく（実 Postgres / Redis に接続できる環境から）。

- worker ログ: `docker compose logs -f worker`
- 監査ログ tail: 最低限 `attendance_audit_logs` と `attendance_logs` を `userId` で絞って数秒間隔で SELECT（「§6 観測クエリ集」）。

### 1.2 テスト対象アカウントの確認（DB read のみ）

- 対象 `userId`（= 自分）を控える。
- `users.attendanceSettings.mode` を確認する。confirm 段では `'confirm'`、auto 段では `'auto'` に切り替える（出席設定 UI or `PUT /api/attendance/settings`）。auto 段は後述の開発者コード入力で `autoUnlocked=true` になる。
- `users.encryptedCitCreds` が NOT NULL であること（未登録なら confirm でも `credentials_not_registered` / `認証情報が未登録です` になる）。
- 対象の `timetable`（id / room / dayOfWeek / period）を控える。`room` が NULL だと Scheduler 投入も guard も通らない。

### 1.3 compose の env 配線（運用上の重要事項）

`docker-compose.yml` の web / worker はどちらも `env_file: .env`（optional）を読む。auto の env は **`.env` に書けば web と worker の両方へ届く**。どちらのプロセスが何を読むかに注意:

- **`ATTENDANCE_AUTO_DEV_CODE`** は **web** が読む（設定 API の `verifyAutoDevCode` / 出席ページの `isAutoDevCodeConfigured`）。変えたら **web** を作り直す。
- **`ATTENDANCE_AUTO_DRY_RUN`** は **worker** が読む（`attendance-job.ts` の `isAutoDryRun`）。変えたら **worker** を作り直す。
- auto 実行のゲート自体（`autoUnlocked`）は **env ではなく DB**（各ユーザーの `attendanceSettings`）。設定画面でコードを入力して立てる。
- env を変えたら必ず `docker compose up -d web worker`（or 対象サービスだけ）で作り直す。**env はプロセス起動時にしか読まれない**。
- 反映確認: `docker compose exec web printenv | grep ATTENDANCE_` / `docker compose exec worker printenv | grep ATTENDANCE_`。

### 1.4 緊急停止の合言葉（どの段でも即実行可能にしておく）

```
# 1) まず自分の auto を止める: 設定画面で mode を confirm/manual に戻す
#    → autoUnlocked が false にリセットされ、Scheduler 投入も Worker 最終ゲートも止まる。
# 2) それでも不安なら実送信を止める: .env に ATTENDANCE_AUTO_DRY_RUN=true を足して
docker compose up -d worker
# 3) 恒久ロック: .env から ATTENDANCE_AUTO_DEV_CODE を削除（or 空）して
docker compose up -d web   # 以後は誰も auto を解禁できない
```

confirm を止めたい場合は §2.5 を参照（mode 切替 / queue drain）。

---

## 2. 段階 A: confirm 単発 実送信

**狙い**: ユーザが UI で確認して送る経路（最小権限・常に実送信・dry-run 対象外）を 1 回だけ本物で通す。auto の解禁状態は一切関係しない。

### 2.1 前提

- 対象ユーザの `attendanceSettings.mode = 'confirm'`。
- `ATTENDANCE_ADAPTER` 未設定（= 実 adapter）。本番は `NODE_ENV=production` で mock 混入を factory が拒否。
- `CONFIRM_REMINDER_ENABLED=true` なら 10 分前 push が来る（テスト時刻を逃さないため推奨）。

### 2.2 実行手順

1. 対象教室の CIT_Wi-Fi に接続する。
2. 送信ウィンドウ（表 §0、開始 7〜3 分前）に入ったら、PWA で出席画面を開く。
3. ConfirmFlow から該当授業の「出席を送信」を実行する（= `POST /api/attendance/submit`）。
   - サーバ guard が `evaluateConfirmSubmitGuard` を通す。reject なら HTTP 400 + `reason`（`room_mismatch` / `outside_time_window` / `class_date_mismatch` / `already_submitted` / `credentials_not_registered` / `timetable_not_owned` / `not_in_confirm_mode`）。
   - 通れば 202 + `jobId`（`confirm-<userId>-<timetableId>-<YYYY-MM-DD>`）。
4. Push 通知（成功 `… 出席完了` / 失敗 `… 出席失敗`）を待つ。

### 2.3 観測（成功時の期待系列）

`attendance_audit_logs`（`userId` + 当日 `classDate`、`createdAt` 昇順）:

1. `phase=pre_attempt, method=confirm, outcome=NULL` — **実 HTTP 送信の直前**に必ず 1 行（`recordAuditRequired`。claim の真実源）。
2. `phase=post_attempt, method=confirm, outcome=success`（失敗なら `outcome=failed` + `reason`/`metadata.sanitizedMessage`）。

`attendance_logs`（unique: `userId,timetableId,classDate,method`）: `method=confirm` が最終的に `status=success`（途中で一瞬 `pending`）。
worker ログ: `[attendance] <class> (room <id>) [confirm]: SUCCESS - …`。

### 2.4 skip / 異常の読み方

| 観測 | 意味 | 対処 |
| --- | --- | --- |
| `attendance_logs.status=skipped` + audit `phase=skipped` | guard reject（ウィンドウ外 / room mismatch / not_in_confirm_mode / campus 未到達）| reason を確認。ウィンドウ/教室/mode を直して再試行 |
| audit に `pre_attempt` が無いまま skipped | 外部 HTTP 未到達（安全）| 送信されていない。原因（campusReachable=false 等）を潰す |
| `pre_attempt` あり + `post_attempt=failed` | CIT へ送ったが失敗応答 | CIT 側エラー。**二重送信厳禁**（再試行は §6 の claim 挙動を理解した上で）|
| `pre_attempt` あり + `post_attempt` 無し（クラッシュ）| 送信した可能性あり | 再試行すると claim が `possible_prior_submit` を返し再送しない（取りこぼし許容）。手動で CIT 画面を確認 |

### 2.5 confirm の rollback（即時停止）

confirm には専用キルスイッチが無い（人間の操作で完結）。停止手段:

1. **mode を戻す**: 対象ユーザの `attendanceSettings.mode` を `manual` にする。Worker 入口の `evaluateConfirmMethodGuard` が最新 mode を再評価し `not_in_confirm_mode` で skip する（stale ジョブも止まる）。
2. **enqueue を止める**: それ以上 `POST /api/attendance/submit` を叩かない。
3. **キュー残渣の排出**: 必要なら BullMQ `attendance` キューを drain。リマインダ push を止めるなら `CONFIRM_REMINDER_ENABLED=false` + worker 再起動。

confirm が安定して成功を 1 回以上記録できたら段階 B へ。

---

## 3. 段階 B: 開発者コードで解禁 → auto dry-run（実送信なし）

**狙い**: auto の全経路（Scheduler 投入 → Worker guard → healthCheck → **attend は呼ばない**）を、CIT_Wi-Fi 到達性まで本物で確認する。`adapter.attend()` は呼ばれない（`attendance-job.ts` §7.5）。

### 3.1 開発者コードを設定して自分の auto を解禁する

1. サーバの `.env` に開発者コードと dry-run を設定:

   ```dotenv
   ATTENDANCE_AUTO_DEV_CODE=<openssl rand -hex 24 などで作った長いランダム値>
   ATTENDANCE_AUTO_DRY_RUN=true
   ```

2. 反映（dev code は web、dry-run は worker）:

   ```
   docker compose up -d web worker
   ```

3. 出席設定 UI で **自動（開発者向け）** を選ぶ → 開発者コード入力欄に上のコードを入れて「解禁」。
   - 一致すれば `PUT /api/attendance/settings` が `{ mode:'auto', autoUnlocked:true }` を保存し、ラベルが「解禁済み」になる。
   - 未設定なら 403 `auto_locked`、不一致なら 403 `bad_dev_code`。
   - DB 確認: `users.attendanceSettings = { "mode":"auto", "autoUnlocked":true }`。

> `ATTENDANCE_AUTO_DRY_RUN` は fail-toward-dry-run。空/`false`/`0`/`no` 以外の**あらゆる値**で dry-run（`isAutoDryRun`）。typo しても実送信に倒れない。**実送信する段（C）でのみ未設定 or 明示 `false`**。

### 3.2 前提: 有効な QR セッション

auto は `qrSessionValid` を要求する（pre-network guard）。Scheduler も「期限内 QR セッションが無ければ投入しない」。

1. 送信ウィンドウより前（QR TTL は 30 分）に、対象教室の QR をスキャンして `POST /api/attendance/qr-validate` を成功させる。
2. `attendance_qr_sessions` に `userId,roomId,classDate` の行ができ `expiresAt > now`（`roomId` は `timetable.room` と一致が必要）。

### 3.3 実行と観測（dry-run の期待系列）

ウィンドウに入ると Scheduler が `method=auto` ジョブを投入（jobId `auto-<userId>-<timetableId>-<YYYY-MM-DD>`）。worker ログ `[scheduler] auto enqueued …`。

- `attendance_audit_logs`: `phase=skipped, method=auto, reason=dry_run, metadata={dryRun:true}`。**`pre_attempt` が出ないこと**（dry-run は claim も pre_attempt も書かない）。
- `attendance_logs`: `method=auto, status=skipped, errorDetail=dry_run`。
- worker ログ: `[attendance] auto dry-run (no real submit) job id=…`。Push: `dry-run: 実送信は行いません`。

**合格条件**: dry_run の skipped が記録され、`pre_attempt` / `post_attempt` が **一切無い**こと。

### 3.4 dry-run の rollback

dry-run はそもそも実送信しない。auto 経路自体を閉じるなら設定 UI で mode を confirm に戻す（autoUnlocked 解除）、または `.env` から `ATTENDANCE_AUTO_DEV_CODE` を消して `docker compose up -d web`。

---

## 4. 段階 C: auto 実送信（dry-run を外す）

**狙い**: 解禁済みの自分 1 ユーザで auto の実送信を本物で通す。段階 B との差分は **dry-run を外すだけ**。

### 4.1 env の差分

```dotenv
# ATTENDANCE_AUTO_DEV_CODE はそのまま（解禁済み）
ATTENDANCE_AUTO_DRY_RUN=false   # or 行削除。実送信を有効化（明示 opt-out）
```

```
docker compose up -d worker
docker compose exec worker printenv | grep ATTENDANCE_AUTO_DRY_RUN   # 消えている/false を確認
```

### 4.2 前提

- 段階 B 同様、ウィンドウ前に `qr-validate` を成功させ有効セッションを用意。
- 校内ネットワーク。対象の曜日・時限の実授業。mode=auto + autoUnlocked=true。

### 4.3 実行と観測（実送信の期待系列）

Scheduler が auto 投入 → Worker:

1. `evaluateAutoMethodGuard` 全通過（autoUnlocked / mode='auto' / 所有 / room 一致 / ウィンドウ / `qrSessionValid` / 未送信）。
2. `healthCheck()` true（CIT_Wi-Fi）。
3. claim `won`（`attendance_logs` に `pending`）。
4. `attendance_audit_logs`: `phase=pre_attempt, method=auto`（**実 HTTP 直前**）。
5. `adapter.attend()` 実行。
6. `attendance_audit_logs`: `phase=post_attempt, method=auto, outcome=success`。
7. `attendance_logs`: `method=auto, status=success`。Push `… 出席完了`。worker ログ `… [auto]: SUCCESS - …`。

**最重要な観測**: `pre_attempt`(auto) が **自分 1 件のみ**であること。他ユーザーは各自がコードを入力して解禁するまで auto は走らないので、`method=auto` の `pre_attempt` を当日全件 SELECT して自分以外が出たら即 rollback。

### 4.4 異常時の rollback（即時・最優先）

実送信が想定外（他人に送られた / ウィンドウ外 / 連投）兆候を見たら**即座に** §1.4 の順で止める。最速は設定 UI で mode を confirm に戻す（autoUnlocked 解除）。あわせて `.env` に `ATTENDANCE_AUTO_DRY_RUN=true` を足して worker 再起動（二重安全）、残ジョブは BullMQ `attendance` キューを drain。

合格条件（自分 1 件で複数授業ウィンドウにわたり成功・他者送信ゼロ・二重送信ゼロ）を満たせば、以後は通常運用。他ユーザーに広げる場合は、**同じ開発者コードを各自が設定画面で入力して各自解禁**する（全員一括解禁のスイッチは存在しない＝ fail-closed）。

---

## 5. 観測クエリ集（DB read 専用）

`<UID>` を対象 userId、`<YMD>` を当日 JST 日（`YYYY-MM-DD`、`@db.Date` は UTC midnight 規約）に置換。

```sql
-- 当日の監査ログ（時系列）。pre_attempt の有無と件数が最重要。
SELECT created_at, phase, method, outcome, reason, job_id, metadata
FROM attendance_audit_logs
WHERE user_id = '<UID>' AND class_date = '<YMD>'
ORDER BY created_at;

-- 当日の最終ログ（status / method）。
SELECT timetable_id, method, status, error_detail, attempted_at
FROM attendance_logs
WHERE user_id = '<UID>' AND class_date = '<YMD>'
ORDER BY attempted_at;

-- auto 実送信が想定ユーザ以外に出ていないか（当日 method=auto の pre_attempt を全ユーザで）。
SELECT user_id, count(*)
FROM attendance_audit_logs
WHERE class_date = '<YMD>' AND method = 'auto' AND phase = 'pre_attempt'
GROUP BY user_id;

-- 誰が auto を解禁しているか（attendanceSettings.autoUnlocked=true のユーザ）。
SELECT id, "attendanceSettings"
FROM users
WHERE "attendanceSettings"->>'autoUnlocked' = 'true';

-- QR セッションが有効か（auto 前提）。
SELECT room_id, class_date, expires_at, consumed_at
FROM attendance_qr_sessions
WHERE user_id = '<UID>' AND class_date = '<YMD>';
```

二重送信の安全装置の理解（`attendance-job.ts` `claimAttendanceSubmit`）:
- 真実源は `attendance_audit_logs` の `pre_attempt`。あれば「attend を試みた」= 再試行しても `possible_prior_submit` で**再送しない**（取りこぼし許容、二重送信は絶対回避）。
- `attendance_logs.status=success` があれば `already_submitted` で再送しない。
- ゆえに `failed` を見ても**手で再 enqueue しない**。CIT 画面で実際の出席状態を確認してから判断する。

---

## 6. チェックリスト（各段で必須）

- [ ] 対象教室の CIT_Wi-Fi 圏内にいる
- [ ] 対象は実授業の曜日・時限、送信ウィンドウ（開始 7〜3 分前）内
- [ ] `attendanceSettings.mode` が段に合致（confirm 段=confirm / auto 段=auto + autoUnlocked=true）
- [ ] `encryptedCitCreds` が登録済み
- [ ] auto 段は有効な QR セッション（`expiresAt>now`, `roomId=timetable.room`）あり
- [ ] env を変えたら対象サービスを `docker compose up -d web worker` で再起動し `printenv` で反映確認（dev code=web / dry-run=worker）
- [ ] worker ログと監査クエリの両方を tail している
- [ ] 緊急 rollback 手段を手元に開いてある（mode を confirm に戻す / `ATTENDANCE_AUTO_DRY_RUN=true` / dev code 削除）
- [ ] 前段の合格証跡（成功 / dry_run の DB 行）が取れている
