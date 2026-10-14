// @vitest-environment jsdom
//
// Мастер Telegram-бота: ссылка привязки и ссылка в группу живут 15 минут.
// Раньше после первой генерации кнопка пропадала, и опоздавшему помогала
// только перезагрузка страницы (на втором шаге — и вовсе потеря мастера).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flush, clickAsync, doubleClick, type, byButton, byLink, visibleText, tRu } from '../../test/dom';
import type { Mounted } from '../../test/dom';
import { TgBotCreateWizard } from './TgBotCreateWizard';

const api = vi.hoisted(() => ({
  identityStatus: vi.fn(),
  identityLink: vi.fn(),
  create: vi.fn(),
  reissueClaim: vi.fn(),
  get: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../../services/tgBotApi', () => ({ tgBotApi: api }));
vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));
vi.mock('./role-picker/RolePickerField', () => ({
  RolePickerField: ({ onChange }: { onChange: (v: { type: 'preset'; id: string }) => void }) => (
    <button onClick={() => onChange({ type: 'preset', id: '12' })}>pick-role</button>
  ),
}));

const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
  vi.clearAllMocks();
});

async function toIdentityLink() {
  api.identityStatus.mockResolvedValue({ bound: false });
  api.identityLink
    .mockResolvedValueOnce({ token: 't1', deepLink: 'https://t.me/bot?start=first' })
    .mockResolvedValueOnce({ token: 't2', deepLink: 'https://t.me/bot?start=second' })
    .mockResolvedValue({ token: 't3', deepLink: 'https://t.me/bot?start=third' });
  view = mount(<TgBotCreateWizard />);
  await flush();
  await clickAsync(byButton(view.container, exact(tRu('tgBot.generate_link_button')))!);
  await flush();
  return view.container;
}

async function toAddGroup() {
  api.identityStatus.mockResolvedValue({ bound: true });
  api.create.mockResolvedValue({ config: { id: 'cfg-1' }, claimToken: 'c1', deepLink: 'https://t.me/bot?startgroup=one' });
  api.reissueClaim.mockResolvedValue({ config: { id: 'cfg-1' }, claimToken: 'c2', deepLink: 'https://t.me/bot?startgroup=two' });
  view = mount(<TgBotCreateWizard />);
  await flush();
  type(view.container.querySelector('input[type="text"]')!, 'Финансист');
  await clickAsync(byButton(view.container, /pick-role/)!);
  await clickAsync(byButton(view.container, new RegExp(tRu('tgBot.wizard_submit_button')))!);
  await flush();
  return view.container;
}

describe('мастер: ссылка истекла — можно получить новую, не перезагружая страницу', () => {
  it('шаг 1: «Получить новую ссылку» меняет адрес «Открыть в Telegram» и говорит, что ссылка обновлена', async () => {
    const c = await toIdentityLink();
    const open = () => byLink(c, new RegExp(tRu('tgBot.open_in_telegram')))!;
    expect(open().getAttribute('href')).toBe('https://t.me/bot?start=first');
    expect(visibleText(c)).toContain(tRu('tgBot.link_ttl_hint'));

    const again = byButton(c, exact(tRu('tgBot.new_link_button')));
    expect(again).not.toBeNull();
    await clickAsync(again!);
    await flush();
    expect(api.identityLink).toHaveBeenCalledTimes(2);
    expect(open().getAttribute('href')).toBe('https://t.me/bot?start=second');
    // Ссылка на экране не видна — меняется только адрес кнопки: без отклика
    // нажатие выглядело бы так, будто ничего не произошло.
    expect(toast.success).toHaveBeenCalledWith(tRu('tgBot.link_refreshed'));
  });

  it('шаг 1: двойное нажатие — одна новая ссылка (каждая лишняя — ещё один живой токен)', async () => {
    const c = await toIdentityLink();
    doubleClick(byButton(c, exact(tRu('tgBot.new_link_button')))!);
    await flush();
    await flush();
    expect(api.identityLink).toHaveBeenCalledTimes(2);
  });

  it('шаг 3: «Получить новую ссылку» перевыпускает ссылку в группу для только что созданного бота', async () => {
    const c = await toAddGroup();
    api.get.mockResolvedValue({ id: 'cfg-1', status: 'pending' });
    const linkField = () => c.querySelector('input[readonly]') as HTMLInputElement;
    expect(linkField().value).toBe('https://t.me/bot?startgroup=one');
    expect(visibleText(c)).toContain(tRu('tgBot.link_ttl_hint'));

    await clickAsync(byButton(c, exact(tRu('tgBot.new_link_button')))!);
    await flush();
    expect(api.reissueClaim).toHaveBeenCalledWith('cfg-1');
    expect(linkField().value).toBe('https://t.me/bot?startgroup=two');
    expect(toast.success).toHaveBeenCalledWith(tRu('tgBot.link_refreshed'));
  });

  it('шаг 3: бот уже в группе — не перевыпускаем (бэк ответил бы сырой ошибкой), а подсказываем «Готово»', async () => {
    const c = await toAddGroup();
    api.get.mockResolvedValue({ id: 'cfg-1', status: 'active' });
    await clickAsync(byButton(c, exact(tRu('tgBot.new_link_button')))!);
    await flush();
    expect(toast.success).toHaveBeenCalledWith(tRu('tgBot.already_added'));
    expect(api.reissueClaim).not.toHaveBeenCalled();
  });

  it('шаг 3: «Готово» — последняя кнопка, у копирования есть подпись для экранного диктора', async () => {
    const c = await toAddGroup();
    const buttons = Array.from(c.querySelectorAll('button')).map((b) => b.textContent?.trim());
    expect(buttons[buttons.length - 1]).toBe(tRu('common.done'));
    const copy = Array.from(c.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === tRu('referral.copy'));
    expect(copy).toBeDefined();
  });
});
