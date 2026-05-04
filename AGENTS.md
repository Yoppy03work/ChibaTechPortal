# AGENTS.md

このファイルはAIエージェントがこのリポジトリで作業する際のガイドラインです。

---

## 絶対に守るルール

### アーキテクチャ

- **2プロセス分離アーキテクチャ**: Web（Next.js）とWorker（BullMQ）を別プロセスで稼働
- **モノレポ構成（Turborepo）**: `apps/web`, `apps/worker`, `packages/shared`, `packages/db`, `packages/email-templates`
- **Server / Client 分離**: データフェッチは Server Component、インタラクションは `"use client"`
- **型安全**: `any` 禁止。外部データは必ず Zod でバリデーション
- **アダプタパターン**: スクレイピングは `ScraperAdapter` インターフェース経由。HTTP → Playwright の順で試行

### セキュリティ（最優先事項）

- **認証情報暗号化**: ユーザーのCIT Portal/manaba認証情報は AES-256-GCM で暗号化してDB保存。復号キーは環境変数で管理（DBとは別管理）
- **認証情報の保持期間最小化**: 認証情報は使用後すぐに変数をクリアし、保持期間を最小化する。ログ・例外・ジョブ結果には絶対に含めない。なおNode.js/JSのGC特性上、完全なメモリ消去は保証できない点に留意
- **認証情報のログ出力禁止**: パスワード・セッショントークン・Cookieは絶対にログ・エラーメッセージに含めない
- **JWT短寿命**: アクセストークン15分、Refresh TokenはHttpOnly Cookie
- **入力バリデーション**: 全てのAPIエンドポイントでZodスキーマによるバリデーション必須
- **セキュリティヘッダー**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options を必ず設定
- **レートリミット**: Redis Fixed Window Counterで分散環境対応。スクレイピング・ログイン試行など重要な操作はSliding WindowまたはToken Bucketも検討。API全般にレートリミット適用
- **スクレイピング結果のサニタイズ**: 外部HTMLはDOMPurify（isomorphic-dompurify）でサニタイズ。DBにはなるべく構造化データ（タイトル・本文テキスト・URL・日時）として保存し、HTMLの保存・表示は最小限にする。表示時にdangerouslySetInnerHTMLを使う場合は許可タグ/属性を最小化
- **IP抽出**: trusted proxy経由のリクエストのみx-forwarded-forを採用。IPが取得できない場合はIPベースのレートリミットをスキップ（共有バケット問題を回避）

### コード品質

- **DRY原則**: 同一ロジックの重複禁止。`packages/shared` に共通化
- **ファイル分割**: 1ファイル300行超は機能別に分割
- **class許可範囲**: アダプタパターン実装（HttpAdapter, PlaywrightAdapter）とError継承のみ許可
- **コメントのルール**:
  - WHY を書く（なぜこの実装か）
  - セキュリティ上の理由がある箇所は必ずコメントで理由を明記
  - 余計なコメントは書かない

### 開発環境

- **テスト・lint・型チェックは必ず Docker 内で実行**
- **禁止**: ホスト側で直接 `npm run test` / `npm run lint` を実行すること（初期開発フェーズを除く）
- **環境変数**: `.env` ファイルは `.gitignore` に必ず含める。`.env.example` をテンプレートとして管理

### Git

