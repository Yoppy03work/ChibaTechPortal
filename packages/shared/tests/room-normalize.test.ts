/**
 * 教室名正規化 / 一致判定の単体テスト
 *
 * WHY: normalizeRoom / roomsMatch は将来 confirm/auto guard の room 比較に
 * 差し込む候補だが、誤一致は「別教室/他人の出席を送る」事故に直結する。
 * 全角/半角・suffix あり/なし・空白・null/空・別教室の非一致・同教室の一致を
 * 網羅して、保守的挙動 (確信ある一致のみ true) を固定する。
 *
 * 実フォーマット根拠:
 *   - 時間割側: "７３１講義室" / "オンライン" (timetable-parser.test.ts より)
 *   - QR/confirm 側: '8109' / 'A-101' / '5_3' (attendance-qr.ts roomIdSchema コメント)
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeRoom,
  roomsMatch,
  attendanceRoomMatches,
} from '../src/lib/room-normalize';

describe('normalizeRoom', () => {
  it('全角数字を半角化しコアを抽出する', () => {
    const r = normalizeRoom('７３１');
    expect(r.canonical).toBe('731');
    expect(r.core).toBe('731');
    expect(r.isEmpty).toBe(false);
  });

  it('全角数字 + 種別 suffix ("７３１講義室") をコア "731" に正規化する', () => {
    const r = normalizeRoom('７３１講義室');
    expect(r.canonical).toBe('731');
    expect(r.core).toBe('731');
  });

  it('各種の教室種別 suffix を剥がす', () => {
    expect(normalizeRoom('501演習室').core).toBe('501');
    expect(normalizeRoom('A201実験室').core).toBe('A201');
    expect(normalizeRoom('301実習室').core).toBe('301');
    expect(normalizeRoom('101教室').core).toBe('101');
    expect(normalizeRoom('B105室').core).toBe('B105');
  });

  it('suffix なしの半角コードはそのまま (大文字化のみ)', () => {
    expect(normalizeRoom('8109').core).toBe('8109');
    expect(normalizeRoom('a-101').core).toBe('A-101');
    expect(normalizeRoom('5_3').core).toBe('5_3');
  });

  it('前後・内部の空白 (半角/全角) を除去する', () => {
    expect(normalizeRoom('  731 講義室  ').core).toBe('731');
    expect(normalizeRoom('７３１　講義室').core).toBe('731'); // 全角スペース
    expect(normalizeRoom(' A-101 ').core).toBe('A-101');
  });

  it('全角英字・全角ハイフンを半角化する', () => {
    expect(normalizeRoom('Ａ－１０１').core).toBe('A-101');
  });

  it('日本語のみ ("オンライン") は core=null で canonical を保持する', () => {
    const r = normalizeRoom('オンライン');
    expect(r.core).toBeNull();
    expect(r.canonical).toBe('オンライン');
    expect(r.isEmpty).toBe(false);
  });

  it('null / undefined / 空文字 / 空白のみは isEmpty', () => {
    for (const v of [null, undefined, '', '   ', '　']) {
      const r = normalizeRoom(v as string | null | undefined);
      expect(r.isEmpty).toBe(true);
      expect(r.core).toBeNull();
      expect(r.canonical).toBe('');
    }
  });
});

describe('roomsMatch', () => {
  it('全角時間割表記 と 半角 QR コードが同一教室なら一致する', () => {
    expect(roomsMatch('７３１講義室', '731')).toBe(true);
    expect(roomsMatch('731', '７３１講義室')).toBe(true); // 対称性
  });

  it('suffix あり/なしの差を吸収して一致する', () => {
    expect(roomsMatch('501演習室', '501')).toBe(true);
    expect(roomsMatch('A201実験室', 'a201')).toBe(true); // 大文字小文字も吸収
  });

  it('空白・全角ハイフンの差を吸収して一致する', () => {
    expect(roomsMatch(' A-101 ', 'Ａ－１０１')).toBe(true);
  });

  it('別教室は一致しない', () => {
    expect(roomsMatch('７３１講義室', '732')).toBe(false);
    expect(roomsMatch('501演習室', '502')).toBe(false);
    expect(roomsMatch('A-101', 'A-102')).toBe(false);
    expect(roomsMatch('8109', '8110')).toBe(false);
  });

  it('同一の日本語のみ表記は一致、別表記は不一致', () => {
    expect(roomsMatch('オンライン', 'オンライン')).toBe(true);
    expect(roomsMatch('オンライン', 'リモート')).toBe(false);
  });

  it('片方が日本語のみ (core 無し)、片方が数値コードなら不一致 (保守的)', () => {
    expect(roomsMatch('オンライン', '731')).toBe(false);
    expect(roomsMatch('731', 'オンライン')).toBe(false);
  });

  it('null / 空 が絡む場合は常に不一致 (空 room を一致扱いしない)', () => {
    expect(roomsMatch(null, '731')).toBe(false);
    expect(roomsMatch('731', null)).toBe(false);
    expect(roomsMatch(null, null)).toBe(false);
    expect(roomsMatch('', '')).toBe(false);
    expect(roomsMatch(undefined, '731')).toBe(false);
    expect(roomsMatch('   ', '731')).toBe(false);
  });

  it('prefix / 部分一致は採らない (誤一致防止)', () => {
    // "731" と "7310" を部分一致させない
    expect(roomsMatch('731', '7310')).toBe(false);
    expect(roomsMatch('７３１講義室', '7310')).toBe(false);
  });
});

/**
 * 回帰: 号館式の建物表記で「別教室を同一視する」false match を防ぐ。
 *
 * WHY: 旧実装はコア抽出に「先頭からの英数字 前方一致」を使い、漢字混在表記を
 * 黙って切り詰めていた。'7号館131' と '7号館231' が両方コア '7' になり roomsMatch=true
 * （別教室への出席誤送信）になっていた。修正後は「canonical 全体が ASCII のときのみ
 * コア採用」とし、漢字混在は core=null（canonical 完全一致のみ許容）に倒す。
 * マルチエージェントのアドバーサリアル検証で 3 レンズ一致で検出された high 指摘。
 */
