// SMS-линза [Лаунчер/Фаза 3a]: тонкая обёртка над нативным плагином SmsBridge.
// Весь контент остаётся на устройстве — сюда приходят уже классифицированные сообщения.
type Sms = { sender: string; body: string; date: number; verdict: 'spam' | 'important' };

function plugin(): any {
  return (window as any).Capacitor?.Plugins?.SmsBridge || null;
}

export function hasSmsBridge(): boolean {
  return !!plugin();
}

export async function smsHasPermission(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try { return !!(await p.hasPermission()).granted; } catch { return false; }
}

export async function smsRequestPermission(): Promise<boolean> {
  const p = plugin();
  if (!p) return false;
  try { return !!(await p.requestPermission()).granted; } catch { return false; }
}

export async function smsList(tab: 'spam' | 'important'): Promise<Sms[]> {
  const p = plugin();
  if (!p) return [];
  try { return (await p.listMessages({ tab })).items || []; } catch { return []; }
}

export async function smsMark(sender: string, spam: boolean): Promise<void> {
  const p = plugin();
  if (!p) return;
  try { await p.mark({ sender, spam }); } catch { /* no-op */ }
}

export type { Sms };
