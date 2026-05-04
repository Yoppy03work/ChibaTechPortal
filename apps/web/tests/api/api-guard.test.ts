import { describe, expect, it } from 'vitest';
import { validateStateChangingRequest } from '@/lib/api-guard';

describe('validateStateChangingRequest', () => {
  it('JSON必須の状態変更で Content-Type 不正なら 415', () => {
    const request = new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });

    const response = validateStateChangingRequest(request, { requireJson: true });
    expect(response?.status).toBe(415);
  });

  it('不許可 Origin は 403', () => {
    const request = new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: {
        Origin: 'https://evil.example.com',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const response = validateStateChangingRequest(request, { requireJson: true });
    expect(response?.status).toBe(403);
  });

  it('Sec-Fetch-Site: cross-site は 403', () => {
    const request = new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: {
        'Sec-Fetch-Site': 'cross-site',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    const response = validateStateChangingRequest(request, { requireJson: true });
    expect(response?.status).toBe(403);
  });

  it('same-origin JSON は許可する', () => {
    const request = new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: {
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: '{}',
    });

    expect(validateStateChangingRequest(request, { requireJson: true })).toBeNull();
  });
});
