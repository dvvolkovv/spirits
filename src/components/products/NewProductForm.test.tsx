// @vitest-environment jsdom
//
// Глобальное окружение vitest — 'node' (vitest.config.ts), DOM тут нужен
// точечно.
//
// Тесты меряют ВИДИМОЕ. Утверждение «onSubmit не вызвался» оставлено там, где
// его требует план, но каждый раз рядом стоит второе — «а что при этом увидел
// человек». Тихий отказ (кнопка нажата, не произошло ничего) — главная
// повторяющаяся форма дефекта в этой работе, и проверкой одного лишь
// отсутствия вызова он не ловится: сломанная кнопка даёт ровно тот же зелёный.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mount,
  click,
  clickAsync,
  doubleClick,
  actAsync,
  type,
  byLabel,
  byButton,
  visibleText,
  tRu,
} from '../../test/dom';
import {
  NewProductForm,
  SLUG_RE,
  slugifyName,
  deriveBotSlug,
} from './NewProductForm';
import type { NewProductInput } from '../../services/productsApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

type SubmitFake = { ok: true } | { ok: false; message: string };

/** Обработчик отправки: копит вызовы и отдаёт заранее заданный ответ. */
function submitter(result: { ok: true } | { ok: false; message: string } = { ok: true }) {
  const calls: NewProductInput[] = [];
  const fn = vi.fn(async (v: NewProductInput) => {
    calls.push(v);
    return result;
  });
  return { fn, calls };
}

/** Обработчик, который зависает до ручного разрешения — имитирует запрос в полёте. */
function pendingSubmitter() {
  const calls: NewProductInput[] = [];
  let release!: (r: { ok: true } | { ok: false; message: string }) => void;
  const fn = vi.fn((v: NewProductInput) => {
    calls.push(v);
    return new Promise<{ ok: true } | { ok: false; message: string }>((res) => {
      release = res;
    });
  });
  return { fn, calls, release: (r: { ok: true } | { ok: false; message: string }) => release(r) };
}

const NAME = /Название/;
const SLUG = /Адрес/;
const TOKEN = /Токен бота/;
const CREATE = /Создать/;

describe('NewProductForm — состав полей', () => {
  it('поле токена появляется только для бота', () => {
    const { container, rerender } = mount(<NewProductForm kind="site" onSubmit={async () => ({ ok: true })} />);
    expect(byLabel(container, TOKEN)).toBeNull();

    rerender(<NewProductForm kind="bot" onSubmit={async () => ({ ok: true })} />);
    expect(byLabel(container, TOKEN)).not.toBeNull();
  });

  it('бот не спрашивает адрес — у него нет домена', () => {
    const { container } = mount(<NewProductForm kind="bot" onSubmit={async () => ({ ok: true })} />);

    expect(byLabel(container, SLUG)).toBeNull();
  });

  it('токен бота вводится скрытым полем и не уезжает в автозаполнение', () => {
    // Это секрет: в type="text" он остаётся на экране (демонстрация,
    // скриншот, чужой взгляд из-за плеча) и попадает в менеджер паролей и
    // историю автозаполнения браузера.
    const { container } = mount(<NewProductForm kind="bot" onSubmit={async () => ({ ok: true })} />);

    const token = byLabel(container, TOKEN)!;
    expect(token.getAttribute('type')).toBe('password');
    expect(token.getAttribute('autocomplete')).toBe('off');
  });
});

