import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Бот «Затыки недели» (spirits_back, src/insights) читает обезличенные тексты
 * разговоров ради улучшения сервиса. Политика обязана говорить об этом до
 * запуска — в обеих редакциях, иначе русская и английская разойдутся молча:
 * LegalModal — рукописный документ, ключей перевода у него нет.
 */
const src = readFileSync('src/components/onboarding/LegalModal.tsx', 'utf8').replace(/\s+/g, ' ');

describe('политика: анализ обезличенных текстов', () => {
  it('русская редакция называет цель и что удаляется заранее', () => {
    expect(src).toContain('анализ обезличенных текстов диалогов (в том числе расшифровок голосовых разговоров) и обращений для выявления затруднений пользователей и улучшения сервиса');
    expect(src).toContain('удаляются номера телефонов, адреса электронной почты, имена и иные идентификаторы');
    expect(src).toContain('без цитат и без связи с учетной записью');
  });

  it('английская редакция — то же самое', () => {
    expect(src).toContain('analyzing de-identified texts of conversations (including transcripts of voice conversations) and support requests');
    expect(src).toContain('phone numbers, email addresses, names and other identifiers are removed');
    expect(src).toContain('without quotes and without any link to the user account');
  });

  it('обе редакции политики датированы одним днём', () => {
    // «октября» — только у политики: оферта датирована августом.
    const ruDays = [...src.matchAll(/Редакция от (\d+) октября 2026 г\./g)].map((m) => m[1]);
    const enDays = [...src.matchAll(/Last updated: (\d+) October 2026/g)].map((m) => m[1]);
    expect(ruDays).toEqual(['24']);
    expect(enDays).toEqual(ruDays);
  });
});
