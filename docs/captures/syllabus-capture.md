# シラバス HTML 採取仕様 (UNIPA / Kmh006 系)

> 目的: `apps/worker/src/scrapers/syllabus-parser.ts` の SCAFFOLD を実構造へ確定させるための
> 「実 HTML サンプル」を採取する手順。timetable-parser を作ったときと同じ流儀
> (実 HTML を採取 → パーサのセレクタ/ラベル対応を確定 → テスト fixture を実断片へ更新) で進める。
>
> 重要 (ルール厳守): このリポジトリ内の Claude/サブエージェントは CIT Portal / manaba / 出席システムへ
> **絶対にアクセスしない**。下記はあなた (人間) がブラウザで手動採取するための手順であり、
> 自動化スクリプトでアクセスするものではない。シラバス検索 (Kmh006) は**ゲストログインで認証不要**。

## 対象ページ

| ステップ | ページ | URL (BASE = `https://portal.it-chiba.ac.jp/uprx`) | 認証 |
| --- | --- | --- | --- |
| 1 | シラバス検索フォーム | `${BASE}/up/km/kmh006/Kmh00601.xhtml?guestlogin=Kmh006` | 不要 (ゲスト) |
| 2 | シラバス検索結果一覧 | 同上 URL に検索条件を POST した後の描画 | 不要 |
| 3 | シラバス詳細 | 結果からリンク/行クリックで遷移した詳細ページ | 不要 |

> URL は `apps/worker/src/scrapers/syllabus-scraper.ts` の `SYLLABUS_URL` と一致
> (`Kmh00601.xhtml?guestlogin=Kmh006`)。詳細ページの xhtml 名 (Kmh00604 等) は採取して確定する。

## 採取手順 (ブラウザ DevTools)

すべて **DevTools の Elements パネルで描画後の DOM** をコピーする (View Source の生 HTML ではなく、
JSF が描画した状態が欲しい)。`<html>` ルートで右クリック → **Copy → Copy outerHTML**。

### サンプル A: 検索フォーム (ステップ 1)

1. ゲスト URL (上表ステップ1) を開く。
2. ページ全体の outerHTML を `.tmp/syllabus-search-form.html` に保存。
3. **同時にフォーム情報を採取** (下記「フォーム/JSF パラメータの採取」)。

### サンプル B: 検索結果一覧 (ステップ 2) — パーサ `parseSyllabusListHtml` 用

1. ステップ1のフォームで、確実に複数件ヒットする条件を入力して検索。
   - 推奨: 自分の履修科目名の一部 (例: 時間割で確認済みの「キャリアデザイン」等)。
   - 1件しかヒットしない条件は避ける (列構造の確認のため複数行が欲しい)。
2. 結果テーブルが描画されたら、**結果テーブルを含む領域**の outerHTML を
   `.tmp/syllabus-list.html` に保存。ページ全体でも可だが、最低限
   結果 `table` 要素 (とその `thead`/`tbody`) が含まれること。
3. このとき DevTools の Network タブで、検索ボタン押下時の **POST リクエスト**を 1 本選び
   「フォーム/JSF パラメータの採取」を行う。

### サンプル C: シラバス詳細 (ステップ 3) — パーサ `parseSyllabusDetailHtml` 用

1. 一覧から 1 件をクリックして詳細ページを開く。
2. 詳細本文 (項目名 + 値が並ぶ領域) を含む outerHTML を `.tmp/syllabus-detail.html` に保存。
   - 「到達目標 / 授業計画 / 成績評価 / 教科書」など**長文セクションが必ず含まれる**こと
     (これらが `schedule` / `objectives` / `evaluation` / `textbooks` にマップされる)。
3. 詳細ページの **URL (xhtml 名)** をメモ。一覧→詳細が POST 遷移なら、その POST も採取 (下記)。

> いずれも個人の認証情報は含まれない (ゲスト)。万一 cookie / ログイン ID 等が DOM 文字列や
> Network に映り込む場合は伏せ字にしてから貼ること。

