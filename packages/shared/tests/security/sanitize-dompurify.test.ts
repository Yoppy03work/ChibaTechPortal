/**
 * DOMPurifyベースサニタイザテスト
 *
 * WHY: 正規表現ベースでは防げないXSSベクターをDOMPurifyが正しく処理するか検証する
 */
import { describe, it, expect } from 'vitest';
import { sanitizeExternalText, sanitizeRichHtml } from '../../src/lib/validation';

describe('sanitizeExternalText（プレーンテキスト化）', () => {
  it('通常のHTMLタグを除去する', () => {
    expect(sanitizeExternalText('<p>Hello</p>')).toBe('Hello');
    expect(sanitizeExternalText('<b>bold</b> text')).toBe('bold text');
  });

  it('scriptタグを除去する', () => {
    expect(sanitizeExternalText('<script>alert(1)</script>')).toBe('');
  });

  it('ネストタグ攻撃を防ぐ', () => {
    // WHY: DOMPurifyはDOMパーサーでタグを解析するので、scriptタグは確実に除去される。
    // <scr は不完全なタグとして扱われ、残りのテキストは安全なプレーンテキスト。
    const result = sanitizeExternalText('<scr<script>ipt>alert(1)</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script');
  });

  it('不正形式HTMLを安全に処理する', () => {
    expect(sanitizeExternalText('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeExternalText('<svg onload=alert(1)>')).toBe('');
  });

  it('イベントハンドラ属性を除去する', () => {
    expect(sanitizeExternalText('<div onclick="alert(1)">text</div>')).toBe('text');
  });

  it('空文字列を正しく処理する', () => {
    expect(sanitizeExternalText('')).toBe('');
  });

  it('タグなしテキストはそのまま返す', () => {
    expect(sanitizeExternalText('Hello World')).toBe('Hello World');
  });

  it('前後の空白をトリムする', () => {
    expect(sanitizeExternalText('  hello  ')).toBe('hello');
  });
});

describe('sanitizeRichHtml（リッチHTML保持）', () => {
  it('許可されたタグを保持する', () => {
    expect(sanitizeRichHtml('<p>paragraph</p>')).toBe('<p>paragraph</p>');
    expect(sanitizeRichHtml('<strong>bold</strong>')).toBe('<strong>bold</strong>');
    expect(sanitizeRichHtml('<em>italic</em>')).toBe('<em>italic</em>');
    expect(sanitizeRichHtml('<br>')).toContain('br');
  });

  it('リストを保持する', () => {
    const input = '<ul><li>item1</li><li>item2</li></ul>';
    const result = sanitizeRichHtml(input);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
  });

  it('テーブルを保持する', () => {
    const input = '<table><tr><td>cell</td></tr></table>';
    const result = sanitizeRichHtml(input);
    expect(result).toContain('<table>');
    expect(result).toContain('<td>');
  });

  it('aタグのhref属性を保持する', () => {
    const result = sanitizeRichHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('href="https://example.com"');
  });

  it('scriptタグを除去する', () => {
    const result = sanitizeRichHtml('<p>text</p><script>alert(1)</script>');
    expect(result).toBe('<p>text</p>');
  });

  it('イベントハンドラ属性を除去する', () => {
    const result = sanitizeRichHtml('<p onclick="alert(1)">text</p>');
    expect(result).toBe('<p>text</p>');
  });

  it('許可されていないタグを除去する', () => {
    const result = sanitizeRichHtml('<div>text</div><iframe src="evil"></iframe>');
    expect(result).not.toContain('div');
    expect(result).not.toContain('iframe');
    expect(result).toContain('text');
  });

  it('javascript: URLを除去する', () => {
    const result = sanitizeRichHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain('javascript');
  });

  it('style属性を除去する（許可リスト外）', () => {
    const result = sanitizeRichHtml('<p style="color:red">text</p>');
    expect(result).not.toContain('style');
  });

  describe('リンク属性（target不許可 + URIスキーム制限）', () => {
    it('target属性は剥がされる（reverse tabnabbing対策）', () => {
      const result = sanitizeRichHtml('<a href="https://example.com" target="_blank">link</a>');
      expect(result).not.toContain('target');
    });

    it('入力側の rel も剥がされる（ALLOWED_ATTR 外）', () => {
      const result = sanitizeRichHtml('<a href="https://example.com" rel="nofollow">link</a>');
      expect(result).not.toContain('rel=');
    });

    it('https: リンクは保持', () => {
      const result = sanitizeRichHtml('<a href="https://example.com">x</a>');
      expect(result).toContain('href="https://example.com"');
    });

    it('http: リンクは保持（学内ホスト想定）', () => {
      const result = sanitizeRichHtml('<a href="http://internal.example.ac.jp">x</a>');
      expect(result).toContain('href="http://internal.example.ac.jp"');
    });

    it('mailto: リンクは保持', () => {
      const result = sanitizeRichHtml('<a href="mailto:foo@example.com">x</a>');
      expect(result).toContain('href="mailto:foo@example.com"');
    });

    it('tel: リンクは除去される（許可スキーム外）', () => {
      const result = sanitizeRichHtml('<a href="tel:0312345678">x</a>');
      expect(result).not.toContain('tel:');
    });

    it('javascript: リンクは除去される', () => {
      const result = sanitizeRichHtml('<a href="javascript:alert(1)">x</a>');
      expect(result).not.toContain('javascript');
    });

    it('data: リンクは除去される', () => {
      const result = sanitizeRichHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
      expect(result).not.toContain('data:');
    });
  });
});