- **main / develop への直接コミット・プッシュ禁止**: 新しい作業や初回プッシュ時は必ずフィーチャーブランチを切ってからプッシュする。例外なし
- **ブランチ運用**: `develop` から機能ブランチを切り、作業完了後にPR経由で `develop` にマージ。`develop` → `main` はリリース時のみ
- ブランチ命名規則: `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `security/` など
- コミットメッセージは Conventional Commits 形式
- セキュリティ関連の変更は `security/` プレフィックスを使用
- **コミット粒度**: 1コミット = 1つの論理的変更。巨大なコミットを避け、レビューしやすい単位で分ける
- **プッシュ前の確認**: プッシュ先のブランチ名が正しいか必ず確認する（main/developへの誤プッシュ防止）
- **マージ後のブランチ削除**: PRマージ後、リモートブランチは自動削除される。ローカルブランチも不要になったら `git branch -d` で整理する

### Claude Code 自動運用ガード

- **運用モード**: Claude Code は制限付き自動運用とする。feature branch 上の実装・テスト・lint・型チェックのみ自動実行可
- **禁止操作**: main/develop への push、PR merge、本番環境操作、`.env`/secret の表示、破壊的 git 操作、実外部システム（CIT Portal/manaba/出席システム）へのアクセスを禁止
- **出席 auto 解禁禁止**: QR由来セッション検証・キャンパス在圏確認・重複防止・監査ログ前後記録が全て実装されるまで、Claude Code は出席 auto 送信を有効化してはならない
- **外部アクセスの扱い**: CIT Portal/manaba/出席システムはテストでは必ずモック。実測が必要な場合は人間が明示承認した別手順で実施する
- **セキュリティ変更**: `security/` または `fix/` ブランチで行い、Docker 内の security test / type-check / lint を通す

### テスト

- **TDD推奨**: 実装前に失敗するテストを書く
- バグ修正・新機能・リファクタリング全てにテストを書いてから完了とする
- **セキュリティテストは必須**: 暗号化・認証・バリデーション・レートリミットのテストを省略しない
- コンポーネントのprops・インターフェース変更時は、対応するテストも同じコミットで更新

---

## TDD ワークフロー

1. **赤フェーズ**: 失敗するテストを書く
2. **テスト実行**: テストが落ちることを確認
3. **緑フェーズ**: テストを通す最小限の実装を行う
4. **テスト成功確認**: テストが通ることを確認
5. **リファクタリング**: コードを整理・改善

### テスト作成のルール

- テストデータはテスト関数内に直接記述（`fixtures` は副作用のないデータのみ許可）
- 外部システム（CIT Portal, manaba, 出席システム）へのアクセスは必ずモック
- Redis・PostgreSQLは結合テスト時のみ実接続。単体テストではモック許可

### 要件・仕様分析のベストプラクティス

最初の理解が間違っている可能性を常に念頭に置き、必ず一次情報で検証する。

**情報の優先順位**: 実装コード > 設計書 > 仕様書

矛盾がある場合は自己判断で解決せず、必ずユーザーに提示して判断を仰ぐ。

---

## Commands

### 開発時（初期フェーズ: ローカル実行）

```bash
# テスト実行
npx vitest run                              # 全テスト
npx vitest run tests/security/              # セキュリティテストのみ
npx vitest run tests/security/encryption.test.ts  # 個別テスト
npx vitest --watch                          # ウォッチモード

# 型チェック
npx tsc --noEmit

# lint
npx eslint .
```

### Docker Commands（本格開発フェーズ）

```bash
# 開発環境起動（4コンテナ: Web + Worker + PostgreSQL + Redis）
docker compose up -d

# コード品質チェック
docker compose exec web npm run lint
docker compose exec web npm run type-check

# テスト
docker compose exec web npm run test              # Vitest
docker compose exec web npm run test -- --run     # CI向け（watch無効）
docker compose exec web npm run test:e2e          # Playwright E2E

