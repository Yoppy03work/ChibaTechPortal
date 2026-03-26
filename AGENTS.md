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
- **復号後の即時破棄**: 認証情報は使用後すぐにメモリから破棄。変数への保持を最小限に
- **認証情報のログ出力禁止**: パスワード・セッショントークン・Cookieは絶対にログ・エラーメッセージに含めない
- **JWT短寿命**: アクセストークン15分、Refresh TokenはHttpOnly Cookie
- **入力バリデーション**: 全てのAPIエンドポイントでZodスキーマによるバリデーション必須
- **セキュリティヘッダー**: CSP, HSTS, X-Frame-Options, X-Content-Type-Options を必ず設定
- **レートリミット**: スクレイピングはユーザーあたり15分に1回。API全般にレートリミット適用
- **スクレイピング結果のサニタイズ**: 外部HTMLから取得したデータは必ずサニタイズしてからDBに保存・表示

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
| 不正出席 | キャンパス在圏確認必須、出席ログ監査 |

---

## External Dependencies

| サービス | 用途 |
|---------|------|
| CIT Portal (UPRX) | JSFベース。HTTPアダプタ（ViewState管理）で取得 |
| manaba | シンプルPOSTログイン。HTTPアダプタで取得 |
| 出席システム | CIT_Wi-Fi必須。方式Aの教室QR → Web出席を自動化 |

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
