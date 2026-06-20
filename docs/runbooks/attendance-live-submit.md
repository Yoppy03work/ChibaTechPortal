# Runbook: 出席 confirm / auto 実送信テスト（本番ライブ）

> 状態: 提案（このファイルはまだリポジトリに存在しない。レビュー後に
> `docs/runbooks/attendance-live-submit.md` として追加する）。
> 対象: 出席 confirm 送信と auto 自動送信を、**実際の授業ウィンドウ**で人間が
> 安全に実送信テストするための手順。外部システム（CIT 出席システム）に本物の
> HTTP を出すため、各段で env / 観測 / 即時 rollback を厳密に定義する。

---

## 0. このランブックの前提と不変条件

実送信は**リポジトリ最高リスク**の操作なので、以下を絶対に崩さない。

- **段階順序を飛ばさない**: `confirm 単発` → `auto dry-run` → `auto allowlist 単一` → `auto full`。前段の合格証跡（DB 行）が取れるまで次段に進まない。
- **fail-closed を信頼する**: env を何も足さなければ auto は走らない。`ATTENDANCE_AUTO_ALLOWLIST` が空なら誰も許可されない（`apps/worker/src/lib/attendance-rollout.ts` `isUserAllowlisted`）。
- **校内ネットワーク必須**: 実送信は CIT_Wi-Fi（campus network）からのみ到達する。`AttendanceHttpAdapter.healthCheck()`（`apps/worker/src/scrapers/adapters/attendance-http.ts`）が校外では false を返し、全 guard が `post_network` で reject される。テスト実施者は対象教室の CIT_Wi-Fi 圏内にいること。
- **本番で mock を使わない**: `ATTENDANCE_ADAPTER=mock` は `NODE_ENV=production` で factory が throw する（`apps/worker/src/scrapers/adapter-factory.ts`）。ライブテストは必ず実 adapter。mock はステージング/校外リハーサル専用。
- **テスト対象は実施者自身のアカウント1件のみ**。allowlist には自分の `userId` だけを入れる。`ATTENDANCE_AUTO_ALLOWLIST_ALL=true` はこのランブックでは使わない。
- **rollback は常に env フラグ off + worker 再起動**。コード変更や DB 手術を rollback 手段にしない。

### 関連コードの場所（読んで挙動を確認すること）

| 関心事 | ファイル |
| --- | --- |
| confirm 送信 API（サーバ guard + enqueue） | `apps/web/src/app/api/attendance/submit/route.ts` |
| confirm guard（純粋関数） | `packages/shared/src/lib/attendance-confirm-guard.ts` |
| QR セッション作成 API | `apps/web/src/app/api/attendance/qr-validate/route.ts` |
| auto guard（pre-network / full） | `packages/shared/src/lib/attendance-auto-guard.ts` |
| 段階解禁フラグ（fail-closed） | `apps/worker/src/lib/attendance-rollout.ts` |
| Worker 本体（claim + 監査 + attend） | `apps/worker/src/jobs/attendance-job.ts` |
| Scheduler（auto 投入 / confirm リマインダ） | `apps/worker/src/jobs/scheduler.ts` |
| 出席 HTTP adapter（healthCheck / attend） | `apps/worker/src/scrapers/adapters/attendance-http.ts` |
| 時限開始時刻・JST 正規化 | `packages/shared/src/lib/attendance-schedule.ts` |

### 授業ウィンドウ（JST 固定・`PERIOD_START_TIMES`）

実送信が許可されるのは「授業開始 5 分前 ±2 分」= 開始 7 分前〜3 分前。

| 時限 | 開始(JST) | 送信ウィンドウ(JST) |
| --- | --- | --- |
| 1 | 09:30 | 09:23–09:27 |
| 2 | 11:10 | 11:03–11:07 |
| 3 | 13:10 | 13:03–13:07 |
| 4 | 14:50 | 14:43–14:47 |
| 5 | 16:30 | 16:23–16:27 |
| 6 | 18:10 | 18:03–18:07 |

このウィンドウ外では confirm も auto も `outside_time_window` / `current time does not match target class period` で skip される。テストは実授業の曜日・時限に合わせて実施する（曜日も `dayOfWeek` 一致が必要）。

---

## 1. 事前準備（全段共通・一度だけ）

### 1.1 観測の口を開ける

