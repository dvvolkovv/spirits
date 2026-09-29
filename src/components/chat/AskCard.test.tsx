// src/components/chat/AskCard.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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
});
