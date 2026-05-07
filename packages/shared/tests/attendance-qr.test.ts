/**
 * 出席システム QR URL のパース テスト
 *
 * WHY: confirm モードの最初のセキュリティ境界 (untrusted 入力 → 構造化データ)
 * を固定する。受け入れ規則を 1 つでも甘くすると攻撃者が偽 QR で別ドメインへ
 * 誘導できる経路ができるため、悪意ケースを丁寧に拒否する。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAttendanceQrUrl } from '../src/lib/attendance-qr';

describe('parseAttendanceQrUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('CIT ドメインの正しい URL から roomId を抽出する', () => {
    const result = parseAttendanceQrUrl(
      'https://attendance.example.cit.ac.jp/attendance/class_room/8109'
    );
    expect(result).toEqual({ ok: true, roomId: '8109' });
  });

  it('it-chiba.ac.jp ドメインも許可する', () => {
    const result = parseAttendanceQrUrl(
      'https://attendance.it-chiba.ac.jp/attendance/class_room/A-101'
    );
    expect(result).toEqual({ ok: true, roomId: 'A-101' });
  });

  it('http (TLS なし) は拒否する', () => {
    // WHY: 校内 Wi-Fi であっても http は MITM で改竄され得る
    const result = parseAttendanceQrUrl(
      'http://attendance.example.cit.ac.jp/attendance/class_room/8109'
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported_protocol' });
  });

  it('javascript: スキームを拒否する', () => {
    // WHY: QR に javascript: が埋まっていても、URL コンストラクタは parse はするので
    // protocol 判定で弾く必要がある
    const result = parseAttendanceQrUrl('javascript:alert(1)//');
    // URL コンストラクタが受理するスキームでも protocol が https でないので弾かれる
    expect(result.ok).toBe(false);
  });

  it('CIT 以外のホストを拒否する', () => {
    const result = parseAttendanceQrUrl(
      'https://attendance.evil.example.com/attendance/class_room/8109'
    );
    expect(result).toEqual({ ok: false, reason: 'host_not_allowed' });
  });

  it('cit.ac.jp.evil.com のような尾尻偽装を拒否する', () => {
    // WHY: endsWith('.cit.ac.jp') は厳密に '.cit.ac.jp' で終わる必要がある。
    // 'evil.com' はこの suffix で終わらないので拒否される
    const result = parseAttendanceQrUrl(
      'https://attendance.cit.ac.jp.evil.com/attendance/class_room/8109'
    );
    expect(result).toEqual({ ok: false, reason: 'host_not_allowed' });
  });

  it('unknown パスを拒否する', () => {
    const result = parseAttendanceQrUrl(
      'https://attendance.example.cit.ac.jp/admin/class_room/8109'
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported_path' });
  });

  it('path segment 数が違うと拒否する', () => {
    const result = parseAttendanceQrUrl(
      'https://attendance.example.cit.ac.jp/attendance/class_room/8109/extra'
    );
    expect(result).toEqual({ ok: false, reason: 'unsupported_path' });
  });

  it('roomId に不正な文字 (空白) が含まれると拒否する', () => {
    const result = parseAttendanceQrUrl(
      'https://attendance.example.cit.ac.jp/attendance/class_room/8109 ext'
    );
    // URL は %20 でエンコードされてもパスに含まれる。decode 後 / 受信値で
    // どちらにせよ regex 不一致となり拒否される
    expect(result.ok).toBe(false);
  });

  it('roomId が空だと拒否する', () => {
    const result = parseAttendanceQrUrl(
      'https://attendance.example.cit.ac.jp/attendance/class_room/'
    );
    // 末尾スラッシュは split で除外されるため segment 数が 2 になり unsupported_path
    expect(result.ok).toBe(false);
  });

  it('URL として不正な文字列を拒否する', () => {
    expect(parseAttendanceQrUrl('not-a-url').ok).toBe(false);
    expect(parseAttendanceQrUrl('').ok).toBe(false);
  });

  it('reason は文字列コードのみで raw 入力を含まない', () => {
    // WHY: ログ出力時に raw QR 内容が漏れないことを保証する
    const result = parseAttendanceQrUrl('https://evil.example.com/attendance/class_room/8109');
    if (result.ok) {
      throw new Error('expected ok=false');
    }
    expect(result.reason).toBe('host_not_allowed');
    // reason には URL の一部も含まれない
    expect(JSON.stringify(result)).not.toContain('evil.example.com');
  });

  it('ATTENDANCE_QR_ALLOWED_HOST_SUFFIXES 環境変数で追加ホストを許可できる', () => {
    // WHY: テスト / 本番ホストの差し替え用
    vi.stubEnv('ATTENDANCE_QR_ALLOWED_HOST_SUFFIXES', '.local.test');
    const result = parseAttendanceQrUrl(
      'https://attendance.local.test/attendance/class_room/8109'
    );
    expect(result).toEqual({ ok: true, roomId: '8109' });
  });
});