describe('NewProductForm — отказы видны, а не молчат', () => {
  it('слаг с недопустимыми символами не отправляется', () => {
    const { fn } = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={fn} />);

    type(byLabel(container, SLUG)!, 'Мой Сайт!');
    type(byLabel(container, NAME)!, 'Мой сайт');
    click(byButton(container, CREATE)!);

    expect(fn).not.toHaveBeenCalled();
  });

  it('и пользователь видит, ЧТО именно не так со слагом', () => {
    // Без этого утверждения предыдущий тест зеленеет и на сломанной кнопке:
    // «обработчик не вызвался» — это же самое, что «не произошло ничего».
    const { fn } = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={fn} />);

    type(byLabel(container, SLUG)!, 'Мой Сайт!');
    type(byLabel(container, NAME)!, 'Мой сайт');
    click(byButton(container, CREATE)!);

    expect(visibleText(container)).toContain(tRu('products.new.errors.slugInvalid'));
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('пустое название объясняется, а не игнорируется', () => {
    const { fn } = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={fn} />);

    type(byLabel(container, SLUG)!, 'my-shop');
    type(byLabel(container, NAME)!, '   ');
    click(byButton(container, CREATE)!);

    expect(fn).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.new.errors.nameRequired'));
  });

  it('бот без токена объясняется на месте, а не 400-й с сервера', () => {
    // create() на бэке отбивает пустой секрет («значение должно быть непустой
    // строкой»), и до этой правки форма отправляла BOT_TOKEN: ''.
    const { fn } = submitter();
    const { container } = mount(<NewProductForm kind="bot" onSubmit={fn} />);

    type(byLabel(container, NAME)!, 'Мой бот');
    click(byButton(container, CREATE)!);

    expect(fn).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.new.errors.tokenRequired'));
  });

  it('исправленное поле снимает сообщение, а не оставляет его висеть', async () => {
    const { fn } = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={fn} />);

    type(byLabel(container, NAME)!, 'Мой сайт');
    type(byLabel(container, SLUG)!, 'Мой Сайт!');
    await clickAsync(byButton(container, CREATE)!);
    expect(visibleText(container)).toContain(tRu('products.new.errors.slugInvalid'));

    type(byLabel(container, SLUG)!, 'my-shop');
    await clickAsync(byButton(container, CREATE)!);

    expect(visibleText(container)).not.toContain(tRu('products.new.errors.slugInvalid'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('NewProductForm — форма слага', () => {
  // Регексп обязан совпадать с серверным (products/provisioning.service.ts) и
  // с хостовым (product-runner/src/host/provision.ts). Три копии одной
  // проверки: разъехавшись, они дают отказ без внятной причины — либо 400 на
  // то, что форма пропустила, либо отбой законного слага чужим текстом.
  const good = ['a', 'my-shop', 'shop2', 'a'.repeat(40), 'a-b-c'];
  const bad = ['-rf', '--', 'shop-', '', 'My-Shop', 'a'.repeat(41), 'мой-сайт', 'my_shop', 'my shop'];

  it.each(good)('слаг %s принимается', (s) => {
    expect(SLUG_RE.test(s)).toBe(true);
  });

  it.each(bad)('слаг %s отбивается', (s) => {
    expect(SLUG_RE.test(s)).toBe(false);
  });

  it('односимвольный слаг уезжает на сервер', async () => {
    // Регексп из черновика плана (/^[a-z0-9-]{2,40}$/) отбивал бы его,
    // а сервер принимает: односимвольная метка домена законна.
    const { fn, calls } = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={fn} />);

    type(byLabel(container, NAME)!, 'Точка');
    type(byLabel(container, SLUG)!, 'a');
    await clickAsync(byButton(container, CREATE)!);

    expect(calls).toHaveLength(1);
    expect(calls[0].slug).toBe('a');
  });

  it('слаг с ведущим дефисом не уезжает на хост аргументом команды', () => {
    // Черновиковый /^[a-z0-9-]{2,40}$/ пропускал '-rf': слаг становится
    // именем контейнера, каталогом и меткой домена, а ведущий дефис в
    // аргументе docker/nginx разбирается как флаг.
    const { fn } = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={fn} />);

    type(byLabel(container, NAME)!, 'Сайт');
    type(byLabel(container, SLUG)!, '-rf');
    click(byButton(container, CREATE)!);

    expect(fn).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.new.errors.slugInvalid'));
  });

  it('пробелы по краям слага не считаются ошибкой', async () => {
    const s = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Магазин');
    type(byLabel(container, SLUG)!, '  my-shop  ');
    await clickAsync(byButton(container, CREATE)!);

    expect(s.calls[0].slug).toBe('my-shop');
  });
});

describe('NewProductForm — слаг бота выводится из названия', () => {
  it('русское название превращается в годный слаг, а не в частокол дефисов', () => {
    // Черновик делал name.toLowerCase().replace(/[^a-z0-9-]/g, '-'):
    // «Магазин цветов» → '---------------', то есть 400 с сервера про поле,
    // которого у бота на экране нет вовсе.
    expect(slugifyName('Магазин цветов')).toBe('magazin-cvetov');
    expect(SLUG_RE.test(slugifyName('Магазин цветов'))).toBe(true);
  });

  it('прогон разделителей сворачивается в один дефис', () => {
    // .replace(/[^a-z0-9]/g, '-') без плюса даёт дефис на КАЖДЫЙ символ:
    // «Магазин — цветов» превращается в 'magazin-----cvetov'.
    expect(slugifyName('Магазин  —  цветов')).toBe('magazin-cvetov');
  });

  it('знаки по краям названия не оставляют дефис по краям слага', () => {
    // Дефис по краям слага запрещён сервером и хостом: он уезжает аргументом
    // docker и nginx и разбирается как флаг.
    expect(slugifyName('!!! Магазин цветов !!!')).toBe('magazin-cvetov');
    expect(SLUG_RE.test(slugifyName('!!! Магазин цветов !!!'))).toBe(true);
  });

  it('название из одних знаков не даёт пустого слага', () => {
    expect(slugifyName('!!! ???')).toBe('');
    expect(SLUG_RE.test(deriveBotSlug('!!! ???', 'ab12cd'))).toBe(true);
  });

  it('очень длинное название укладывается в 40 символов', () => {
    const slug = deriveBotSlug('Очень длинное название бота про цветы и подарки', 'ab12cd');

    expect(slug.length).toBeLessThanOrEqual(40);
    expect(SLUG_RE.test(slug)).toBe(true);
  });

  it('два бота с одинаковым названием получают разные слаги', async () => {
    // Иначе второй ловит 409 «слаг уже занят» — на форме, где поля слага нет
    // и исправить нечего.
    const s = submitter();
    const { container, unmount } = mount(<NewProductForm kind="bot" onSubmit={s.fn} />);
    type(byLabel(container, NAME)!, 'Магазин цветов');
    type(byLabel(container, TOKEN)!, '123:AAA');
    await clickAsync(byButton(container, CREATE)!);
    unmount();

    const second = mount(<NewProductForm kind="bot" onSubmit={s.fn} />);
    type(byLabel(second.container, NAME)!, 'Магазин цветов');
    type(byLabel(second.container, TOKEN)!, '123:AAA');
    await clickAsync(byButton(second.container, CREATE)!);

    expect(s.calls).toHaveLength(2);
    expect(s.calls[0].slug).not.toBe(s.calls[1].slug);
    expect(s.calls.every((c) => SLUG_RE.test(c.slug))).toBe(true);
    expect(s.calls.every((c) => c.slug.startsWith('magazin-cvetov-'))).toBe(true);
  });
});

describe('NewProductForm — диакритика', () => {
  // Четыре наших локали (fr, pt, es, de) пишут названия с диакритикой.
  // Без снятия надстрочных знаков буква выпадала в дефис: слаг оставался
  // годным, но имя рассыпалось — 'Café Fleuri' давало 'caf-fleuri'.
  const cases: [string, string][] = [
    ['Café Fleuri', 'cafe-fleuri'],
    ['Müller Bot', 'muller-bot'],
    ['Ação Rápida', 'acao-rapida'],
    ['Español Señor', 'espanol-senor'],
    ['Zoë', 'zoe'],
  ];

  it.each(cases)('%s превращается в %s', (name, expected) => {
    expect(slugifyName(name)).toBe(expected);
  });

  it('иероглифы и арабский дают пустую основу, но годный слаг', () => {
    // Дешёвого лечения для них нет, и хвост вместо имени тут приемлем —
    // лишь бы сервер принял слаг.
    for (const name of ['花店', 'متجر الزهور', '🌸🌸🌸', '---']) {
      expect(SLUG_RE.test(deriveBotSlug(name, 'ab12cd'))).toBe(true);
    }
  });
});

describe('NewProductForm — слаг бота показывается', () => {
  it('будущее имя контейнера видно на форме', () => {
    // Домена у бота нет, слаг в списке не показывается — а всплывает он
    // каталогом на машине продуктов и строкой в логах, когда кто-то
    // разбирает отказ. Тайная идентичность — плохая идентичность.
    const { container } = mount(<NewProductForm kind="bot" onSubmit={async () => ({ ok: true })} />);

    type(byLabel(container, NAME)!, 'Магазин цветов');

    expect(visibleText(container)).toContain('magazin-cvetov-');
  });

  it('показанное имя — ровно то, что уезжает на сервер', async () => {
    const s = submitter();
    const { container } = mount(<NewProductForm kind="bot" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Магазин цветов');
    type(byLabel(container, TOKEN)!, '123:AAA');
    const shown = visibleText(container).match(/magazin-cvetov-[a-z0-9]+/)![0];
    await clickAsync(byButton(container, CREATE)!);

    expect(s.calls[0].slug).toBe(shown);
  });

  it('у сайта подсказки про контейнер нет', () => {
    const { container } = mount(<NewProductForm kind="site" onSubmit={async () => ({ ok: true })} />);

    type(byLabel(container, NAME)!, 'Магазин цветов');

    expect(visibleText(container)).not.toContain('magazin-cvetov-');
  });

  it('хвост слага — шесть символов', async () => {
    // BOT_SUFFIX_LEN = 1 не измерялся ничем, а от длины хвоста зависит
    // вероятность столкновения слагов у одинаково названных ботов.
    const s = submitter();
    const { container } = mount(<NewProductForm kind="bot" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Магазин цветов');
    type(byLabel(container, TOKEN)!, '123:AAA');
    await clickAsync(byButton(container, CREATE)!);

    expect(s.calls[0].slug).toMatch(/-[a-z0-9]{6}$/);
  });

  it('после отказа сервера второе нажатие уходит под другим слагом', async () => {
    // Единственный способ разойтись с занятым слагом на форме, где поля
    // адреса нет вовсе.
    const s = submitter({ ok: false, message: 'слаг уже занят' });
    const { container } = mount(<NewProductForm kind="bot" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Магазин цветов');
    type(byLabel(container, TOKEN)!, '123:AAA');
    await clickAsync(byButton(container, CREATE)!);
    type(byLabel(container, TOKEN)!, '123:AAA');
    await clickAsync(byButton(container, CREATE)!);

    expect(s.calls).toHaveLength(2);
    expect(s.calls[0].slug).not.toBe(s.calls[1].slug);
  });
});

describe('NewProductForm — потолки и подсказки', () => {
  it('слишком длинное название объясняется', () => {
    // Потолок 80 стоит в CreateProductDto; без своей проверки пользователь
    // получил бы 400 с английским текстом class-validator.
    const s = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'я'.repeat(81));
    type(byLabel(container, SLUG)!, 'my-shop');
    click(byButton(container, CREATE)!);

    expect(s.fn).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.new.errors.nameTooLong'));
  });

  it('слишком длинный токен объясняется', () => {
    // 8192 — потолок значения секрета в create() на бэкенде.
    const s = submitter();
    const { container } = mount(<NewProductForm kind="bot" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Бот');
    type(byLabel(container, TOKEN)!, 'a'.repeat(8193));
    click(byButton(container, CREATE)!);

    expect(s.fn).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.new.errors.tokenTooLong'));
  });

  it('будущий адрес сайта виден до отправки', () => {
    const { container } = mount(<NewProductForm kind="site" onSubmit={async () => ({ ok: true })} />);

    type(byLabel(container, SLUG)!, 'my-shop');

    expect(visibleText(container)).toContain('my-shop.p.linkeon.io');
  });

  it('негодный адрес не выдаётся за будущий', () => {
    const { container } = mount(<NewProductForm kind="site" onSubmit={async () => ({ ok: true })} />);

    type(byLabel(container, SLUG)!, 'Мой Сайт!');

    expect(visibleText(container)).not.toContain('.p.linkeon.io');
    expect(visibleText(container)).toContain(tRu('products.new.slugHint'));
  });

  it('негодное поле помечено для чтения с экрана', () => {
    // Сообщение под полем видит зрячий; aria-invalid — всё остальное.
    const { container } = mount(<NewProductForm kind="site" onSubmit={async () => ({ ok: true })} />);

    type(byLabel(container, NAME)!, 'Магазин');
    type(byLabel(container, SLUG)!, 'Мой Сайт!');
    click(byButton(container, CREATE)!);

    expect(byLabel(container, SLUG)!.getAttribute('aria-invalid')).toBe('true');
    expect(byLabel(container, NAME)!.getAttribute('aria-invalid')).toBe('false');
  });

  it('прошлая ошибка сервера гаснет на новой отправке', async () => {
    // Иначе рядом с новым сообщением висит старое, и непонятно, какое из
    // них про текущее нажатие.
    let answer: SubmitFake = { ok: false, message: 'слаг уже занят' };
    const calls: NewProductInput[] = [];
    const fn = vi.fn(async (v: NewProductInput) => {
      calls.push(v);
      return answer;
    });
    const { container } = mount(<NewProductForm kind="site" onSubmit={fn} />);

    type(byLabel(container, NAME)!, 'Магазин');
    type(byLabel(container, SLUG)!, 'my-shop');
    await clickAsync(byButton(container, CREATE)!);
    expect(visibleText(container)).toContain('слаг уже занят');

    answer = { ok: true };
    type(byLabel(container, SLUG)!, 'my-shop-2');
    await clickAsync(byButton(container, CREATE)!);

    expect(visibleText(container)).not.toContain('слаг уже занят');
  });
});

describe('NewProductForm — что именно уезжает на сервер', () => {
  it('секрет бота уходит под именем BOT_TOKEN и без пробелов по краям', async () => {
    // Токен почти всегда приходит копипастой из чата с BotFather — с
    // переводом строки на конце.
    const s = submitter();
    const { container } = mount(<NewProductForm kind="bot" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Магазин цветов');
    type(byLabel(container, TOKEN)!, ' 123:AAA \n');
    await clickAsync(byButton(container, CREATE)!);

    expect(s.calls[0].secrets).toEqual({ BOT_TOKEN: '123:AAA' });
    expect(s.calls[0].kind).toBe('bot');
  });

  it('у сайта секретов нет вовсе', async () => {
    const s = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Магазин');
    type(byLabel(container, SLUG)!, 'my-shop');
    await clickAsync(byButton(container, CREATE)!);

    expect(s.calls[0].secrets).toEqual({});
    expect(s.calls[0].kind).toBe('site');
  });

  it('название уезжает подрезанным', async () => {
    const s = submitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, '  Магазин  ');
    type(byLabel(container, SLUG)!, 'my-shop');
    await clickAsync(byButton(container, CREATE)!);

    expect(s.calls[0].name).toBe('Магазин');
  });

  it('после успеха токен из формы стирается', async () => {
    const s = submitter({ ok: true });
    const { container } = mount(<NewProductForm kind="bot" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Магазин цветов');
    type(byLabel(container, TOKEN)!, '123:AAA');
    await clickAsync(byButton(container, CREATE)!);

    expect(byLabel(container, TOKEN)!.value).toBe('');
  });
});

describe('NewProductForm — отправка', () => {
  beforeEach(() => vi.clearAllMocks());

  it('двойное нажатие заводит один продукт, а не два', async () => {
    // У формы черновика нет состояния отправки: второй клик, пока первый
    // запрос в полёте, — это второй продукт и второй занятый слаг.
    const p = pendingSubmitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={p.fn} />);

    type(byLabel(container, NAME)!, 'Магазин');
    type(byLabel(container, SLUG)!, 'my-shop');
    // Именно doubleClick: два отдельных click() закрывают каждый свой act(),
    // React успевает применить disabled, и второе нажатие гасит уже разметка —
    // такой тест переживал снятие замка по ссылке (мутация M03).
    doubleClick(byButton(container, CREATE)!);

    expect(p.calls).toHaveLength(1);
  });

  it('пока запрос в полёте, кнопка заблокирована и это видно', async () => {
    const p = pendingSubmitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={p.fn} />);

    type(byLabel(container, NAME)!, 'Магазин');
    type(byLabel(container, SLUG)!, 'my-shop');
    click(byButton(container, CREATE)!);

    expect(byButton(container, /./)!.disabled).toBe(true);
    expect(visibleText(container)).toContain(tRu('products.new.creating'));
  });

  it('отказ сервера разблокирует кнопку и показывает причину', async () => {
    // Иначе форма остаётся замороженной навсегда: пользователь видит
    // «Заводим…» и не может ни повторить, ни исправить.
    const p = pendingSubmitter();
    const { container } = mount(<NewProductForm kind="site" onSubmit={p.fn} />);

    type(byLabel(container, NAME)!, 'Магазин');
    type(byLabel(container, SLUG)!, 'my-shop');
    click(byButton(container, CREATE)!);

    await actAsync(() => p.release({ ok: false, message: 'слаг уже занят' }));

    expect(visibleText(container)).toContain('слаг уже занят');
    expect(byButton(container, CREATE)!.disabled).toBe(false);
  });

  it('после отказа можно отправить второй раз', async () => {
    const s = submitter({ ok: false, message: 'слаг уже занят' });
    const { container } = mount(<NewProductForm kind="site" onSubmit={s.fn} />);

    type(byLabel(container, NAME)!, 'Магазин');
    type(byLabel(container, SLUG)!, 'my-shop');
    await clickAsync(byButton(container, CREATE)!);
    type(byLabel(container, SLUG)!, 'my-shop-2');
    await clickAsync(byButton(container, CREATE)!);

    expect(s.calls).toHaveLength(2);
    expect(s.calls[1].slug).toBe('my-shop-2');
  });
});
