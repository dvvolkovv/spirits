// @vitest-environment jsdom
//
// Блок «Свой домен». Как и остальные тесты раздела, смотрят на видимый текст,
// ссылки и кнопки на экране, а не на то, какие функции вызвались: кнопка,
// которой нет, и кнопка, которая ничего не делает, для владельца одинаковы.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { actAsync, byButton, click, clickAsync, flush, mount, type, visibleText, tRu } from '../../test/dom';
import { CustomDomain, formatCheckedAt } from './CustomDomain';
import { productsApi } from '../../services/productsApi';
import type { DomainView, Product } from '../../services/productsApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../services/productsApi', () => ({
  productsApi: {
    getDomain: vi.fn(async () => ({ ok: true, view: null })),
    attachDomain: vi.fn(),
    checkDomain: vi.fn(),
    detachDomain: vi.fn(async () => ({ ok: true, removed: 'now' })),
  },
}));

const api = vi.mocked(productsApi);

const product = {
  id: 'p-1',
  name: 'Сайт визитка',
  slug: 'dmitryvolkov',
  status: 'running',
  kind: 'site',
  domain: 'dmitryvolkov.p.linkeon.io',
  runner_seen_at: null,
  created_at: '2026-09-24T10:00:00Z',
} as Product;

const awaiting: DomainView = {
  domain: 'dmitryvolkov.ru',
  domainUnicode: 'dmitryvolkov.ru',
  names: ['dmitryvolkov.ru', 'www.dmitryvolkov.ru'],
  status: 'awaiting_dns',
  error: null,
  errorReason: null,
  checkedAt: '2026-09-24T12:00:00Z',
  check: [
    { type: 'TXT', name: '_linkeon.dmitryvolkov.ru', ok: false, error: null, current: [], want: 'lk-abc' },
    { type: 'A', name: 'dmitryvolkov.ru', ok: false, error: null, current: ['90.156.201.49'], want: '139.59.210.42' },
    { type: 'AAAA', name: 'dmitryvolkov.ru', ok: false, error: null, current: ['2a00:15f8::1'], want: '' },
    { type: 'A', name: 'www.dmitryvolkov.ru', ok: false, error: 'ETIMEOUT', current: [], want: '139.59.210.42' },
    { type: 'AAAA', name: 'www.dmitryvolkov.ru', ok: true, error: null, current: [], want: '' },
  ],
  records: [
    { type: 'TXT', name: '_linkeon', fqdn: '_linkeon.dmitryvolkov.ru', value: 'lk-abc' },
    { type: 'A', name: '@', fqdn: 'dmitryvolkov.ru', value: '139.59.210.42' },
    { type: 'CNAME', name: 'www', fqdn: 'www.dmitryvolkov.ru', value: 'dmitryvolkov.p.linkeon.io' },
  ],
};

const active: DomainView = { ...awaiting, status: 'active', check: null };

/** Кириллический домен: в DNS и в ссылке — punycode, человеку — пример.рф. */
const idnActive: DomainView = {
  ...active,
  domain: 'xn--e1afmkfd.xn--p1ai',
  domainUnicode: 'пример.рф',
  names: ['xn--e1afmkfd.xn--p1ai', 'www.xn--e1afmkfd.xn--p1ai'],
};

const failed = (over: Partial<DomainView>): DomainView => ({ ...awaiting, status: 'failed', ...over });

const R = (key: string, opts?: Record<string, unknown>) => tRu(`products.domain.${key}`, opts);

async function typeAndAttach(container: HTMLElement, value: string) {
  type(container.querySelector('input')!, value);
  await clickAsync(byButton(container, new RegExp(R('attach')))!);
  await flush();
}

