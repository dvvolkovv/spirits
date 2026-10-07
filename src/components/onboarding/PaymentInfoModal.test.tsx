// @vitest-environment jsdom
//
// «Описание услуг и порядок оплаты» — текст, который человек принимает
// галочкой при входе (LoginConsentBlock). Тест меряет то, что видно на
// экране, на каждом из семи языков.
//
// До 07.10.2026 англичанин видел не en.json, а рукописный английский блок
// внутри компонента: после того как 06.08.2026 русский текст привели
// в соответствие с офертой, он продолжал читать, что возврат не
// предусмотрен вовсе, — прямо против §8. Правка локалей до него просто
// не доходила, и ни одна проверка этого не видела.
import { describe, it, expect, vi, afterEach } from 'vitest';
import ru from '../../i18n/locales/ru.json';
import en from '../../i18n/locales/en.json';
import es from '../../i18n/locales/es.json';
import de from '../../i18n/locales/de.json';
import fr from '../../i18n/locales/fr.json';
import zh from '../../i18n/locales/zh.json';
import pt from '../../i18n/locales/pt.json';
import { SUPPORTED_CODES, FALLBACK_CHAIN } from '../../i18n/languages';
import { RUB_PACKAGES } from '../../config/tokenPackages';
import { mount, visibleText } from '../../test/dom';
import type { Mounted } from '../../test/dom';
import PaymentInfoModal from './PaymentInfoModal';

type Dict = { [k: string]: string | Dict };

const LOCALES: Record<string, Dict> = { ru, en, es, de, fr, zh, pt } as unknown as Record<string, Dict>;

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Перевод из настоящих локалей с той же цепочкой фолбэка, что у приложения
 * (FALLBACK_CHAIN: сначала английский, русский последним). Пропавший ключ
 * виден: на его месте окажется чужой язык или сырой ключ.
 */
function tIn(lang: string) {
  const chain = [lang, ...FALLBACK_CHAIN.filter((l) => l !== lang)];
  return (key: string): string => {
    for (const l of chain) {
      const v = lookup(LOCALES[l], key);
      if (v !== undefined) return v;
    }
    return key;
  };
}

const state = vi.hoisted(() => ({ lang: 'ru', t: (key: string) => key }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: state.t, i18n: { language: state.lang } }),
}));
// formatNumber берёт язык у экземпляра i18next — подставляем тот же.
vi.mock('../../i18n', () => ({
  default: {
    get language() {
      return state.lang;
    },
  },
}));

let mounted: Mounted | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

function open(lang: string): HTMLElement {
  state.lang = lang;
  state.t = tIn(lang);
  mounted = mount(<PaymentInfoModal isOpen onClose={() => {}} />);
  return mounted.container;
}

const info = (lang: string) => (LOCALES[lang].payment as Dict).info as Dict;
const digits = (s: string) => s.replace(/\D/g, '');
/** Сравнение без регистра и без разницы между ’ и ': оферта на лендинге пишет типографский апостроф. */
const norm = (s: string) => s.replace(/\u2019/g, "'").toLowerCase();

/**
 * §8 оферты: возврат денег производится ТОЛЬКО при техническом сбое дольше
 * 72 часов подряд и при двойном списании по технической ошибке.
 *
 * Формулировки взяты из самих документов, а не из локалей модалки: ru и en —
 * оферта кабинета (LegalModal), остальные — переводы оферты на лендинге
 * (land_linkeon, src/content/legal/<язык>.tsx, раздел 8 и название
 * документа). «ТОЛЬКО» в оферте набрано капсом — сравниваем без регистра.
 */
const OFFER_REFUNDS: Record<string, { only: string; failure: string; duplicate: string; section: string }> = {
  ru: {
    only: 'Возврат денежных средств производится только в следующих случаях',
    failure: 'Технический сбой более 72 часов подряд',
    duplicate: 'Двойное списание по технической ошибке',
    section: 'разделом 8 Пользовательского соглашения',
  },
  en: {
    only: 'Refunds are made only in the following cases',
    failure: 'Technical failure lasting more than 72 consecutive hours',
    duplicate: 'Duplicate charge due to a technical error',
    section: 'Section 8 of the Terms of Service',
  },
  es: {
    only: 'La devolución de los importes abonados se efectúa únicamente en los siguientes casos',
    failure: 'Fallo técnico de más de 72 horas consecutivas',
    duplicate: 'Doble cargo por error técnico',
    section: 'apartado 8 de las Condiciones de Uso',
  },
  de: {
    // В оферте «AUSSCHLIESSLICH» капсом; строчными это «ausschließlich».
    only: 'Eine Rückerstattung erfolgt ausschließlich in den folgenden Fällen',
    failure: 'technische Störung von mehr als 72 Stunden ununterbrochen',
    duplicate: 'doppelte Abbuchung aufgrund eines technischen Fehlers',
    section: 'Abschnitt 8 der Nutzungsbedingungen',
  },
  fr: {
    only: 'Le remboursement n’est effectué que dans les cas suivants',
    failure: 'Panne technique de plus de 72 heures consécutives',
    duplicate: 'Double prélèvement résultant d’une erreur technique',
    section: 'section 8 des Conditions générales d’utilisation',
  },
  zh: {
    only: '仅在下列情形下办理退款',
    failure: '技术故障连续持续超过 72 小时',
    duplicate: '因技术错误导致的重复扣款',
    section: '《用户协议》第 8 条',
  },
  pt: {
    only: 'O reembolso das quantias pagas é efetuado apenas nos seguintes casos',
    failure: 'Falha técnica com duração superior a 72 horas consecutivas',
    duplicate: 'Cobrança em duplicado por erro técnico',
    section: 'ponto 8 dos Termos e Condições de Utilização',
  },
};

