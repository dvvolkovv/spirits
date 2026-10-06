// @vitest-environment jsdom
//
// Mini App, вход в существующий аккаунт по телефону: что человек видит на
// экране, когда сервер отказал в отправке кода. Отказ с объяснением (лимит
// SMS, неверный номер) приходит уже переведённым — его и надо показать, а не
// «Не получилось. Попробуйте ещё раз.», после которого он снова упрётся в лимит.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, byButton, clickAsync, type, visibleText, tRu } from '../../test/dom';
import { ChoiceScreen } from './ChoiceScreen';
import { runSendCode } from '../choiceFlow';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('i18next', () => ({ default: { language: 'ru', changeLanguage: vi.fn() } }));
vi.mock('../choiceFlow', () => ({ runStart: vi.fn(), runSendCode: vi.fn(), runConfirmLink: vi.fn() }));

const sendCode = vi.mocked(runSendCode);

async function askCode() {
  const { container } = mount(<ChoiceScreen onAuthenticated={() => {}} />);
  await clickAsync(byButton(container, new RegExp(tRu('tma.choice.haveAccount')))!);
  type(container.querySelector('input[inputmode="tel"]')!, '+79991234567');
  await clickAsync(byButton(container, new RegExp(tRu('tma.choice.sendCode')))!);
  return container;
}

describe('Mini App: отказ в отправке кода', () => {
  beforeEach(() => vi.clearAllMocks());

  it('лимит SMS — на экране фраза со сроком', async () => {
    const message = 'Слишком часто. Новый код можно запросить через 57 минут.';
    sendCode.mockResolvedValue({ ok: false, message });
    const container = await askCode();
    expect(visibleText(container)).toContain(message);
    expect(visibleText(container)).not.toContain(tRu('tma.choice.failed'));
  });

  it('отказ без объяснения — прежнее «Не получилось»', async () => {
    sendCode.mockResolvedValue({ ok: false });
    const container = await askCode();
    expect(visibleText(container)).toContain(tRu('tma.choice.failed'));
  });
});
