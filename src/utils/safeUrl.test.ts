import { describe, expect, it } from 'vitest';
import { safeExternalUrl, safeInternalPath, safeNavigationUrl } from './safeUrl';

describe('safeInternalPath', () => {
  it.each([
    '/chat',
    '/studio?tab=products',
    '/chat?assistant=14#draft',
  ])('accepts an application path: %s', (value) => {
    expect(safeInternalPath(value)).toBe(value);
  });

  it.each([
    'https://evil.example/',
    'javascript:alert(1)',
    '//evil.example/',
    '/\\evil.example/',
    '\\\\evil.example/',
    '/%5cevil.example/',
    '/%2fevil.example/',
    '/chat%00/',
    '/chat\nlocation=https://evil.example',
    '',
  ])('rejects an unsafe path: %s', (value) => {
    expect(safeInternalPath(value)).toBeNull();
  });
});

describe('safeExternalUrl', () => {
  it('accepts and normalizes HTTPS', () => {
    expect(safeExternalUrl(' https://example.com/path?q=1 ')).toBe('https://example.com/path?q=1');
  });

  it.each([
    'http://example.com/',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://user:password@example.com/',
    'https://example.com/\\evil',
    '/chat',
  ])('rejects an unsafe external URL: %s', (value) => {
    expect(safeExternalUrl(value)).toBeNull();
  });

  it('enforces an optional host allowlist', () => {
    expect(safeExternalUrl('https://zoom.us/oauth/authorize', ['zoom.us'])).toBe('https://zoom.us/oauth/authorize');
    expect(safeExternalUrl('https://evil.example/', ['zoom.us'])).toBeNull();
  });
});

describe('safeNavigationUrl', () => {
  it('accepts internal paths and HTTPS URLs only', () => {
    expect(safeNavigationUrl('/chat')).toBe('/chat');
    expect(safeNavigationUrl('https://example.com/')).toBe('https://example.com/');
    expect(safeNavigationUrl('javascript:alert(1)')).toBeNull();
    expect(safeNavigationUrl('//evil.example/')).toBeNull();
  });
});
