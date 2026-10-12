import { describe, it, expect } from 'vitest';
import { HELP_GUIDE_LINKS } from './HelpPage';
import ru from '../i18n/locales/ru.json';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';
import de from '../i18n/locales/de.json';
import fr from '../i18n/locales/fr.json';
import pt from '../i18n/locales/pt.json';
import zh from '../i18n/locales/zh.json';

/**
 * «Помощь» отстала от кабинета (12.10.2026): «левая панель», «раздел Картинки»,
 * цены «от 149 до 1990 ₽» и YooKassa во всех семи языках (у нерусских
 * пользователей другая дорожка оплаты), ни Студии, ни звонка, ни календарей.
 * Ссылки инструкции вели на редиректы: «Совместимость» — на поиск, «Запросы» —
 * в чаты.
 */

const LOCALES: Record<string, any> = { ru, en, es, de, fr, pt, zh };
const helpText = (j: any) => JSON.stringify(j.help);

describe('«Помощь»: структура', () => {
  it.each(Object.keys(LOCALES))('%s: пунктов инструкции столько же, сколько ссылок у страницы', (lang) => {
    expect(LOCALES[lang].help.guides).toHaveLength(HELP_GUIDE_LINKS.length);
  });

  it.each(Object.keys(LOCALES))('%s: вопросов столько же, сколько в русском', (lang) => {
    expect(LOCALES[lang].help.faq).toHaveLength(ru.help.faq.length);
  });

  it('ссылки ведут на живые разделы, а не на редиректы', () => {
    const routes = HELP_GUIDE_LINKS.map((g) => g.route);
    for (const dead of ['/compatibility', '/chats', '/chat?view=video']) expect(routes).not.toContain(dead);
    for (const live of ['/search?tab=compatibility', '/search?tab=requests', '/search?tab=chats', '/image-gen', '/video', '/studio']) {
      expect(routes).toContain(live);
    }
  });
});

describe('«Помощь»: содержание', () => {
  it.each(Object.keys(LOCALES))('%s: без цен и платёжного провайдера — они зависят от языка', (lang) => {
    expect(helpText(LOCALES[lang])).not.toMatch(/YooKassa|ЮKassa|₽|1990|149/);
  });

  it('без «левой панели»: ассистента выбирают в списке или в шапке чата', () => {
    expect(helpText(ru)).not.toMatch(/левой панели/);
    expect(helpText(en)).not.toMatch(/left panel/);
  });

  it.each(Object.keys(LOCALES))('%s: Студия, звонок, «Чистый лист» и календари — подписями этого языка', (lang) => {
    const j = LOCALES[lang];
    const text = helpText(j);
    for (const label of [j.studio.nav, j.chat.voice_call.start, j.chat.fresh_mode_label, j.settings.calendar.title, j.chat.listen]) {
      expect(text, label).toContain(label);
    }
  });
});
