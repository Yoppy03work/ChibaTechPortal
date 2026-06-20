## Runbook: CIT Portal 時間割 live 検証 (`scripts/verify-cit-timetable.ts`)

### 目的
`apps/worker/src/scrapers/adapters/cit-portal-http.ts` の `login → fetchTimetable → parseTimetableHtml` が、実 CIT Portal に対し **直接 GET だけで時間割を描画できるか** を1コマンドで判定する。0 コマ/未描画なら「JSF ナビ追加が必要」と終了コードで示す。

### 前提
- **CIT_Wi-Fi (学内ネットワーク) または到達可能な経路** に接続していること。学外からは到達できない/挙動が変わる可能性がある。
- 実 creds (学籍番号・パスワード) を保有していること。
- リポジトリルートに `tsx` がある (`node_modules/.bin/tsx` 確認済み)。`@chibatech/shared` と worker ソースは tsx が直接解決する (ビルド不要)。
- これは外部システムへ実アクセスするツール。承認済みの実動確認フェーズでのみ実行する。

### 実行 (1 コマンド)
```bash
# リポジトリルート (/Users/yoppy/with_claude/myapp/ChibaTechPortal) で実行
CIT_PORTAL_USER_ID='B0000000' CIT_PORTAL_PASSWORD='********' \
  npx tsx scripts/verify-cit-timetable.ts
```
セキュリティ: パスワードはコマンド引数ではなく **env** で渡す。実行後はシェル履歴対策 (先頭スペース or `history -c`) を検討。

任意:
```bash
# 別キャンパス/stub を検証
CIT_PORTAL_BASE_URL='http://localhost:8080/uprx' CIT_PORTAL_USER_ID=... CIT_PORTAL_PASSWORD=... npx tsx scripts/verify-cit-timetable.ts

# 未描画時に HTML 先頭をダンプ
VERIFY_DUMP_HTML=1 CIT_PORTAL_USER_ID=... CIT_PORTAL_PASSWORD=... npx tsx scripts/verify-cit-timetable.ts
```

### 出力の読み方
- `(a) ログイン` → `[OK] ログイン成功 (cookies: N 個...)` なら認証成功。`cookies: 0 個` 警告が出たら成功扱いでも未認証を疑う。
- `(b) テーブル検査` → `table.classTable 検出: YES/NO`。`! ログインページに見えます` 警告が出たらセッションが時間割ページまで通っていない。
- `(c) コマ抽出` → `adapter.fetchTimetable(): N コマ` が本番経路の結果。`parseTimetableHtml(raw): M コマ` は参考。N と M がズレたら adapter 経路の異常 (cookie 不整合等) の手がかり。
- `=== 判定 ===`
  - `[PASS] ... JSF ナビ追加は不要` → 直接 GET で OK。`fetchTimetable` は現状のまま実運用可。
  - `[FAIL] ... JSF ナビ... 追加が必要` → 期/年度選択 POST 等の追加実装が要る。

### 終了コードでの判定 (CI/自動化向け)
| code | 意味 |
|---|---|
| 0 | ログイン成功 + classTable あり + コマ>=1 → 直接 GET で描画 OK |
| 2 | ログイン成功 + (テーブル無し or 0 コマ) → **未描画。JSF ナビ追加が必要** |
| 3 | ログイン失敗 (creds 不正 / ViewState 取得失敗 / 到達不可 / env 不足) |
| 1 | 想定外エラー |

```bash
CIT_PORTAL_USER_ID=... CIT_PORTAL_PASSWORD=... npx tsx scripts/verify-cit-timetable.ts; echo "exit=$?"
```

### 副作用の保証
- 書き込み系は **認証に必須のログイン POST のみ**。出席送信・履修変更などのデータ変更なし。
- 時間割取得は GET のみ。ファイル書込み・DB アクセスなし。

### トラブルシュート
- exit 3 で「ViewState not found」: ログインページ構造変更か、到達先が CIT Portal でない (BASE_URL 誤り)。
- exit 2 かつ「ログインページに見えます」: セッション cookie が時間割ページに通っていない。adapter.login の cookie 引継ぎ/セッション確立を先に疑う。
- `Cannot find module '@chibatech/shared'`: リポジトリルートで `npm install` 済みか確認 (workspace シンボリックリンク)。