# Turborepo
turbo dev                    # Web + Worker 同時起動
turbo build                  # 依存順ビルド
turbo test                   # 全パッケージテスト
```

---

## Architecture

### 概要

千葉工業大学の学内システム統合PWA。2プロセス分離アーキテクチャ:
- **Webサーバー (Next.js 16)**: SSR + API Routes (BFF) + Edge Middleware認証
- **Workerサービス (Node.js)**: BullMQスケジューラ + スクレイピング + 通知送信

### モノレポ構成

```
chibatech-portal/
├── apps/
│   ├── web/                    # Next.js (Webサーバー + PWA)
│   │   ├── app/                # App Router
│   │   │   ├── (auth)/         # 認証不要ページ
│   │   │   ├── (dashboard)/    # 認証必須ページ
│   │   │   └── api/            # API Routes (BFF)
│   │   ├── components/         # UIコンポーネント
│   │   ├── lib/                # ユーティリティ
│   │   └── middleware.ts       # エッジ認証
│   └── worker/                 # Workerサービス
│       ├── jobs/               # BullMQジョブ定義
│       ├── scrapers/           # スクレイピング実装
│       │   ├── adapters/       # HTTP / Playwright アダプタ
│       │   ├── cit-portal.ts
│       │   └── manaba.ts
│       └── services/           # 通知・出席ロジック
├── packages/
│   ├── shared/                 # 共有型定義・Zodスキーマ
│   ├── db/                     # Prismaスキーマ + クライアント
│   └── email-templates/        # React Emailテンプレート
├── tests/
│   └── security/               # セキュリティテスト
├── docker-compose.yml
└── turbo.json
```

### 技術スタック

| 用途 | 技術 |
|------|------|
| フロントエンド + BFF | Next.js 16 (App Router) |
| UI | React 19 + TypeScript 6 + Tailwind CSS v4 + shadcn/ui v4 |
| PWA | Serwist 9 |
| Worker | Node.js 24 LTS + BullMQ 5 |
| スクレイピング | アダプタパターン（fetch+cheerio / Playwright 1.58） |
| DB | PostgreSQL 18 + Prisma 7 |
| キャッシュ/キュー | Redis 8 + BullMQ 5 |
| 認証 | Auth.js v5 (Credentials Provider + JWT) |
| バリデーション | Zod 4 |
| Push通知 | Web Push API (VAPID) + web-push |
| メール | Resend 6 + React Email |
| モノレポ | Turborepo 2 |
| デプロイ | Docker 29 + VPS |

### セキュリティアーキテクチャ

| 脅威 | 対策 |
|------|------|
| 認証情報漏洩 | AES-256-GCM暗号化、マスターキー環境変数分離 |
| 通信盗聴 | HTTPS/TLS 1.3、HSTS |
| セッションハイジャック | JWT 15分 + Refresh Token (HttpOnly Cookie) |
| スクレイピング乱用 | レートリミット（15分/回/ユーザー） |
| XSS / CSRF | CSP、CSRF Token、入力サニタイズ |
| 不正出席 | 出席登録支援（3モード）、キャンパス在圏確認必須、監査ログ |

### 出席登録支援（3モード設計）

外向きには「出席登録支援」と表現する。内部機能として3つのモードを持つ。

| モード | 動作 | デフォルト |
|--------|------|-----------|
| `manual` | QR読み取り補助 + 出席ページへの遷移補助 + 入力補助。最終送信はユーザー操作 | - |
| `confirm` | 条件確認（CIT_Wi-Fi・時刻・授業一致）→ プレビュー → ユーザー確認で送信 | **初期値** |
| `auto` | 全条件を満たす場合のみWorkerが自動送信。ユーザーが明示的にON。監査ログ必須 | 無効 |

**自動モードの実行条件（全て必須）:**
- ユーザーが自動モードを明示的にONにしている
- 対象授業と時刻が一致している
- QRコード由来のセッション/トークンが有効
- CIT_Wi-Fi接続等のキャンパス在圏条件を満たしている
- 同一授業に対して重複送信していない
- 送信前後の監査ログを残す

### BullMQジョブ設計方針

- **冪等性**: jobIdでユーザー単位・サービス単位の重複投入を防ぐ
- **DB重複防止**: スクレイピング結果のexternalIdでunique keyを保証（既存のdiff-engine）
- **失敗時**: retry（exponential backoff）。外部サイト障害時はcircuit breaker的に抑制
- **通知の二重送信防止**: 通知済みフラグまたはjobId単位で保証

---

## External Dependencies

| サービス | 用途 |
|---------|------|
| CIT Portal (UPRX) | JSFベース。HTTPアダプタ（ViewState管理）で取得 |
| manaba | シンプルPOSTログイン。HTTPアダプタで取得 |
| 出席システム | CIT_Wi-Fi必須。方式Aの教室QR → Web出席登録支援（3モード） |

### スクレイピング実測結果（2026-03-21）

- **CIT Portal**: HTTP可能（JSF ViewState管理が必要）。SSOではなくフォームPOSTで実装
- **manaba**: HTTP可能（高確度）。fetch + cheerioで十分
- **出席システム**: 3/23にCIT_Wi-Fiでテスト予定

---

## Testing

### セキュリティテスト（最重要）

```bash
# セキュリティテスト全実行
npx vitest run tests/security/