別ターミナルで以下を常時流しておく（実 Postgres / Redis に接続できる環境から）。

- worker ログ:
  ```
  docker compose logs -f worker
  ```
- 監査ログ tail（`scripts/local-db-integration.ts` と同じ流儀で tsx スクリプト化してもよい）。最低限、`attendance_audit_logs` と `attendance_logs` を `userId` で絞って 5 秒間隔で SELECT する。観測クエリは「§5 観測クエリ集」を使う。

### 1.2 テスト対象アカウントの確認（DB read のみ）

- 対象 `userId`（= 自分）を控える。allowlist にこの文字列を入れる。
- `users.attendanceSettings.mode` を確認する。confirm 段では `'confirm'`、auto 段では `'auto'` に切り替える（UI の出席設定 or `POST /api/attendance/settings`）。
- `users.encryptedCitCreds` が NOT NULL であること（未登録なら confirm でも `credentials_not_registered` / `認証情報が未登録です` になる）。
- 対象の `timetable`（id / room / dayOfWeek / period）を控える。`room` が NULL だと Scheduler 投入も guard も通らない。

### 1.3 compose の env 配線ギャップに注意（運用上の重要事項）

`docker-compose.yml` の `worker.environment` は現状 `SCRAPE_ENABLED` と `CONFIRM_REMINDER_ENABLED` しか明示的に渡していない。`ATTENDANCE_AUTO_*` 系は **`.env`（env_file, `required: false`）経由でのみ worker プロセスに届く**。したがって:

- auto 段のフラグ（`ATTENDANCE_AUTO_EXECUTION_ENABLED` ほか）は **`.env` に書く** か、`worker.environment` に明示追記する。
- env を変えたら必ず `docker compose up -d worker`（または `restart worker`）で worker を作り直す。**env は worker プロセス起動時にしか読まれない**（`attendance-rollout.ts` の各関数は呼び出し毎に `process.env` を読むが、コンテナの環境変数自体は再起動するまで変わらない）。
- 反映確認: `docker compose exec worker printenv | grep ATTENDANCE_` で実際に効いている値を見る。

### 1.4 緊急停止の合言葉（どの段でも即実行可能にしておく）

```
# auto を即時全停止（最優先 rollback）
# .env から ATTENDANCE_AUTO_EXECUTION_ENABLED 行を削除 or =false にして:
docker compose up -d worker
```

confirm を止めたい場合は §2.5 を参照（フラグではなく mode 切替 / queue drain）。

---

## 2. 段階 A: confirm 単発 実送信

**狙い**: ユーザが UI で確認して送る経路（最小権限・常に実送信・dry-run 対象外）を 1 回だけ本物で通す。auto フラグは一切関係しない。

### 2.1 env にセットするもの

confirm は **auto 解禁フラグの影響を受けない**。むしろ auto は確実に閉じておく。

| env | 値 | 理由 |
| --- | --- | --- |
| `ATTENDANCE_AUTO_EXECUTION_ENABLED` | 未設定 or `false` | auto 経路を閉じる（confirm に無関係だが安全のため）|
| `ATTENDANCE_ADAPTER` | 未設定（= 実 adapter） | 本物の CIT へ送る |
| `NODE_ENV` | `production`（本番）| mock 混入を factory が拒否 |
| `CONFIRM_REMINDER_ENABLED` | 任意（`true` なら 10 分前 push が来る）| テスト時刻を逃さないため `true` 推奨 |

DB 側: 対象ユーザの `attendanceSettings.mode = 'confirm'`。

### 2.2 実行手順

1. 対象教室の CIT_Wi-Fi に接続する。
2. 送信ウィンドウ（表 §0、開始 7〜3 分前）に入ったら、PWA で出席画面を開く。
3. ConfirmFlow から該当授業の「出席を送信」を実行する（= `POST /api/attendance/submit`）。
   - サーバ guard が `evaluateConfirmSubmitGuard` を通す。reject なら HTTP 400 + `reason`（`room_mismatch` / `outside_time_window` / `class_date_mismatch` / `already_submitted` / `credentials_not_registered` / `timetable_not_owned` / `not_in_confirm_mode`）が返る。
   - 通れば 202 + `jobId`（`confirm-<userId>-<timetableId>-<YYYY-MM-DD>`）。
4. Push 通知（成功 `… 出席完了` / 失敗 `… 出席失敗`）を待つ。