describe('блок «Свой домен»', () => {
  beforeEach(() => {
    // reset, а не clear: clear не снимает очередь mockResolvedValueOnce, и
    // недобранные ответы одного теста доставались следующему.
    vi.resetAllMocks();
    api.getDomain.mockResolvedValue({ ok: true, view: null });
    api.detachDomain.mockResolvedValue({ ok: true, removed: 'now' });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('без домена — поле, «Привязать» (пустое не отправить) и «бесплатно»', async () => {
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    const button = byButton(container, /Привязать/);
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(true);
    expect(visibleText(container)).toMatch(/Бесплатно/);

    type(container.querySelector('input')!, 'dmitryvolkov.ru');
    expect(byButton(container, /Привязать/)!.disabled).toBe(false);
  });

  it('привязка показывает таблицу записей и требование удалить AAAA', async () => {
    api.attachDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    await typeAndAttach(container, ' dmitryvolkov.ru ');

    const text = visibleText(container);
    expect(api.attachDomain).toHaveBeenCalledWith('p-1', 'dmitryvolkov.ru');
    expect(text).toMatch(/lk-abc/);
    expect(text).toMatch(/139\.59\.210\.42/);
    expect(text).toMatch(/dmitryvolkov\.p\.linkeon\.io/);
    expect(text).toMatch(/все AAAA-записи/);
    expect(text).toContain(R('status.awaiting_dns'));
    expect(byButton(container, /Проверить сейчас/)).not.toBeNull();
  });

  it('кнопка «скопировать» кладёт значение записи в буфер обмена', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    api.getDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    const copies = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === R('copy'));
    expect(copies).toHaveLength(3);
    click(copies[0]);
    expect(writeText).toHaveBeenCalledWith('lk-abc');
  });

  it('результат проверки: нужное значение, AAAA, «записи нет», сбой резолвера, «в порядке»', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    const text = visibleText(container);
    expect(text).toMatch(/сейчас 90\.156\.201\.49, нужно 139\.59\.210\.42/);
    expect(text).toMatch(/есть AAAA: 2a00:15f8::1/);
    expect(text).toContain(R('checkMissing'));
    // Сбой резолвера — не «записи нет»: current пуст, но запись может быть.
    expect(text).toContain(R('checkError', { code: 'ETIMEOUT' }));
    expect(text).toContain(R('checkOk'));
  });

  it('отказ переводится по коду причины, а не показывается русским текстом сервера', async () => {
    api.attachDomain.mockResolvedValueOnce({
      ok: false,
      status: 409,
      message: 'ТЕКСТ СЕРВЕРА',
      reason: 'taken',
    });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    await typeAndAttach(container, 'dmitryvolkov.ru');

    const text = visibleText(container);
    expect(text).toContain(R('reasons.taken'));
    expect(text).not.toContain('ТЕКСТ СЕРВЕРА');
  });

  it('незнакомый код причины — запасной текст сервера, а не сырой ключ', async () => {
    api.attachDomain.mockResolvedValueOnce({
      ok: false,
      status: 409,
      message: 'Что-то новое на сервере',
      reason: 'brand_new_reason',
    });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    await typeAndAttach(container, 'dmitryvolkov.ru');

    const text = visibleText(container);
    expect(text).toContain('Что-то новое на сервере');
    expect(text).not.toContain('products.domain');
  });

  it('обрыв сети — своё сообщение, а не пустота', async () => {
    api.attachDomain.mockResolvedValueOnce({ ok: false, status: 0, message: '' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    await typeAndAttach(container, 'dmitryvolkov.ru');
    expect(visibleText(container)).toMatch(/Нет связи с сервером/);
  });

  it('работающий домен — ссылка https и «Отвязать»', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: active });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    expect(container.querySelector('a[href="https://dmitryvolkov.ru"]')).not.toBeNull();
    expect(byButton(container, /Отвязать/)).not.toBeNull();
    expect(byButton(container, /Проверить/)).toBeNull();
  });

  it('кириллический домен: подпись пример.рф, ссылка в punycode', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: idnActive });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    const link = container.querySelector('a[href="https://xn--e1afmkfd.xn--p1ai"]');
    expect(link).not.toBeNull();
    expect(link!.textContent).toContain('пример.рф');
    expect(link!.textContent).not.toContain('xn--');
  });

  it('кириллический домен в результатах проверки — тоже по-человечески', async () => {
    api.getDomain.mockResolvedValueOnce({
      ok: true,
      view: {
        ...idnActive,
        status: 'awaiting_dns',
        check: [{ type: 'A', name: 'www.xn--e1afmkfd.xn--p1ai', ok: true, error: null, current: [], want: '1.2.3.4' }],
      },
    });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    expect(visibleText(container)).toContain('www.пример.рф');
  });

  it('отвязка работающего домена — в два шага', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: active });
    const onChanged = vi.fn();
    const { container } = mount(<CustomDomain product={product} onChanged={onChanged} />);
    await flush();

    click(byButton(container, /Отвязать/)!);
    expect(api.detachDomain).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(R('detachConfirm', { domain: 'dmitryvolkov.ru' }));

    // Передумал — всё как было.
    click(byButton(container, new RegExp(R('detachCancel')))!);
    expect(visibleText(container)).not.toContain(R('detachConfirm', { domain: 'dmitryvolkov.ru' }));
    expect(api.detachDomain).not.toHaveBeenCalled();

    click(byButton(container, /Отвязать/)!);
    await clickAsync(byButton(container, new RegExp(R('detachYes')))!);
    await flush();
    expect(api.detachDomain).toHaveBeenCalledWith('p-1');
    // removed: 'now' — домена больше нет, снова поле ввода.
    expect(byButton(container, /Привязать/)).not.toBeNull();
    // Карточка теряла главный адрес — список обязан перечитаться.
    expect(onChanged).toHaveBeenCalled();
  });

  it('отвязка в очереди — перечитываем состояние и показываем «Отвязываем…»', async () => {
    api.getDomain
      .mockResolvedValueOnce({ ok: true, view: awaiting })
      .mockResolvedValueOnce({ ok: true, view: { ...awaiting, status: 'removing' } });
    api.detachDomain.mockResolvedValueOnce({ ok: true, removed: 'queued' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    // Заявка ещё не работает — подтверждение не нужно, ломать нечего.
    await clickAsync(byButton(container, /Отвязать/)!);
    await flush();
    expect(api.detachDomain).toHaveBeenCalledWith('p-1');
    expect(visibleText(container)).toContain(R('status.removing'));
    expect(byButton(container, /Отвязать/)).toBeNull();
  });

  it('ошибка выпуска — перевод, сырой отказ Let’s Encrypt в подробностях и «Проверить снова»', async () => {
    api.getDomain.mockResolvedValueOnce({
      ok: true,
      view: failed({ error: 'Challenge failed for domain dmitryvolkov.ru', errorReason: 'issue_failed' }),
    });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    const text = visibleText(container);
    expect(text).toContain(R('errorReasons.issue_failed'));
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details!.textContent).toContain('Challenge failed for domain dmitryvolkov.ru');
    expect(byButton(container, /Проверить снова/)).not.toBeNull();
  });

  it('недоделанная отвязка — только «Отвязать», «Проверить снова» выпустил бы домен заново', async () => {
    api.getDomain.mockResolvedValueOnce({
      ok: true,
      view: failed({ error: 'Отвязка прервана', errorReason: 'orphan_removing' }),
    });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    expect(visibleText(container)).toContain(R('errorReasons.orphan_removing'));
    expect(byButton(container, /Проверить/)).toBeNull();
    expect(byButton(container, /Отвязать/)).not.toBeNull();
  });

  it('устаревший агент — сбой платформы, попытка не засчитана, можно проверить снова', async () => {
    api.getDomain.mockResolvedValueOnce({
      ok: true,
      view: failed({ error: 'неизвестный вид задания: "domain". Агент умеет …', errorReason: 'agent_outdated' }),
    });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    const text = visibleText(container);
    expect(text).toContain(R('errorReasons.agent_outdated'));
    expect(text).not.toContain('Агент умеет');
    expect(byButton(container, /Проверить снова/)).not.toBeNull();
  });

  it('во время выпуска отвязать нельзя', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: { ...awaiting, status: 'issuing' } });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    expect(visibleText(container)).toMatch(/Выпускаем сертификат/);
    expect(byButton(container, /Отвязать/)).toBeNull();
  });

  it('пока домен в движении — опрос раз в 10 с; заработал — опрос снят, список перечитан', async () => {
    vi.useFakeTimers();
    api.getDomain
      .mockResolvedValueOnce({ ok: true, view: awaiting })
      .mockResolvedValueOnce({ ok: true, view: { ...awaiting, status: 'issuing' } })
      .mockResolvedValue({ ok: true, view: active });
    const onChanged = vi.fn();
    const { container } = mount(<CustomDomain product={product} onChanged={onChanged} />);
    await flush();
    expect(api.getDomain).toHaveBeenCalledTimes(1);

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getDomain).toHaveBeenCalledTimes(2);
    expect(visibleText(container)).toContain(R('status.issuing'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getDomain).toHaveBeenCalledTimes(3);
    expect(container.querySelector('a[href="https://dmitryvolkov.ru"]')).not.toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.getDomain).toHaveBeenCalledTimes(3);
  });

  it('после размонтирования опрос не продолжается', async () => {
    vi.useFakeTimers();
    api.getDomain.mockResolvedValue({ ok: true, view: awaiting });
    const { unmount } = mount(<CustomDomain product={product} />);
    await flush();
    unmount();
    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.getDomain).toHaveBeenCalledTimes(1);
  });

  it('проверка показывает время последней проверки', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    const at = formatCheckedAt(awaiting.checkedAt, 'ru');
    expect(at).toBeTruthy();
    expect(visibleText(container)).toContain(`${R('lastCheck')} ${at}`);
  });

  it('«скопировать» подтверждает успех, у каждой кнопки — своя подпись для читалки', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    api.getDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    const aria = R('copyAria', { type: 'A', name: '@' });
    const btn = container.querySelector(`button[aria-label="${aria}"]`)!;
    expect(btn).not.toBeNull();
    await clickAsync(btn);
    expect(btn.textContent).toBe(R('copied'));
    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(btn.textContent).toBe(R('copy'));
  });

  it('буфер обмена недоступен — говорим об этом и выделяем значение', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    api.getDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    const btn = container.querySelector(`button[aria-label="${R('copyAria', { type: 'TXT', name: '_linkeon' })}"]`)!;
    await clickAsync(btn);
    await flush();
    expect(btn.textContent).toBe(R('copyFailed'));
    expect(String(window.getSelection())).toBe('lk-abc');
  });

  it('у продукта уже есть домен — отказ называет его', async () => {
    api.attachDomain.mockResolvedValueOnce({ ok: false, status: 409, message: 'ТЕКСТ', reason: 'has_domain' });
    api.getDomain
      .mockResolvedValueOnce({ ok: true, view: null })
      .mockResolvedValueOnce({ ok: true, view: idnActive });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    await typeAndAttach(container, 'other.ru');
    expect(visibleText(container)).toContain(R('hasDomainNamed', { domain: 'пример.рф' }));
  });

  it('без известного домена — отказ has_domain без имени', async () => {
    api.attachDomain.mockResolvedValueOnce({ ok: false, status: 409, message: 'ТЕКСТ', reason: 'has_domain' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    await typeAndAttach(container, 'other.ru');
    expect(visibleText(container)).toContain(R('reasons.has_domain'));
  });

  it('правка поля гасит прошлую ошибку', async () => {
    api.attachDomain.mockResolvedValueOnce({ ok: false, status: 422, message: '', reason: 'ip' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    await typeAndAttach(container, '1.2.3.4');
    expect(visibleText(container)).toContain(R('reasons.ip'));
    type(container.querySelector('input')!, 'mysite.ru');
    expect(visibleText(container)).not.toContain(R('reasons.ip'));
  });

  it('смена статуса гасит прошлую ошибку', async () => {
    vi.useFakeTimers();
    api.getDomain
      .mockResolvedValueOnce({ ok: true, view: awaiting })
      .mockResolvedValueOnce({ ok: true, view: awaiting })
      .mockResolvedValue({ ok: true, view: { ...awaiting, status: 'issuing' } });
    api.checkDomain.mockResolvedValueOnce({ ok: false, status: 429, message: '', reason: 'throttled' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    await clickAsync(byButton(container, /Проверить сейчас/)!);
    await flush();
    expect(visibleText(container)).toContain(R('reasons.throttled'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(visibleText(container)).toContain(R('status.issuing'));
    expect(visibleText(container)).not.toContain(R('reasons.throttled'));
  });

  it('подтверждение отвязки закрывается, если статус сменился сам', async () => {
    vi.useFakeTimers();
    api.getDomain
      .mockResolvedValueOnce({ ok: true, view: active })
      .mockResolvedValue({ ok: true, view: { ...active, status: 'removing' } });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    click(byButton(container, /Отвязать/)!);
    expect(byButton(container, new RegExp(R('detachYes')))).not.toBeNull();

    // Активный домен не опрашивается — статус меняется перечиткой после
    // чужого действия; эмулируем её отказом «отвязывается» на «Да».
    api.detachDomain.mockResolvedValueOnce({ ok: false, status: 409, message: '', reason: 'removing' });
    await clickAsync(byButton(container, new RegExp(R('detachYes')))!);
    await flush();
    expect(visibleText(container)).toContain(R('status.removing'));
    expect(byButton(container, new RegExp(R('detachYes')))).toBeNull();
    expect(visibleText(container)).toContain(R('reasons.removing'));
  });

  it('статус объявляется читалке экрана', async () => {
    api.getDomain.mockResolvedValueOnce({ ok: true, view: awaiting });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain(R('status.awaiting_dns'));
  });

  it('медленный GET, начатый до отвязки, не воскрешает снятый домен', async () => {
    vi.useFakeTimers();
    let release: (v: unknown) => void = () => {};
    api.getDomain
      .mockResolvedValueOnce({ ok: true, view: awaiting })
      .mockImplementationOnce(() => new Promise((r) => { release = r as (v: unknown) => void; }) as never);
    api.detachDomain.mockResolvedValueOnce({ ok: true, removed: 'now' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();

    // Тик опроса: GET ушёл и висит.
    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getDomain).toHaveBeenCalledTimes(2);

    await clickAsync(byButton(container, /Отвязать/)!);
    await flush();
    expect(byButton(container, /Привязать/)).not.toBeNull();

    // Старый ответ пришёл после отвязки — он устарел.
    await actAsync(async () => {
      release({ ok: true, view: awaiting });
    });
    await flush();
    expect(byButton(container, /Привязать/)).not.toBeNull();
    expect(visibleText(container)).not.toContain('lk-abc');
  });

  it('пока GET опроса висит, следующий тик его не дублирует', async () => {
    vi.useFakeTimers();
    api.getDomain
      .mockResolvedValueOnce({ ok: true, view: awaiting })
      .mockImplementation(() => new Promise(() => {}) as never);
    mount(<CustomDomain product={product} />);
    await flush();
    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(35_000);
    });
    expect(api.getDomain).toHaveBeenCalledTimes(2);
  });

  it('сбой GET при опросе не стирает таблицу', async () => {
    vi.useFakeTimers();
    api.getDomain
      .mockResolvedValueOnce({ ok: true, view: awaiting })
      .mockResolvedValue({ ok: false, status: 0, message: '' });
    const { container } = mount(<CustomDomain product={product} />);
    await flush();
    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(api.getDomain).toHaveBeenCalledTimes(2);
    expect(visibleText(container)).toContain('lk-abc');
    expect(byButton(container, /Проверить сейчас/)).not.toBeNull();
  });

  describe('только отвязка (продукт погашен администратором)', () => {
    it('работающий домен — ссылка и «Отвязать» в два шага, ни проверки, ни формы', async () => {
      api.getDomain.mockResolvedValueOnce({ ok: true, view: active });
      const { container } = mount(<CustomDomain product={{ ...product, status: 'blocked' }} detachOnly />);
      await flush();
      expect(container.querySelector('a[href="https://dmitryvolkov.ru"]')).not.toBeNull();
      expect(byButton(container, /Проверить/)).toBeNull();
      expect(container.querySelector('input')).toBeNull();
      click(byButton(container, /Отвязать/)!);
      expect(api.detachDomain).not.toHaveBeenCalled();
      await clickAsync(byButton(container, new RegExp(R('detachYes')))!);
      await flush();
      expect(api.detachDomain).toHaveBeenCalledWith('p-1');
      // Домен снят — блоку показывать больше нечего.
      expect(container.textContent).toBe('');
    });

    it('заявка ждёт DNS — без таблицы записей и без «Проверить»', async () => {
      api.getDomain.mockResolvedValueOnce({ ok: true, view: failed({ errorReason: 'issue_failed', error: 'x' }) });
      const { container } = mount(<CustomDomain product={{ ...product, status: 'blocked' }} detachOnly />);
      await flush();
      expect(visibleText(container)).not.toContain('lk-abc');
      expect(byButton(container, /Проверить/)).toBeNull();
      expect(byButton(container, /Отвязать/)).not.toBeNull();
    });

    it('домена нет — блока нет', async () => {
      const { container } = mount(<CustomDomain product={{ ...product, status: 'blocked' }} detachOnly />);
      await flush();
      expect(container.textContent).toBe('');
      expect(container.querySelector('input')).toBeNull();
    });
  });
});