# 個別実行
npx vitest run tests/security/encryption.test.ts
npx vitest run tests/security/auth-session.test.ts
npx vitest run tests/security/input-validation.test.ts
npx vitest run tests/security/api-security.test.ts
npx vitest run tests/security/scraper-security.test.ts
npx vitest run tests/security/credential-storage.test.ts
```

### テストカテゴリ

| カテゴリ | 対象 | ツール |
|---------|------|--------|
| セキュリティ | 暗号化・認証・バリデーション・レートリミット | Vitest |
| 単体 | コンポーネント・ユーティリティ | Vitest + RTL |
| 結合 | スクレイパー → DB → 通知 → UI | Vitest |
| E2E | ログイン → ダッシュボード → 出席 | Playwright |

### 外部サービスのモック

CIT Portal・manaba・出席システムへの実際のアクセスは必ずモックする。

```typescript
import { vi } from 'vitest'

// スクレイパーのモック例
vi.mock('@/scrapers/adapters/http-adapter', () => ({
  HttpAdapter: vi.fn().mockImplementation(() => ({
    login: vi.fn().mockResolvedValue({ sessionId: 'mock-session' }),
    fetchNotifications: vi.fn().mockResolvedValue([]),
  })),
}))
```

---

## 出席auto解禁条件

auto送信はまだ禁止。許可してよいのは、次をすべて満たした後だけ。

1. **confirmモードが完成している**
   - QR読み取り
   - 対象授業判定
   - 出席ページ/送信内容プレビュー
   - ユーザー確認後だけ送信

2. **autoの6条件ガードが実装済み**
   - ユーザーが明示的にauto ON
   - 授業曜日・時限・教室が一致
   - QR由来セッション/トークンが有効
   - CIT Wi-Fiなどキャンパス在圏条件OK
   - 同一授業・同日の成功ログがない
   - 送信前後の監査ログが残る

3. **Worker側でも強制ガード**
   - SchedulerやAPIではなく、最終実行地点のWorkerで止める
   - BullMQに直接ジョブを入れられても条件不足なら送信しない

4. **テスト必須**
   - 条件が1つでも欠けたら `adapter.attend()` が呼ばれない
   - 重複送信できない
   - 外部システムは全部モック
   - 監査ログが送信前・送信後に残る

5. **実地検証は人間が限定実行**
   - CIT Wi-Fi環境
   - 自分のアカウント
   - 1授業またはテスト可能なタイミングだけ
   - ログにパスワード/Cookieが出ないことを確認

### 解禁順序

`manual → confirm → auto dry-run → auto allowlist 1ユーザーだけ → auto 本番ON`

### 今やってよいこと

- confirmモード実装
- auto dry-run実装
- ガード・監査ログ・テスト追加

### 今やってはいけないこと

- autoで実際に出席送信する処理を有効化すること
- 外部システムへ実アクセスすること

---

## QR読み取りライブラリ採用方針

confirmモードのQR読み取りには `@zxing/browser` を採用する（GitHub上の最新版 0.1.5、Snyk上で直接の脆弱性なし。最終確認は導入PRで `npm audit` を実施）。

### 採用条件（導入PRで全て満たすこと）

- **client component 内だけで使う**: Server Component から import しない
- **CDNではなくnpm依存として追加**: `package.json` に明示。CDN script タグ禁止
- **外部通信しない**: ライブラリ内部の telemetry / fetch を使わない設定で利用
- **カメラ権限の失敗時に手動入力/再試行導線を用意**: `getUserMedia` 拒否時のフォールバックUI必須
- **MediaDevices / QR decode はテストでモック**: 実カメラを叩くテスト禁止
- **QR内容は必ずZodで検証**: decode 結果は untrusted 入力として扱う
- **QR URL/token/sessionをログに出さない**: `console.log` / 例外メッセージ / 通知 payload に含めない

