import { parseSpending, type SpendingMonth } from '../../shared/spending';

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
 *
 * 3. Расход — отдельная ручка GET /webhook/tokens/spending (сводка по
 *    месяцам и категориям, только списания); разбор общий с вебом —
 *    src/shared/spending.ts.
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
  getSpending: () => Promise<unknown>;
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
 * Баланс, история и расход грузятся и падают независимо: разрыв в одном не
 * должен прятать уже полученное другое.
 */
export async function loadWallet(deps: WalletDeps): Promise<{
  balance: Field<number>;
  history: Field<HistoryRow[]>;
  spending: Field<SpendingMonth[]>;
}> {
  const [balance, history, spending] = await Promise.all([
    deps.getTokens().then(parseBalance).catch(() => 'failed' as const),
    deps.getHistory().then(parseHistory).catch(() => 'failed' as const),
    deps.getSpending().then(parseSpending).catch(() => 'failed' as const),
  ]);
  return { balance, history, spending };
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
