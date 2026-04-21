/**
 * 信頼できるクライアントIP抽出
 *
 * WHY: x-forwarded-for の左端はクライアントが自由に偽装できる。
 * 逆プロキシが付与するのは右端なので、信頼するプロキシ数に応じて
 * 右端から N 番目を取ることで偽装を無視する。
 *
 * x-real-ip は扱わない:
 *   任意のクライアントが送れるヘッダであり、信頼できるプロキシからのみ設定される保証がない。
 *   trusted proxy の仕組み（middleware で x-forwarded-for のみ再構築する等）が
 *   整ってから、もしくは将来 CF-Connecting-IP 等の CDN 固有ヘッダを別途扱う。
 */

/**
 * リクエストから信頼できるクライアントIPを抽出する
 *
 * WHY: null を返す場合は IP が特定できないことを意味する。
 * 呼び出し側は null の場合に IP ベースのレートリミットをスキップすべき。
 * 'unknown' 等の共有キーを使うと、プロキシ障害時に全ユーザーが
 * 同一バケットでレートリミットされログイン不能になる運用リスクがある。
 */
export function getClientIp(headers: Headers): string | null {
  const xForwardedFor = headers.get('x-forwarded-for');
  if (!xForwardedFor) {
    return null;
  }

  const ips = xForwardedFor.split(',').map((ip) => ip.trim()).filter(Boolean);

  if (ips.length === 0) {
    return null;
  }

  const trustedProxyCount = parseInt(
    process.env.TRUSTED_PROXY_COUNT ?? '1',
    10
  );

  // WHY: 右端から trustedProxyCount 番目がクライアント IP
  const index = ips.length - 1 - trustedProxyCount;

  if (index < 0) {
    return ips[0];
  }

  return ips[index];
}
