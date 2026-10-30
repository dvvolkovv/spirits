const INVALID_URL_CHARS = /[\\\u0000-\u001f\u007f]/;

export function safeInternalPath(value: string): string | null {
  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || INVALID_URL_CHARS.test(candidate)) {
    return null;
  }

  try {
    const url = new URL(candidate, 'https://cabinet.invalid');
    if (url.origin !== 'https://cabinet.invalid') return null;
    const decodedPath = decodeURIComponent(url.pathname);
    if (decodedPath.startsWith('//') || INVALID_URL_CHARS.test(decodedPath)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function safeExternalUrl(value: string, allowedHosts?: readonly string[]): string | null {
  const candidate = value.trim();
  if (!candidate || INVALID_URL_CHARS.test(candidate)) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (allowedHosts && !allowedHosts.includes(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function safeNavigationUrl(value: string): string | null {
  return safeInternalPath(value) ?? safeExternalUrl(value);
}
