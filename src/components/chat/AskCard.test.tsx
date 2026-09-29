// src/components/chat/AskCard.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { mount, click, type, byButton, visibleText } from '../../test/dom';
import { AskCard, AskBlockView } from './AskCard';
import type { AskQuestion } from '../../utils/askBlock';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const WHO: AskQuestion = { header: 'Для кого', question: 'Для кого поздравление?', multi: false, options: ['Коллеге', 'Руководителю', 'Другу'] };
const TONE: AskQuestion = { header: 'Тон', question: 'Какой тон?', multi: true, options: ['Тёплый', 'С юмором', 'Деловой'] };

describe('карточка вопроса', () => {
  it('один вопрос с одиночным выбором: ответ уходит по нажатию, карточка гаснет', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[WHO]} mode="active" onSubmit={onSubmit} />);
    expect(byButton(container, /^Ответить$/)).toBeNull();
    click(byButton(container, /^Коллеге$/)!);
    expect(onSubmit).toHaveBeenCalledWith('Коллеге');
    expect(byButton(container, /^Другу$/)!.disabled).toBe(true);
  });

  it('несколько вопросов: «Ответить» активна, только когда отвечено на каждый', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[WHO, TONE]} mode="active" onSubmit={onSubmit} />);
    const submit = () => byButton(container, /^Ответить$/)!;
    expect(submit().disabled).toBe(true);
    click(byButton(container, /^Руководителю$/)!);
    expect(submit().disabled).toBe(true);
    click(byButton(container, /^Тёплый$/)!);
    click(byButton(container, /^Деловой$/)!);
    expect(submit().disabled).toBe(false);
    click(submit());
    expect(onSubmit).toHaveBeenCalledWith('Для кого: Руководителю\nТон: Тёплый, Деловой');
  });

  it('множественный выбор: повторное нажатие снимает вариант', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[TONE]} mode="active" onSubmit={onSubmit} />);
    click(byButton(container, /^Тёплый$/)!);
    click(byButton(container, /^С юмором$/)!);
    click(byButton(container, /^Тёплый$/)!);
    click(byButton(container, /^Ответить$/)!);
    expect(onSubmit).toHaveBeenCalledWith('С юмором');
  });

  it('свой вариант: поле и отправка', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[WHO]} mode="active" onSubmit={onSubmit} />);
    click(byButton(container, /^Свой вариант$/)!);
    type(container.querySelector('input')!, 'Тёще');
    click(byButton(container, /^Ответить$/)!);
    expect(onSubmit).toHaveBeenCalledWith('Тёще');
  });

  it('после ответа: всё неактивно, выбранное подсвечено, лишних кнопок нет', () => {
    const { container } = mount(
      <AskCard questions={[WHO, TONE]} mode="answered" answerText={'Для кого: Другу\nТон: С юмором'} onSubmit={() => {}} />,
    );
    const pressed = Array.from(container.querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent);
    expect(pressed).toEqual(['Другу', 'С юмором']);
    expect(Array.from(container.querySelectorAll('button')).every((b) => b.disabled)).toBe(true);
    expect(visibleText(container)).not.toContain('Свой вариант');
    expect(visibleText(container)).not.toContain('Ответить');
  });

  it('пока идёт ход — варианты видны, нажать нельзя', () => {
    const { container } = mount(<AskCard questions={[WHO]} mode="disabled" onSubmit={() => {}} />);
    expect(byButton(container, /^Коллеге$/)!.disabled).toBe(true);
    expect(byButton(container, /^Свой вариант$/)).toBeNull();
  });

  it('недописанный блок — «Готовлю вопрос…»', () => {
    const { container } = mount(<AskBlockView block={{ kind: 'pending' }} mode="disabled" onSubmit={() => {}} components={{}} />);
    expect(visibleText(container)).toContain('Готовлю вопрос…');
  });

  it('Enter в своём варианте отправляет ответ, но не во время набора через IME', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[WHO]} mode="active" onSubmit={onSubmit} />);
    click(byButton(container, /^Свой вариант$/)!);
    const input = container.querySelector('input')!;
    type(input, 'Тёще');
    // Подтверждение кандидата IME (zh/ja) тоже шлёт keydown Enter — этот Enter
    // не должен отправлять форму.
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith('Тёще');
  });

  it('закрытие «своего варианта» стирает набранный текст — скрытый текст не уходит в ответ', () => {
    const onSubmit = vi.fn();
    const { container } = mount(<AskCard questions={[TONE]} mode="active" onSubmit={onSubmit} />);
    click(byButton(container, /^Свой вариант$/)!);
    type(container.querySelector('input')!, 'стихами');
    click(byButton(container, /^Свой вариант$/)!); // закрыли поле, не отправляя
    click(byButton(container, /^Тёплый$/)!);
    click(byButton(container, /^Ответить$/)!);
    expect(onSubmit).toHaveBeenCalledWith('Тёплый');
  });

  it('кнопка «Свой вариант» — aria-expanded (раскрывает поле), а не aria-pressed (это не выбор)', () => {
    const { container } = mount(<AskCard questions={[WHO]} mode="active" onSubmit={() => {}} />);
    const btn = byButton(container, /^Свой вариант$/)!;
    expect(btn.hasAttribute('aria-pressed')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('длинный вариант без пробелов не растягивает карточку — перенос и ограничение ширины', () => {
    const LONG: AskQuestion = { question: 'Какой баннер?', multi: false, options: ['a'.repeat(80), 'b'] };
    const { container } = mount(<AskCard questions={[LONG]} mode="active" onSubmit={() => {}} />);
    const btn = byButton(container, new RegExp(`^a{80}$`))!;
    expect(btn.className).toContain('max-w-full');
    expect(btn.className).toContain('break-words');
  });
});