## フォーム/JSF パラメータの採取 (最重要)

timetable と同様、UNIPA は JSF で `javax.faces.ViewState` 必須・パラメータ名がフォーム構造依存。
スクレイパー側 (fetch) を確定するため、**検索 POST と詳細遷移 POST の中身**が必要。

採取方法 (DevTools → Network → 対象 POST → "Payload" / "Request" を Copy):

- 検索 POST について、以下を `.tmp/syllabus-search-post.txt` に貼る:
  - リクエスト URL (action)
  - `Content-Type` (通常 `application/x-www-form-urlencoded`)
  - **Form Data 全キー=値** (特に下記)
    - `javax.faces.ViewState`
    - フォーム名キー (timetable では `loginForm` のような `<form>` の name)
    - 検索条件フィールド名 (科目名/年度/学期/開講学科 等の `name` 属性) と入力値
    - 検索ボタンの name (`javax.faces.source` / PrimeFaces なら `javax.faces.partial.ajax=true` 等の有無)
- 詳細遷移について `.tmp/syllabus-detail-post.txt` に同様に貼る:
  - 一覧→詳細がリンク (GET) か、行クリック (Ajax POST) か。
  - POST の場合: `javax.faces.source` (行を指す ID)、`javax.faces.partial.ajax`、ViewState、行キー (`*_rowKey` / `data-rk`)。
  - GET リンクの場合: その `href` を 1 件分そのまま記載 (パラメータ構造が分かる)。

> 代替 (DevTools が難しい場合): フォーム HTML だけでも、`<form>` と全 `<input name=...>` /
> `<select name=...>` / ボタンの name が `.tmp/syllabus-search-form.html` に含まれていれば
> パラメータ名は読み取れる。ただし「どの値で送られたか」は Network 採取が確実。

## まとめ: 採取して貼ってほしいファイル

`.tmp/` 配下に以下を作成し、中身をそのまま共有してください (リポジトリにはコミットしない一時置き場)。

| ファイル | 内容 | 用途 |
| --- | --- | --- |
| `.tmp/syllabus-search-form.html` | 検索フォームの outerHTML | フォーム/入力 name 確定 |
| `.tmp/syllabus-list.html` | 検索結果テーブルを含む outerHTML | `parseSyllabusListHtml` のセレクタ/列順/detailKey 確定 |
| `.tmp/syllabus-detail.html` | 詳細ページの outerHTML (長文欄含む) | `parseSyllabusDetailHtml` のラベル対応確定 |
| `.tmp/syllabus-search-post.txt` | 検索 POST の URL + Form Data 全キー | fetch 側 (検索) の JSF パラメータ確定 |
| `.tmp/syllabus-detail-post.txt` | 詳細遷移の GET href または POST Payload | fetch 側 (詳細遷移) の確定 |

## 採取後に確定する箇所 (パーサ scaffold 側)

`apps/worker/src/scrapers/syllabus-parser.ts` の以下を実構造へ差し替える:

- `parseSyllabusListHtml`: 結果テーブルセレクタ (`table[id*="srchResult"]` 等は想定値) /
  列の並び (科目名/担当/学科/学期) / `detailKey` (href か data-rk か)。
- `parseSyllabusDetailHtml`: 行コンテナ (`<tr><th>/<td>` か `<dl><dt>/<dd>`) /
  `DETAIL_LABEL_MAP` のラベル文言 (現状は仮の日本語ラベル)。
- テスト `apps/worker/tests/scrapers/syllabus-parser.test.ts` の `FIXTURE` を、
  採取した HTML から最小断片を抜き出して置き換える (AGENTS.md: テストデータはテスト関数内に直接記述)。

採取が揃ったら、`syllabus-parser.ts` のセレクタ確定 → fetch 側 (既存 `syllabus-scraper.ts` を
parse/fetch 分離へリファクタ) → Syllabus モデルへ upsert、の順で実装を進める。