### 2.3 観測（DB / 監査ログ）— 成功時の期待系列

`attendance_audit_logs`（`userId` + 当日 `classDate`、`createdAt` 昇順）:

1. `phase=pre_attempt, method=confirm, outcome=NULL` — **実 HTTP 送信の直前**に必ず 1 行（`recordAuditRequired`。これが claim の真実源）。
2. `phase=post_attempt, method=confirm, outcome=success`（失敗なら `outcome=failed` + `reason`/`metadata.sanitizedMessage`）。

`attendance_logs`（unique: `userId,timetableId,classDate,method`）:

- `method=confirm` の行が最終的に `status=success`（途中で一瞬 `pending` を通る = claim 行）。

worker ログ:
- `[attendance] <class> (room <id>) [confirm]: SUCCESS - …`

### 2.4 skip / 異常の読み方

| 観測 | 意味 | 対処 |
| --- | --- | --- |
| `attendance_logs.status=skipped` + audit `phase=skipped` | guard reject（ウィンドウ外 / room mismatch / not_in_confirm_mode / campus 未到達）| reason を確認。ウィンドウ/教室/mode を直して再試行 |
| audit に `pre_attempt` が無いまま skipped | 外部 HTTP 未到達（安全）| 送信されていない。原因（campusReachable=false 等）を潰す |
| `pre_attempt` あり + `post_attempt=failed` | CIT へ送ったが失敗応答 | CIT 側エラー。`reason` を確認。**二重送信厳禁**（再試行は §6 の claim 挙動を理解した上で）|
| `pre_attempt` あり + `post_attempt` 無し（クラッシュ）| 送信した可能性あり | 再試行すると claim が `possible_prior_submit` を返し再送しない（取りこぼし許容）。手動で CIT 画面を確認 |

### 2.5 confirm の rollback（即時停止）

confirm には専用キルスイッチが無い（auto と違いフラグでゲートしていない）。停止手段:

1. **mode を戻す**: 対象ユーザの `attendanceSettings.mode` を `manual` にする。Worker 入口の `evaluateConfirmMethodGuard` が最新 mode を再評価し、`not_in_confirm_mode` で skip する（enqueue 済みの stale ジョブも止まる）。
2. **enqueue を止める**: それ以上 `POST /api/attendance/submit` を叩かない（人間の操作なので自然に止まる）。
3. **キュー残渣の排出**: 必要なら BullMQ の `attendance` キューを drain（Redis 側で `bull:attendance:*` を確認）。リマインダ push を止めるなら `CONFIRM_REMINDER_ENABLED=false` + worker 再起動。

confirm が安定して成功を 1 回以上記録できたら段階 B へ。

---

## 3. 段階 B: auto dry-run（実送信なし・全 guard 通過の検証）

**狙い**: auto の全経路（Scheduler 投入 → Worker guard → healthCheck → **attend は呼ばない**）を、CIT_Wi-Fi 到達性まで本物で確認する。`adapter.attend()` は呼ばれない（`apps/worker/src/jobs/attendance-job.ts` §7.5）。

### 3.1 env にセットするもの

| env | 値 | 理由 |
| --- | --- | --- |
| `ATTENDANCE_AUTO_EXECUTION_ENABLED` | `true` | auto 経路を生かす（マスターキルスイッチ ON）|
| `ATTENDANCE_AUTO_ALLOWLIST` | `<自分の userId>` | fail-closed。自分だけ許可 |
| `ATTENDANCE_AUTO_DRY_RUN` | `true` | 全 guard 通過後も実送信せず skip(dry_run) |
| `ATTENDANCE_ADAPTER` | 未設定（実 adapter）| healthCheck を本物で（CIT_Wi-Fi 到達性を検証）|

> 注意（fail-toward-dry-run）: `ATTENDANCE_AUTO_DRY_RUN` は空/`false`/`0`/`no` 以外の**あらゆる値**で dry-run になる（`isAutoDryRun`）。typo しても実送信に倒れない。**実送信したい段（C/D）でのみ未設定 or 明示 `false`** にする。

DB 側: 対象ユーザの `attendanceSettings.mode = 'auto'`。

### 3.2 前提: 有効な QR セッション

auto は `qrSessionValid` を要求する（pre-network guard）。Scheduler も「期限内 QR セッションが無ければ投入しない」。実行前に:

