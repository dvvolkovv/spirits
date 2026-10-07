// @vitest-environment jsdom
//
// Модалки «описание услуг» и «порядок оплаты», которые открываются из
// строки согласия на экране входа.
//
// Карточка входа (OnboardingPage) появляется анимацией slide-up с
// animation-fill-mode: both, и после анимации на ней остаётся
// transform: translateY(0). Элемент с transform становится containing block
// для position: fixed: модалка, нарисованная внутри карточки, растягивалась
// на карточку, а не на экран, и плашки под карточкой ложились поверх текста
// условий (прод, 07.10.2026; у кого анимации в системе выключены, дефекта не
// было). jsdom раскладку не считает, поэтому тест проверяет саму причину:
// модалка не должна оставаться в дереве родителя, её место прямо в body.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, click, byButton } from '../../test/dom';
import type { Mounted } from '../../test/dom';
import LoginConsentBlock from './LoginConsentBlock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: 'ru' },
  }),
}));
// formatNumber в таблице пакетов берёт язык у экземпляра i18next.
vi.mock('../../i18n', () => ({ default: { language: 'ru' } }));

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

const openModal = (): HTMLElement | null => document.body.querySelector<HTMLElement>('.fixed.inset-0');

/** Блок согласия в своём контейнере — как внутри карточки на экране входа. */
function openFrom(linkText: RegExp): { card: HTMLElement; modal: HTMLElement | null } {
  mounted = mount(<LoginConsentBlock checked={false} onChange={() => {}} />);
  const card = mounted.container;
  const link = byButton(card, linkText);
  expect(link).not.toBeNull();
  click(link!);
  return { card, modal: openModal() };
}

describe('LoginConsentBlock: модалки условий открываются поверх экрана, а не внутри карточки', () => {
  it.each([
    ['порядок оплаты', /порядком оплаты/],
    ['описание услуг', /описанием услуг/],
  ])('%s: модалка вне дерева карточки, прямо в body', (_name, linkText) => {
    const { card, modal } = openFrom(linkText);
    expect(modal).not.toBeNull();
    expect(card.contains(modal)).toBe(false);
    expect(modal!.parentElement).toBe(document.body);
  });

  it('закрытая модалка не оставляет в body ничего', () => {
    const { modal } = openFrom(/порядком оплаты/);
    expect(modal).not.toBeNull();
    const gotIt = byButton(modal!, /payment\.info\.got_it/);
    expect(gotIt).not.toBeNull();
    click(gotIt!);
    expect(openModal()).toBeNull();
  });
});
