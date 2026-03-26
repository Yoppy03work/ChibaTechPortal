/**
 * 信頼できるクライアントIP抽出
 *
 * WHY: x-forwarded-forの左端（最初の値）はクライアントが自由に偽装できる。
 * リバースプロキシが付与するのは右端なので、信頼するプロキシ数に応じて
 * 右端からN番目を取ることで偽装を無視する。
 *
 * 例: x-forwarded-for: <spoofed>, <real-client>, <proxy1>
 *   TRUSTED_PROXY_COUNT=1 → <real-client> を返す
 *   TRUSTED_PROXY_COUNT=0 → <proxy1> を返す（プロキシなし前提）
 */

/**
 * リクエストから信頼できるクライアントIPを抽出する
 *
 * WHY: nullを返す場合はIPが特定できないことを意味する。
 * 呼び出し側はnullの場合にIPベースのレートリミットをスキップすべき。
 * 'unknown'等の共有キーを使うと、プロキシ障害時に全ユーザーが
 * 同一バケットでレートリミットされログイン不能になる運用リスクがある。
 *
 * @param headers - リクエストヘッダー（Request.headers or Headers）
 * @returns クライアントIP文字列。取得できない場合は null
 */
export function getClientIp(headers: Headers): string | null {
  // WHY: 複数のヘッダーをフォールバックで試す（CDN/プロキシ環境に対応）
  const xRealIp = headers.get('x-real-ip')?.trim();
  if (xRealIp) {
    return xRealIp;
  }

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

  // WHY: 右端からtrustedProxyCount番目がクライアントIP
  // 右端はプロキシ自身、その左がクライアント
  const index = ips.length - 1 - trustedProxyCount;

  if (index < 0) {
    // プロキシ数がIPリストより多い場合は最も左のIPを使用
    return ips[0];
  }

  return ips[index];
}
