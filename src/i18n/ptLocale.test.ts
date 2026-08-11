import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import i18n from './index';
import ru from './locales/ru.json';
import en from './locales/en.json';
import pt from './locales/pt.json';

describe('pt через настоящий инстанс приложения', () => {
  beforeAll(async () => { await i18n.changeLanguage('pt'); });
  afterAll(async () => { await i18n.changeLanguage('ru'); });

  it('локаль реально подгрузилась динамическим импортом', () => {
    expect(i18n.hasResourceBundle('pt', 'translation')).toBe(true);
  });

  it('ключи приходят из pt, а не из фолбэка', () => {
    for (const k of ['nav.help', 'profile.title', 'settings.title', 'video.pageTitle', 'admin.title']) {
      const got = i18n.t(k);
      expect(got, k).not.toBe(k);
      expect(got, `${k} утёк из ru`).not.toBe(k.split('.').reduce((o: any, p) => o?.[p], ru as any));
      expect(got, `${k} утёк из en`).not.toBe(k.split('.').reduce((o: any, p) => o?.[p], en as any));
      expect(got, k).toBe(k.split('.').reduce((o: any, p) => o?.[p], pt as any));
    }
  });

  it('множественное число берёт португальские категории', () => {
    expect(i18n.t('chat.file_count', { count: 1 })).toBe('1 ficheiro');
    expect(i18n.t('chat.file_count', { count: 3 })).toBe('3 ficheiros');
    // 5 в русском дало бы _many («файлов»); в португальском это по-прежнему other
    expect(i18n.t('chat.file_count', { count: 5 })).toBe('5 ficheiros');
  });

  it('ни один ключ pt не отдаёт кириллицу', () => {
    const bad: string[] = [];
    const walk = (o: any, p = '') => {
      for (const k of Object.keys(o)) {
        const v = o[k], kk = p ? `${p}.${k}` : k;
        if (v && typeof v === 'object') walk(v, kk);
        else if (typeof v === 'string' && /[Ѐ-ӿ]/.test(v)) bad.push(kk);
      }
    };
    walk(pt);
    expect(bad).toEqual([]);
  });
});
