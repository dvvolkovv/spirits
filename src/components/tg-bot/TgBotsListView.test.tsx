// @vitest-environment jsdom
//
// Вкладка ботов решает, в каком виде показать карточку «что это за бот»:
// новичку целиком, остальным строкой заголовка. Решение принимается один раз,
// по первой загрузке списка, и действия со списком его не отменяют.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, click, clickAsync, actAsync, flush, visibleText } from '../../test/dom';
import type { Mounted } from '../../test/dom';
import ru from '../../i18n/locales/ru.json';
import { TgBotsListView } from './TgBotsListView';
import { tgBotApi, type TgBotConfig } from '../../services/tgBotApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const nav = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => nav.navigate }));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../services/tgBotApi', () => ({
  tgBotApi: {
    list: vi.fn(async () => []),
    remove: vi.fn(async () => ({ ok: true })),
    reissueClaim: vi.fn(),
  },
}));

// Модалки правки и истории к карточке отношения не имеют, а правка тянет за
// собой выбор роли с походом в API.
vi.mock('./TgBotEditModal', () => ({ TgBotEditModal: () => null }));
vi.mock('./TgBotMessagesView', () => ({ TgBotMessagesView: () => null }));

const api = vi.mocked(tgBotApi);
const intro = ru.tgBot.intro;

function bot(over: Partial<TgBotConfig> = {}): TgBotConfig {
  return {
    id: 'b-1',
    tgChatId: '-100123',
    tgChatTitle: 'Семья',
    displayName: 'Финансист',
    presetAgentId: '17',
    customAgentId: null,
    addressingMode: 'strict',
    voiceReplyMode: 'never',
    status: 'active',
    lastReplyAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    archivedAt: null,
    ...over,
  };
}

let view: Mounted | null = null;

beforeEach(() => {
  api.list.mockReset();
  api.list.mockResolvedValue([]);
  api.remove.mockReset();
  api.remove.mockResolvedValue({ ok: true });
  nav.navigate.mockReset();
});

afterEach(() => {
  view?.unmount();
  view = null;
  vi.unstubAllGlobals();
});

async function openTab(props: { embedded?: boolean; onOpenProducts?: () => void } = { embedded: true }) {
  view = mount(<TgBotsListView {...props} />);
  await flush();
  return view.container;
}

function buttonWith(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!found) throw new Error(`нет кнопки с текстом «${text}»`);
  return found;
}

describe('карточка «что это за бот» на вкладке ботов', () => {
  it('у кого ботов нет — развёрнута целиком', async () => {
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.lead);
    expect(visibleText(c)).toContain(intro.products_button);
  });

  it('у кого есть бот — свёрнута в заголовок', async () => {
    api.list.mockResolvedValue([bot()]);
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.title);
    expect(visibleText(c)).not.toContain(intro.lead);
  });

  it('бот только в архиве — тоже свёрнута: человек уже знает, что это', async () => {
    api.list.mockResolvedValue([bot({ status: 'archived', archivedAt: '2026-10-05T10:00:00Z' })]);
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.title);
    expect(visibleText(c)).not.toContain(intro.lead);
  });

  it('только личный чат с ботом — развёрнута: групповых ботов человек ещё не заводил', async () => {
    // Личка заводит свою строку в том же списке: положительный id чата и имя
    // «Linkeon» (ensurePrivateConfig на бэке). По ней человек не «опытный».
    api.list.mockResolvedValue([
      bot({ tgChatId: '987654321', tgChatTitle: null, displayName: 'Linkeon', addressingMode: 'always', voiceReplyMode: 'mirror' }),
    ]);
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.lead);
  });

  it('бот ждёт группы — свёрнута: мастер человек уже прошёл', async () => {
    api.list.mockResolvedValue([bot({ status: 'pending', tgChatId: null, tgChatTitle: null })]);
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.title);
    expect(visibleText(c)).not.toContain(intro.lead);
  });

  it('список не загрузился — развёрнута: о человеке ничего не известно', async () => {
    api.list.mockRejectedValue(new Error('HTTP 502'));
    const c = await openTab();
    expect(visibleText(c)).toContain(intro.lead);
  });

  it('до ответа сервера — только «Загрузка»: карточка не прыгает и не сдвигает кнопки', async () => {
    api.list.mockReturnValue(new Promise<TgBotConfig[]>(() => {}));
    const c = await openTab();
    expect(visibleText(c)).toContain(ru.common.loading);
    expect(visibleText(c)).not.toContain(intro.title);
    // Карточка встаёт НАД кнопкой «Создать» и вкладками. Нарисуй их раньше —
    // у новичка на телефоне они уехали бы на экран вниз прямо под пальцем.
    expect(visibleText(c)).not.toContain(ru.tgBot.create_button);
    expect(visibleText(c)).not.toContain(ru.tgBot.tab_active);
  });

  it('раскрытая вручную не пропадает и не схлопывается, пока список перезагружается', async () => {
    api.list.mockResolvedValue([bot()]);
    vi.stubGlobal('confirm', () => true);
    const c = await openTab();

    click(buttonWith(c, intro.title));
    expect(visibleText(c)).toContain(intro.lead);

    // Архивация перезагружает список. Ответ сервера держим, пока не посмотрим
    // на экран посреди загрузки: мгновенный ответ заглушки React склеивает с
    // началом загрузки в одну отрисовку, и карточка, которую рисуют только
    // вне загрузки, прошла бы этот тест — проверено мутацией. В браузере между
    // запросом и ответом проходит время, и такая карточка размонтировалась бы
    // и вернулась свёрнутой.
    let answer!: (rows: TgBotConfig[]) => void;
    api.list.mockReturnValueOnce(new Promise<TgBotConfig[]>((resolve) => { answer = resolve; }));
    const archive = c.querySelector(`button[aria-label="${ru.tgBot.card_archive_aria}"]`);
    expect(archive).not.toBeNull();
    await clickAsync(archive!);
    await flush();

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(visibleText(c)).toContain(intro.lead);

    await actAsync(() => answer([bot({ status: 'archived', archivedAt: '2026-10-13T10:00:00Z' })]));
    expect(visibleText(c)).toContain(intro.lead);
  });

  it('в Студии кнопка продуктов зовёт переход, который дала Студия', async () => {
    const onOpenProducts = vi.fn();
    const c = await openTab({ embedded: true, onOpenProducts });
    click(buttonWith(c, intro.products_button));
    expect(onOpenProducts).toHaveBeenCalledTimes(1);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('без перехода от Студии — обычный переход на вкладку продуктов', async () => {
    const c = await openTab({ embedded: true });
    click(buttonWith(c, intro.products_button));
    expect(nav.navigate).toHaveBeenCalledWith('/studio?tab=products');
  });
});
