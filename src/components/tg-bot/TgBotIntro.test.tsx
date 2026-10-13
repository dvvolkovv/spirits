// @vitest-environment jsdom
//
// Карточка «что это за бот» — объяснение для того, кто попал на вкладку
// впервые, в том числе с лендинга, где «бот» значит продукт. Проверяется
// видимое: какой текст на экране и что делают кнопки.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, click, visibleText } from '../../test/dom';
import type { Mounted } from '../../test/dom';
import ru from '../../i18n/locales/ru.json';
import { TgBotIntro } from './TgBotIntro';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const intro = ru.tgBot.intro;
let view: Mounted | null = null;

afterEach(() => {
  view?.unmount();
  view = null;
});

/** Кнопка, в надписи которой есть этот текст. */
function buttonWith(container: HTMLElement, text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(text),
  );
  if (!found) throw new Error(`нет кнопки с текстом «${text}»`);
  return found;
}

describe('карточка «что это за бот»', () => {
  it('развёрнутая показывает объяснение целиком', () => {
    view = mount(<TgBotIntro defaultOpen onOpenProducts={() => {}} />);
    const text = visibleText(view.container);
    // Каждая строка секции видна: ни одна не потерялась при вёрстке, и ни одна
    // не лежит в локали мёртвым ключом, который никто не показывает.
    for (const line of Object.values(intro)) expect(text).toContain(line);
  });

  it('свёрнутая — только заголовок', () => {
    view = mount(<TgBotIntro defaultOpen={false} onOpenProducts={() => {}} />);
    const text = visibleText(view.container);
    expect(text).toContain(intro.title);
    expect(text).not.toContain(intro.lead);
    expect(text).not.toContain(intro.products);
  });

  it('заголовок разворачивает и сворачивает, aria-expanded идёт следом', () => {
    view = mount(<TgBotIntro defaultOpen={false} onOpenProducts={() => {}} />);
    const header = buttonWith(view.container, intro.title);
    expect(header.getAttribute('aria-expanded')).toBe('false');

    click(header);
    expect(visibleText(view.container)).toContain(intro.lead);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    // aria-controls указывает на тело карточки, которое сейчас на экране.
    const bodyId = header.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    expect(document.getElementById(bodyId!)?.textContent).toContain(intro.lead);

    click(header);
    expect(visibleText(view.container)).not.toContain(intro.lead);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('кнопка «Открыть «Продукты»» ведёт в продукты', () => {
    const onOpenProducts = vi.fn();
    view = mount(<TgBotIntro defaultOpen onOpenProducts={onOpenProducts} />);
    click(buttonWith(view.container, intro.products_button));
    expect(onOpenProducts).toHaveBeenCalledTimes(1);
  });
});
