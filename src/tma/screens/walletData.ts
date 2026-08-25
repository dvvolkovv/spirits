/**
 * Логика экрана «Кошелёк» (Task 11), вынесенная из JSX ради тестов без
 * рендера React-дерева.
 *
 * Две находки против плана:
 *
 * 1. GET /webhook/user/tokens/ отдаёт `{ success, tokens }` — `r.tokens`
 *    угадан планом верно, `r.balance` в ответе никогда не бывает (лишний
 *    фолбэк, но безвредный).
 *
 * 2. GET /webhook/tokens/history — это НЕ история списаний. Контроллер
 *    (history.controller.ts) явно фильтрует `transaction_type <> 'consumed'`
 *    и возвращает только НАЧИСЛЕНИЯ (пополнения, бонусы, купоны): расход
 *    показывается в чате по каждому сообщению, а не в общей ленте. Плановые
 *    копии «Куда ушло» / «Where it went» описывают несуществующий экран —
 *    здесь это история пополнений, а не расходов. Форма строки тоже другая:
 *    `{ at, type, tokens, balanceAfter, description, provider, money,
 *    bonusTokens }`, не `{ id, created_at, amount, agent_name, reason }`.
 */
export interface HistoryRow {
  at: string;
  type: string;
  tokens: number;
  description?: string | null;
}

/** null — источник ещё не отвечал, 'failed' — запрос упал. */
export type Field<T> = T | null | 'failed';

export interface WalletDeps {
  getTokens: () => Promise<unknown>;
  getHistory: () => Promise<unknown>;
}

export function parseBalance(raw: unknown): number {
  const n = Number((raw as any)?.tokens);
  return Number.isFinite(n) ? n : 0;
}

export function parseHistory(raw: unknown): HistoryRow[] {
  const items = (raw as any)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((r: any) => ({
    at: r?.at ?? '',
    type: r?.type ?? '',
    tokens: Number(r?.tokens) || 0,
    description: r?.description ?? null,
  }));
}

/**
 * Баланс и история грузятся и падают независимо: разрыв в истории не должен
 * прятать уже полученный баланс, и наоборот.
 */
export async function loadWallet(deps: WalletDeps): Promise<{ balance: Field<number>; history: Field<HistoryRow[]> }> {
  const [balance, history] = await Promise.all([
    deps.getTokens().then(parseBalance).catch(() => 'failed' as const),
    deps.getHistory().then(parseHistory).catch(() => 'failed' as const),
  ]);
  return { balance, history };
}

/**
 * Баланс обязан идти через плюрал-форму i18next (`tokens_one/_few/_many/
 * _other` для ru, `_one/_other` для en — см. check-locales.mjs), а не через
 * ручную склейку строки в компоненте. Отдельная функция, чтобы это было
 * проверяемо без рендера: тест ловит соблазн написать
 * `${count} токенов` напрямую.
 */
export function tokensLabel(t: (key: string, opts: Record<string, unknown>) => string, count: number): string {
  return t('tma.wallet.tokens', { count });
}