1. 送信ウィンドウより前（QR TTL は 30 分）に、対象教室の QR をスキャンして `POST /api/attendance/qr-validate` を成功させる。
2. `attendance_qr_sessions` に `userId,roomId,classDate` の行ができ、`expiresAt > now` であることを確認する（`roomId` は `timetable.room` と一致が必要）。

### 3.3 実行と観測（dry-run の期待系列）

ウィンドウに入ると Scheduler が `method=auto` ジョブを投入（jobId `auto-<userId>-<timetableId>-<YYYY-MM-DD>`）。worker ログ `[scheduler] auto enqueued …`。

期待される DB:

- `attendance_audit_logs`: `phase=skipped, method=auto, reason=dry_run, metadata={dryRun:true}`。
  - **`pre_attempt` が出ないこと**を確認（dry-run は claim も pre_attempt も書かない = 送信を試みた判定を汚さない）。
- `attendance_logs`: `method=auto, status=skipped, errorDetail=dry_run`。
- worker ログ: `[attendance] auto dry-run (no real submit) job id=…`。
- Push: `dry-run: 実送信は行いません`。

**合格条件**: dry_run の skipped が記録され、`pre_attempt` / `post_attempt` が **一切無い**こと。これで「healthCheck まで本物・実送信ゼロ」が証明できる。

### 3.4 dry-run の rollback

dry-run はそもそも実送信しないが、auto 経路自体を閉じるなら:

```
# ATTENDANCE_AUTO_EXECUTION_ENABLED=false（or 行削除）
docker compose up -d worker
```

---

## 4. 段階 C: auto allowlist 単一ユーザ 実送信

**狙い**: allowlist に入れた 1 ユーザ（自分）でだけ、auto の実送信を本物で通す。

### 4.1 env にセットするもの（dry-run を**外す**のが唯一の差分）

| env | 値 | 理由 |
| --- | --- | --- |
| `ATTENDANCE_AUTO_EXECUTION_ENABLED` | `true` | auto 経路 ON |
| `ATTENDANCE_AUTO_ALLOWLIST` | `<自分の userId>` のみ | 自分だけ実送信 |
| `ATTENDANCE_AUTO_DRY_RUN` | **未設定 or `false`/`0`/`no`** | 実送信を有効化（明示 opt-out）|
| `ATTENDANCE_AUTO_ALLOWLIST_ALL` | 未設定 | 全員許可しない |
| `ATTENDANCE_ADAPTER` | 未設定（実 adapter）| 本物の CIT へ送信 |

反映確認: `docker compose exec worker printenv | grep ATTENDANCE_DRY` で dry-run が消えていること。

### 4.2 前提

- 段階 B の QR セッションと同様に、ウィンドウ前に `qr-validate` を成功させ有効セッションを用意。
- 校内ネットワーク。対象の曜日・時限の実授業。

### 4.3 実行と観測（実送信の期待系列）

Scheduler が auto 投入 → Worker:

1. `evaluateAutoMethodGuard` 全通過（env / mode='auto' / 所有 / room 一致 / ウィンドウ / `qrSessionValid` / 未送信）。
2. `healthCheck()` true（CIT_Wi-Fi）。
3. claim `won`（`attendance_logs` に `pending` 行）。
4. `attendance_audit_logs`: `phase=pre_attempt, method=auto`（**実 HTTP 直前**）。
5. `adapter.attend()` 実行。
6. `attendance_audit_logs`: `phase=post_attempt, method=auto, outcome=success`。
7. `attendance_logs`: `method=auto, status=success`。
8. Push: `… 出席完了`。worker ログ `… [auto]: SUCCESS - …`。

**この段で最重要な観測**: `pre_attempt`(auto) が **対象ユーザ 1 件のみ**であること。allowlist 外のユーザに対する auto ジョブが投入・送信されていないことを、`attendance_audit_logs` を `method=auto` で当日全件 SELECT して確認する（自分の userId 以外が出たら即 rollback）。

### 4.4 異常時の rollback（即時・最優先）

実送信が想定外（他人に送られた / ウィンドウ外で送られた / 連投された）兆候を見たら**即座に**:

```
# ATTENDANCE_AUTO_EXECUTION_ENABLED=false（or 行削除）
docker compose up -d worker
```