/** Фразы прежнего рукописного английского блока — их не должно быть ни на одном языке. */
const STALE_ENGLISH = [
  'refunds for purchased token packs are not provided',
  'partial refunds are not provided',
  'non-exchangeable and non-refundable',
  'matches people by values',
];

describe('условия оплаты: текст из локали на каждом языке', () => {
  it('для каждого языка есть формулировки §8 оферты', () => {
    expect(Object.keys(OFFER_REFUNDS).sort()).toEqual([...SUPPORTED_CODES].sort());
  });

  for (const lang of SUPPORTED_CODES) {
    describe(lang, () => {
      it('показывает каждую строку payment.info своей локали', () => {
        const text = visibleText(open(lang));
        for (const key of Object.keys(info('ru'))) {
          const own = info(lang)[key];
          expect(typeof own, `${lang}: нет ключа payment.info.${key}`).toBe('string');
          if (key === 'translation_notice' && lang === 'ru') continue;
          expect(text, `${lang}: не показан payment.info.${key}`).toContain(own);
        }
      });

      it('нет английских фраз прежнего рукописного блока', () => {
        const text = norm(visibleText(open(lang)));
        for (const phrase of STALE_ENGLISH) expect(text).not.toContain(phrase);
      });

      if (lang !== 'ru') {
        it('нет русского текста', () => {
          expect(visibleText(open(lang))).not.toMatch(/[А-Яа-яЁё]/);
        });

        it('оговорка: юридическую силу имеет русская редакция', () => {
          expect(visibleText(open(lang))).toContain(info(lang).translation_notice as string);
        });
      } else {
        it('оговорки о переводе нет', () => {
          expect(visibleText(open(lang))).not.toContain(info('ru').translation_notice as string);
        });
      }

      if (lang !== 'en') {
        it('нет английских предложений — ни фолбэком, ни вписанных в компонент', () => {
          const text = visibleText(open(lang));
          for (const [key, value] of Object.entries(info('en'))) {
            if (typeof value !== 'string' || value.length < 25 || value === info(lang)[key]) continue;
            expect(text, `${lang}: английский payment.info.${key}`).not.toContain(value);
          }
        });
      }

      it('возврат описан так, как в §8 оферты', () => {
        const text = norm(visibleText(open(lang)));
        const offer = OFFER_REFUNDS[lang];
        expect(text).toContain(norm(offer.only));
        expect(text).toContain(norm(offer.failure));
        expect(text).toContain(norm(offer.duplicate));
        expect(text).toContain(norm(offer.section));
      });

      it('приветственный бонус — 25 000 токенов, как в §4.1 оферты', () => {
        expect(digits(info(lang).section2_bonus as string)).toBe('25000');
      });

      it('таблица: пакеты, объёмы и цены из прайса, названия как на витрине', () => {
        const t = tIn(lang);
        const rows = Array.from(open(lang).querySelectorAll('tbody tr'));
        expect(rows).toHaveLength(RUB_PACKAGES.length);
        RUB_PACKAGES.forEach((p, i) => {
          const [name, amount, price] = Array.from(rows[i].querySelectorAll('td')).map((td) => td.textContent ?? '');
          // Витрина (TokenPackages, TokenPurchasePage) подписывает пакет t(p.nameKey).
          expect(name, `${lang}: название пакета ${p.id}`).toBe(t(p.nameKey));
          expect(amount).toBe(t(p.amountKey));
          expect(digits(amount), `${lang}: объём пакета ${p.id}`).toBe(String(p.tokens));
          expect(digits(price), `${lang}: цена пакета ${p.id}`).toBe(String(p.priceRub));
          expect(price).toContain('₽');
        });
      });
    });
  }
});
