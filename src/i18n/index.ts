import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';

import ru from './locales/ru.json';
import { SUPPORTED_CODES, DEFAULT_LANGUAGE, FALLBACK_CHAIN } from './languages';

i18n
  // ru лежит в бандле как фолбэк, остальные локали Vite нарезает в отдельные
  // чанки и подтягивает только при переключении языка.
  .use(
    resourcesToBackend((language: string) =>
      language === DEFAULT_LANGUAGE
        ? Promise.resolve({ default: ru })
        : import(`./locales/${language}.json`),
    ),
  )
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // Цепочка, а не один язык: незакрытый ключ в de/es/fr/zh раньше приходил
    // русским прямо посреди чужого интерфейса (немец видел «Управление»
    // вместо «Management»). Русский остаётся последним рубежом — он источник
    // правды и заполнен целиком.
    fallbackLng: FALLBACK_CHAIN,
    supportedLngs: SUPPORTED_CODES,
    // es-MX → es: без этого детектор навигатора уводит в фолбэк
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    // ru отдан ресурсами, остальные — бэкендом; без флага i18next
    // считает, что раз ресурсы есть, бэкенд не нужен
    partialBundledLanguages: true,
    resources: {
      ru: { translation: ru },
    },
    detection: {
      // querystring первым: лендинг живёт на linkeon.io, приложение на
      // my.linkeon.io — это разные origin, и localStorage между ними не общий.
      // Выбранный на лендинге язык доезжает только параметром в ссылке
      // (?lang=en), иначе страница открывается на языке по умолчанию, то есть
      // русском, даже у англоязычного посетителя.
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      caches: ['localStorage'],
    },
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