これでマスターキルスイッチが落ち、Scheduler 投入も Worker 最終ゲートも auto を止める（`evaluateAttendanceAutoGuardPreNetwork` の `autoExecutionEnabled=false` で全 reject）。あわせて:

- `ATTENDANCE_AUTO_DRY_RUN=true` を足して worker 再起動すると、万一フラグ反映が遅れても次のジョブは実送信されない（二重安全）。
- 残ジョブは BullMQ `attendance` キューを drain。

合格条件（自分 1 件で複数授業ウィンドウにわたり成功・他者送信ゼロ・二重送信ゼロ）を満たすまで C を繰り返し、満たしたら D を**検討**する。

---

## 5. 段階 D: auto full（全ユーザ解禁）— 慎重に

**狙い**: allowlist を撤廃し全ユーザに auto を解禁する。本ランブックの範囲では「やり方の明示」に留め、実施は別途承認（roadmap M2）を要する。

### 5.1 env にセットするもの

| env | 値 | 理由 |
| --- | --- | --- |
| `ATTENDANCE_AUTO_EXECUTION_ENABLED` | `true` | auto 経路 ON |
| `ATTENDANCE_AUTO_ALLOWLIST_ALL` | `true` | **明示 opt-in** で全員許可（`isUserAllowlisted` が即 true）|
| `ATTENDANCE_AUTO_DRY_RUN` | 未設定 or `false` | 実送信 |

> `ATTENDANCE_AUTO_ALLOWLIST_ALL=true` は唯一「fail-closed を解除する」スイッチ。これを入れる前に、C 段で複数ユーザ分の QR セッション運用・ウィンドウ・healthCheck が安定していること、監視（§5）が全ユーザ規模で回ることを確認する。

### 5.2 観測（規模が変わる）

- `attendance_audit_logs` を `method=auto, phase=pre_attempt` で**当日全件・件数監視**。想定授業数を超える `pre_attempt` が出たら異常。
- `post_attempt outcome=failed` の急増は CIT 側障害 or 自実装の退行 → rollback。

### 5.3 rollback

```
# まず全員許可を外す
# ATTENDANCE_AUTO_ALLOWLIST_ALL を削除（or =false）
docker compose up -d worker
# それでも不安なら経路ごと落とす
# ATTENDANCE_AUTO_EXECUTION_ENABLED=false
docker compose up -d worker
```

---

## 6. 観測クエリ集（DB read 専用）

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

-- auto 実送信が allowlist 外に漏れていないか（当日 method=auto の pre_attempt を全ユーザで）。
SELECT user_id, count(*)
FROM attendance_audit_logs
WHERE class_date = '<YMD>' AND method = 'auto' AND phase = 'pre_attempt'
GROUP BY user_id;

-- QR セッションが有効か（auto 前提）。
SELECT room_id, class_date, expires_at, consumed_at
FROM attendance_qr_sessions
WHERE user_id = '<UID>' AND class_date = '<YMD>';
```

二重送信の安全装置の理解（`apps/worker/src/jobs/attendance-job.ts` `claimAttendanceSubmit`）:
- 真実源は `attendance_audit_logs` の `pre_attempt`。これがあれば「attend を試みた」= 再試行しても `possible_prior_submit` で**再送しない**（取りこぼしは許容、二重送信は絶対回避）。
- `attendance_logs.status=success` があれば `already_submitted` で再送しない。
- ゆえに `failed` を見ても**手で再 enqueue しない**。再送が必要か判断する前に CIT 画面で実際の出席状態を確認する。

---

## 7. チェックリスト（各段で必須）

- [ ] 対象教室の CIT_Wi-Fi 圏内にいる
- [ ] 対象は実授業の曜日・時限、送信ウィンドウ（開始 7〜3 分前）内
- [ ] `attendanceSettings.mode` が段に合致（confirm 段=confirm / auto 段=auto）
- [ ] `encryptedCitCreds` が登録済み
- [ ] auto 段は有効な QR セッション（`expiresAt>now`, `roomId=timetable.room`）あり
- [ ] env を変えたら `docker compose up -d worker` で再起動し `printenv` で反映確認
- [ ] worker ログと監査クエリの両方を tail している
- [ ] 緊急 rollback コマンドを手元に開いてある（`ATTENDANCE_AUTO_EXECUTION_ENABLED=false` + worker 再起動）
- [ ] 前段の合格証跡（成功 / dry_run の DB 行）が取れている
