/**
 * 信頼できるクライアントIP抽出
 *
 * セキュリティ設計:
 *   x-forwarded-for / x-real-ip どちらもクライアントが自由に偽装できる。
 *   信頼できるリバースプロキシ経由でのみアプリに到達する構成 *かつ* プロキシが
 *   x-forwarded-for を正しく付け替える運用になっている場合に限って IP を信頼できる。
 *
 *   現状このコードベースには、直接到達できる配置と proxy 配下の配置を区別する
 *   仕組みがない。そのため **デフォルトでは x-forwarded-for を読まない** 方針にし、
 *   TRUST_X_FORWARDED_FOR=true を明示指定した場合のみ IP 抽出を有効化する。
 *   opt-in されていない時は null を返し、IP ベースのレートリミットをスキップさせる
 *   （sid ベースのレートリミットは維持されるため、アカウント単位のブルートフォース
 *   対策は機能する）。
 */

function getTrustedProxyCount(): number {
  const raw = (process.env.TRUSTED_PROXY_COUNT ?? '1').trim();
  // WHY: 非負整数のみ許可。NaN や負数/小数で静かに無効化されると IP 制限が
  // スキップされるため、壊れた値は起動時に fail-fast にする（セキュリティ設定）。
  if (!/^\d+$/.test(raw)) {
    throw new Error(
      `TRUSTED_PROXY_COUNT must be a non-negative integer, got: ${JSON.stringify(process.env.TRUSTED_PROXY_COUNT)}`
    );
  }
  return parseInt(raw, 10);
}

/**
 * リクエストから信頼できるクライアントIPを抽出する
 *
 * WHY: null を返す場合は IP が特定できないことを意味する。
 * 呼び出し側は null の場合に IP ベースのレートリミットをスキップすべき。
 * 'unknown' 等の共有キーを使うと、プロキシ障害時に全ユーザーが
 * 同一バケットでレートリミットされログイン不能になる運用リスクがある。
 */
export function getClientIp(headers: Headers): string | null {
  // WHY: opt-in チェック。未設定なら x-forwarded-for を一切読まない。
  // TRUSTED_PROXY_COUNT の検証はここを通過してから（未使用環境で不要な起動失敗を避ける）
  if (process.env.TRUST_X_FORWARDED_FOR !== 'true') {
    return null;
  }

  const xForwardedFor = headers.get('x-forwarded-for');
  if (!xForwardedFor) {
    return null;
  }

  const ips = xForwardedFor.split(',').map((ip) => ip.trim()).filter(Boolean);

  if (ips.length === 0) {
    return null;
  }

  const trustedProxyCount = getTrustedProxyCount();

  // WHY: 右端から trustedProxyCount 番目がクライアント IP
  const index = ips.length - 1 - trustedProxyCount;

  if (index < 0) {
    return ips[0];
  }

  return ips[index];
}