describe('roomsMatch — 号館式建物表記の誤一致回帰', () => {
  it('漢字混在表記はコアを部分抽出せず core=null に倒す', () => {
    expect(normalizeRoom('7号館131').core).toBeNull();
    expect(normalizeRoom('7号館131').canonical).toBe('7号館131');
    expect(normalizeRoom('8号館109').core).toBeNull();
    // suffix "室" を剥がしても "号" が残れば非ASCII → core=null（安全側）
    expect(normalizeRoom('301号室').core).toBeNull();
  });

  it('同一棟の別教室を同一視しない (旧バグ: 両方 core="7")', () => {
    expect(roomsMatch('7号館131', '7号館231')).toBe(false);
    expect(roomsMatch('7号館131', '7')).toBe(false);
    expect(roomsMatch('8', '8号館109')).toBe(false);
  });

  it('同一の漢字混在表記は canonical 完全一致で true', () => {
    expect(roomsMatch('7号館131', '7号館131')).toBe(true);
  });

  it('記号を含む有効な roomId はコアを持ち自己一致する', () => {
    expect(normalizeRoom('_3').core).toBe('_3');
    expect(normalizeRoom('-101').core).toBe('-101');
    expect(roomsMatch('5_3', '5_3')).toBe(true);
  });
});

/**
 * attendanceRoomMatches — CIT 出席システムの教室コード対応規則。
 *
 * 規則 (ユーザー提供): 「3 桁の教室のうち 7 始まりの教室のみ、2 桁目と 3 桁目の間に
 * 0 が挿入される」。UNIPA "731" ⇔ 出席システム QR "7301"。7 始まり以外は変換なし。
 * 実例 https://attendance.is.it-chiba.ac.jp/attendance/class_room/7301 が時間割
 * "７３１講義室" に対応する。
 */
