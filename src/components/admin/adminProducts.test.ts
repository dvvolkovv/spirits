/**
 * Чистая часть раздела «Сайты и боты»: фильтры ↔ адрес страницы ↔ запрос к
 * бэкенду, подписи статусов и строка результата гашения. Отдельно от
 * компонента — здесь всё проверяется без React и без сети.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FILTERS,
  readFilters,
  withFilters,
  withProduct,
  listQuery,
  statusChips,
  countByStatus,
  statusLabel,
  availableAction,
  describeBlock,
  describeUnblock,
  problemText,
  formatRelative,
  formatDate,
  isPast,
  preview,
  detailUrl,
  normalizeDetail,
  periodLabel,
} from './adminProducts';

const params = (s: string) => new URLSearchParams(s);

describe('фильтры из адреса', () => {
  it('без параметров — значения по умолчанию: 30 дней, без тестовых и архивных', () => {
    expect(readFilters(params('tab=products'))).toEqual({
      q: '',
      statuses: [],
      kind: 'all',
      periodDays: 30,
      includeTest: false,
      includeArchived: false,
    });
    expect(DEFAULT_FILTERS.periodDays).toBe(30);
    expect(DEFAULT_FILTERS.includeTest).toBe(false);
    expect(DEFAULT_FILTERS.includeArchived).toBe(false);
  });

  it('читает всё, что положено в адрес', () => {
    expect(readFilters(params('q=кофе&status=failed,blocked&kind=bot&period=90&test=1&archived=1'))).toEqual({
      q: 'кофе',
      // Порядок — канонический (как у кнопок), а не как пришло.
      statuses: ['blocked', 'failed'],
      kind: 'bot',
      periodDays: 90,
      includeTest: true,
      includeArchived: true,
    });
  });

  it('мусор в адресе даёт значения по умолчанию, а не падение', () => {
    const f = readFilters(params('kind=robot&period=365&test=yes&status=,,RUNNING,<b>,running,running'));
    expect(f.kind).toBe('all');
    expect(f.periodDays).toBe(30);
    expect(f.includeTest).toBe(false);
    expect(f.statuses).toEqual(['running']);
  });

  it('незнакомый статус из адреса сохраняется: он мог прийти из данных', () => {
    expect(readFilters(params('status=hibernating')).statuses).toEqual(['hibernating']);
  });
});

describe('фильтры в адрес', () => {
  it('значения по умолчанию из адреса убираются, чужие параметры остаются', () => {
    const next = withFilters(params('tab=products&product=p1&period=90&kind=bot&test=1'), {
      periodDays: 30,
      kind: 'all',
      includeTest: false,
    });
    expect(next.toString()).toBe('tab=products&product=p1');
  });

  it('заданные фильтры пишутся в адрес', () => {
    const next = withFilters(params('tab=products'), {
      q: '  shop ',
      statuses: ['failed', 'running'],
      kind: 'site',
      periodDays: 7,
      includeTest: true,
      includeArchived: true,
    });
    expect(next.get('tab')).toBe('products');
    expect(next.get('q')).toBe('shop');
    expect(next.get('status')).toBe('running,failed');
    expect(next.get('kind')).toBe('site');
    expect(next.get('period')).toBe('7');
    expect(next.get('test')).toBe('1');
    expect(next.get('archived')).toBe('1');
  });

  it('карточка продукта — свой параметр, остальные не трогаются', () => {
    expect(withProduct(params('tab=products&kind=bot'), 'p-1').toString()).toBe('tab=products&kind=bot&product=p-1');
    expect(withProduct(params('tab=products&product=p-1'), null).toString()).toBe('tab=products');
  });
});

describe('запрос к бэкенду', () => {
  it('по умолчанию — только период', () => {
    expect(listQuery(DEFAULT_FILTERS)).toBe('periodDays=30');
  });

  it('все фильтры по контракту', () => {
    const q = new URLSearchParams(
      listQuery({
        q: 'кофе & чай',
        statuses: ['running', 'blocked'],
        kind: 'bot',
        periodDays: 90,
        includeTest: true,
        includeArchived: true,
      }),
    );
    expect(q.get('q')).toBe('кофе & чай');
    expect(q.get('status')).toBe('running,blocked');
    expect(q.get('kind')).toBe('bot');
    expect(q.get('periodDays')).toBe('90');
    expect(q.get('includeTest')).toBe('1');
    expect(q.get('includeArchived')).toBe('1');
  });

  it('пробелы вокруг поиска не уходят, пустой поиск не уходит вовсе', () => {
    expect(listQuery({ ...DEFAULT_FILTERS, q: '   ' })).toBe('periodDays=30');
    expect(new URLSearchParams(listQuery({ ...DEFAULT_FILTERS, q: ' a b ' })).get('q')).toBe('a b');
  });
});

describe('статусы', () => {
  it('кнопки: шесть основных всегда, плюс увиденные в данных и выбранные', () => {
    expect(statusChips([], [])).toEqual(['provisioning', 'running', 'degraded', 'sleeping', 'blocked', 'failed']);
    expect(statusChips(['stopped', 'running', 'zeta'], ['alpha'])).toEqual([
      'provisioning', 'running', 'degraded', 'sleeping', 'blocked', 'failed', 'stopped', 'alpha', 'zeta',
    ]);
  });

  it('сводка считает по статусам в каноническом порядке', () => {
    const rows = [{ status: 'failed' }, { status: 'running' }, { status: 'running' }, { status: 'zeta' }];
    expect(countByStatus(rows)).toEqual([
      { status: 'running', count: 2 },
      { status: 'failed', count: 1 },
      { status: 'zeta', count: 1 },
    ]);
  });

  it('подписи по-русски, незнакомый статус — как есть', () => {
    expect(statusLabel('running')).toBe('Работает');
    expect(statusLabel('blocked')).toBe('Погашен');
    expect(statusLabel('sleeping')).toBe('Спит');
    expect(statusLabel('hibernating')).toBe('hibernating');
  });
});

describe('какое действие доступно', () => {
  const base = { status: 'running', archivedAt: null };

  it('погашенный — только снять блок, заведённые — только погасить', () => {
    expect(availableAction({ ...base, status: 'blocked' })).toBe('unblock');
    for (const s of ['running', 'sleeping', 'degraded', 'stopped']) {
      expect(availableAction({ ...base, status: s })).toBe('block');
    }
  });

  it('не заведённый (failed, provisioning) — никаких: снятие блока увело бы его в сон с пробуждением, которое может не сработать', () => {
    expect(availableAction({ ...base, status: 'failed' })).toBeNull();
    expect(availableAction({ ...base, status: 'provisioning' })).toBeNull();
  });

  it('архивный — никаких действий: бэкенд откажет и в том, и в другом', () => {
    expect(availableAction({ status: 'running', archivedAt: '2026-09-01T00:00:00Z' })).toBeNull();
    expect(availableAction({ status: 'blocked', archivedAt: '2026-09-01T00:00:00Z' })).toBeNull();
    expect(availableAction({ status: 'archived', archivedAt: null })).toBeNull();
  });
});

describe('строка результата', () => {
  it('гашение: что погашено, каким было и сколько правок оборвано', () => {
    const text = describeBlock({ id: 'p1', slug: 'coffee', wasStatus: 'running', by: 'идентификатору', killedJobs: 2, killedTurns: 1 });
    expect(text).toContain('«coffee»');
    expect(text).toContain('работает');
    expect(text).toContain('оборвано правок: 1');
    expect(text).toContain('снято заданий: 2');
  });

  it('гашение без оборванных правок так и говорит, пустые задания не упоминает', () => {
    const text = describeBlock({ slug: 'coffee', wasStatus: 'sleeping', killedJobs: 0, killedTurns: 0 });
    expect(text).toContain('оборвано правок: 0');
    expect(text).not.toContain('заданий');
  });

  it('ответ без полей — общая фраза, а не undefined', () => {
    expect(describeBlock(null)).toBe('Продукт погашен');
    expect(describeBlock({})).toBe('Продукт погашен');
    expect(describeUnblock(undefined)).toContain('Блокировка снята');
    expect(describeUnblock(undefined)).not.toContain('undefined');
  });

  it('снятие блока: с какого продукта', () => {
    const text = describeUnblock({ id: 'p1', slug: 'coffee', by: 'идентификатору', killedJobs: 0 });
    expect(text).toContain('Блокировка снята');
    expect(text).toContain('«coffee»');
  });
});

describe('текст ошибки сервера', () => {
  const res = (status: number, body: unknown, broken = false) => ({
    status,
    json: async () => {
      if (broken) throw new SyntaxError('Unexpected token <');
      return body;
    },
  });

  it('message строкой — как есть', async () => {
    expect(await problemText(res(409, { statusCode: 409, message: 'Продукт «a» в архиве' }))).toBe('Продукт «a» в архиве');
  });

  it('message массивом (ValidationPipe) — склеивается', async () => {
    expect(await problemText(res(400, { message: ['раз', 'два'] }))).toBe('раз; два');
  });

  it('не JSON (502 от nginx) — код, а не исключение', async () => {
    expect(await problemText(res(502, null, true))).toContain('502');
  });
});

describe('время', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');

  it('относительное время', () => {
    expect(formatRelative(null, now)).toBe('—');
    expect(formatRelative('2026-09-26T11:59:40Z', now)).toBe('только что');
    expect(formatRelative('2026-09-26T11:15:00Z', now)).toBe('45 мин назад');
    expect(formatRelative('2026-09-26T07:00:00Z', now)).toBe('5 ч назад');
    expect(formatRelative('2026-09-23T12:00:00Z', now)).toBe('3 дн назад');
    expect(formatRelative('не дата', now)).toBe('—');
  });

  it('дата без времени и пустые значения', () => {
    expect(formatDate('2026-09-01T12:00:00Z')).toBe('01.09.2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('мусор')).toBe('—');
  });

  it('просрочено — только то, что в прошлом', () => {
    expect(isPast('2026-09-25T12:00:00Z', now)).toBe(true);
    expect(isPast('2026-09-27T12:00:00Z', now)).toBe(false);
    expect(isPast(null, now)).toBe(false);
    expect(isPast('мусор', now)).toBe(false);
  });
});

describe('свёрнутый текст правки', () => {
  it('короткий — целиком, длинный — обрезан с многоточием, переводы строк схлопнуты', () => {
    expect(preview('коротко')).toBe('коротко');
    const long = 'а'.repeat(200);
    expect(preview(long).length).toBeLessThan(100);
    expect(preview(long).endsWith('…')).toBe(true);
    expect(preview('раз\n\nдва')).toBe('раз два');
    expect(preview(null)).toBe('');
  });
});

describe('карточка и период', () => {
  it('адрес карточки — с периодом списка', () => {
    expect(detailUrl('p1', 90)).toBe('/webhook/admin/products/p1?periodDays=90');
    // id экранируется: слэш увёл бы запрос на чужой маршрут.
    expect(detailUrl('a/b', 30)).toBe('/webhook/admin/products/a%2Fb?periodDays=30');
  });

  it('период из ответа карточки: число — как есть, нет или мусор — null', () => {
    const product = { id: 'p1' };
    expect(normalizeDetail({ product, periodDays: 7 })!.periodDays).toBe(7);
    expect(normalizeDetail({ product })!.periodDays).toBeNull();
    expect(normalizeDetail({ product, periodDays: 'много' })!.periodDays).toBeNull();
    expect(normalizeDetail({ product, periodDays: -5 })!.periodDays).toBeNull();
  });

  it('подпись периода по-русски, без числа — «за период»', () => {
    expect(periodLabel(30)).toBe('за 30 дней');
    expect(periodLabel(7)).toBe('за 7 дней');
    expect(periodLabel(90)).toBe('за 90 дней');
    expect(periodLabel(1)).toBe('за 1 день');
    expect(periodLabel(2)).toBe('за 2 дня');
    expect(periodLabel(11)).toBe('за 11 дней');
    expect(periodLabel(21)).toBe('за 21 день');
    expect(periodLabel(null)).toBe('за период');
  });
});
