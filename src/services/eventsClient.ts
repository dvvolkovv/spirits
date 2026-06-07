// Minimal fire-and-forget product event tracker. Sends to
// /webhook/events/track on the backend, which buffers + batches into PG.
// Never throws — silently drops on network errors.
//
// See monitoring.functions.md §3.8 for the canonical event list.

const ENDPOINT = '/webhook/events/track';

const getSessionId = (): string => {
  const KEY = 'linkeon_session_id';
  let sid = sessionStorage.getItem(KEY);
  if (!sid) {
    sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(KEY, sid);
  }
  return sid;
};

const getSource = (): string | null => {
  const KEY = 'linkeon_source';
  const params = new URLSearchParams(window.location.search);

  // Явная метка привлечения в URL ВСЕГДА побеждает кэш: клик по UTM/реф-ссылке
  // должен атрибутироваться, даже если в этой сессии уже был direct/organic
  // (иначе ручная проверка UTM и поздний клик по рекламе теряются).
  let explicit: string | null = null;
  if (params.get('ref')) {
    explicit = `referral:${params.get('ref')}`;
  } else if (params.get('utm_source') || params.get('utm_campaign')) {
    // Prefer utm_source/medium (channel attribution) over campaign name.
    explicit = `utm:${params.get('utm_source') || params.get('utm_campaign')}`;
    const med = params.get('utm_medium');
    if (med) explicit += `/${med}`;
  }
  if (explicit) {
    sessionStorage.setItem(KEY, explicit);
    return explicit;
  }

  // Иначе — первый сохранённый источник за сессию (first-touch для непомеченного).
  const cached = sessionStorage.getItem(KEY);
  if (cached) return cached;

  let src: string;
  if (document.referrer) {
    // Organic external referrer — capture the originating host (e.g. instagram.com).
    try {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      src = host && host !== window.location.hostname ? `ref-site:${host}` : 'direct';
    } catch { src = 'direct'; }
  } else {
    src = 'direct';
  }
  sessionStorage.setItem(KEY, src);
  return src;
};

export const track = (name: string, props: Record<string, unknown> = {}): void => {
  if (!name) return;
  const backend = import.meta.env.VITE_BACKEND_URL || '';
  // useBeacon when page is unloading; fetch otherwise.
  const payload = JSON.stringify({
    name,
    sessionId: getSessionId(),
    source: getSource(),
    props,
  });
  try {
    if (typeof navigator.sendBeacon === 'function' && document.visibilityState === 'hidden') {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(`${backend}${ENDPOINT}`, blob);
      return;
    }
    void fetch(`${backend}${ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
};

// Idempotent within a session: landing_view fires once per browser tab.
export const trackLandingOnce = (): void => {
  const KEY = 'linkeon_landing_tracked';
  if (sessionStorage.getItem(KEY)) return;
  sessionStorage.setItem(KEY, '1');
  track('landing_view', { referrer: document.referrer || null });
};