describe('attendanceRoomMatches — CIT 7始まり3桁の0挿入規則', () => {
  it('UNIPA "731講義室" と QR "7301" を一致させる (核心の matched pair)', () => {
    expect(attendanceRoomMatches('７３１講義室', '7301')).toBe(true);
    expect(attendanceRoomMatches('731', '7301')).toBe(true);
    // 時間割側を QR 形式で手入力しても一致 (双方向)
    expect(attendanceRoomMatches('7301', '7301')).toBe(true);
  });

  it('7 始まりの他教室も規則どおり対応する (0 は 2桁目と3桁目の間に挿入)', () => {
    expect(attendanceRoomMatches('701', '7001')).toBe(true); // 70_1 → 7001
    expect(attendanceRoomMatches('712講義室', '7102')).toBe(true); // 71_2 → 7102
    expect(attendanceRoomMatches('799', '7909')).toBe(true); // 79_9 → 7909
    // "7099" は挿入位置 (3文字目) が 0 でない → どの 3 桁教室の QR 形でもない
    expect(attendanceRoomMatches('799', '7099')).toBe(false);
  });

  it('7 始まり以外の 3 桁教室は変換なしで素通し', () => {
    expect(attendanceRoomMatches('431講義室', '431')).toBe(true);
    expect(attendanceRoomMatches('612', '612')).toBe(true);
    expect(attendanceRoomMatches('8109', '8109')).toBe(true);
    // 4 始まりに 0 挿入版を渡しても一致しない (規則は 7 始まりのみ)
    expect(attendanceRoomMatches('431', '4301')).toBe(false);
  });

  it('別教室は一致しない (誤一致防止・畳み込みの衝突なし)', () => {
    expect(attendanceRoomMatches('731', '7302')).toBe(false); // 7301 ではない
    expect(attendanceRoomMatches('731', '732')).toBe(false);
    expect(attendanceRoomMatches('7301', '7310')).toBe(false); // 7310 は0が3文字目でない→畳まない
    expect(attendanceRoomMatches('731', '7031')).toBe(false); // 7031 も畳まない
  });

  it('英字/記号を含む roomId は畳まない (フェイルオープン回帰: アドバーサリアル検証で検出した high)', () => {
    // roomIdSchema は [A-Za-z0-9_-] を許容 → "7A01" 等の有効な別教室 QR が到達しうる。
    // 数字限定の畳み込みでないと "7A01"→"7A1" の誤一致で別教室の出席を送る事故になる。
    expect(attendanceRoomMatches('7A1', '7A01')).toBe(false);
    expect(attendanceRoomMatches('7-1', '7-01')).toBe(false);
    expect(attendanceRoomMatches('7_1', '7_01')).toBe(false);
    expect(attendanceRoomMatches('7A0B', '7AB')).toBe(false);
  });

  it('null / 空 / 日本語のみ は保守的に扱う', () => {
    expect(attendanceRoomMatches(null, '7301')).toBe(false);
    expect(attendanceRoomMatches('731', null)).toBe(false);
    expect(attendanceRoomMatches('オンライン', 'オンライン')).toBe(true);
    expect(attendanceRoomMatches('オンライン', '7301')).toBe(false);
  });
});

/**
 * 新習志野キャンパスの 7 始まり教室は native 4 桁 (ユーザー談)。
 * 4 桁時間割教室を 3 桁へ畳むと津田沼の 3 桁室と衝突するため、畳み込みは一方向
 * (時間割が 3 桁のときだけ QR 4 桁を畳む) にする回帰テスト。
 */
describe('attendanceRoomMatches — 新習志野 native 4桁の衝突防止', () => {
  it('新習志野 native 4桁は完全一致で突合 (畳まない)', () => {
    expect(attendanceRoomMatches('7301講義室', '7301')).toBe(true);
    expect(attendanceRoomMatches('7401', '7401')).toBe(true);
  });

  it('4桁時間割教室を3桁へ畳んで誤一致させない (津田沼3桁との衝突防止)', () => {
    // 旧実装は両側を畳み '7301'(新習志野) と '731'(津田沼) を同一視していた。
    expect(attendanceRoomMatches('7301講義室', '731')).toBe(false);
    expect(attendanceRoomMatches('7301', '731')).toBe(false);
  });

  it('別の新習志野 4桁教室は一致しない', () => {
    expect(attendanceRoomMatches('7301', '7401')).toBe(false);
    expect(attendanceRoomMatches('7301講義室', '7311')).toBe(false);
  });

  it('津田沼の 3桁⇔QR4桁 はこれまで通り一致 (回帰)', () => {
    expect(attendanceRoomMatches('731講義室', '7301')).toBe(true);
    expect(attendanceRoomMatches('712', '7102')).toBe(true);
  });
});
