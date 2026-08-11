import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RUB_PACKAGES } from '../../config/tokenPackages';

/**
 * Оферта и таблица тарифов — рукописные документы: они перечислены в
 * DOCUMENT_BLOCKS скрипта check-no-hardcoded, потому что дробить обязывающий
 * текст на ключи вредно, а переводить его машинно нельзя.
 *
 * Рукописный — значит отстающий: до этой проверки оферта перечисляла три
 * пакета, когда в витрине их стало пять. Тест не пишет текст за человека, но
 * не даёт забыть пакет: каждый объём и каждая цена обязаны встречаться в обоих
 * документах, в русском и английском написании.
 */

/**
 * Обе стороны сравнения приводим к обычному пробелу.
 *
 * Иначе тест был бы вечно красным на ровном месте: toLocaleString('ru-RU')
 * разделяет разряды НЕразрывным пробелом (U+00A0), а в документах стоит
 * обычный (U+0020). Записано escape-последовательностью, а не самим знаком:
 * корректность не должна держаться на невидимом символе, который теряется
 * при копировании.
 */
const NBSP = /\u00A0/g;
const read = (p: string) => readFileSync(p, 'utf8').replace(NBSP, ' ');

const DOCUMENTS = {
  оферта: read('src/components/onboarding/LegalModal.tsx'),
  'таблица тарифов': read('src/components/onboarding/PaymentInfoModal.tsx'),
};

/** «3 000 000» — как пишут по-русски и по-французски. */
const ru = (n: number) => n.toLocaleString('ru-RU').replace(NBSP, ' ');
/** «3,000,000» — как пишут по-английски. */
const en = (n: number) => n.toLocaleString('en-US');

describe('цены в рукописных документах', () => {
  for (const [docName, text] of Object.entries(DOCUMENTS)) {
    for (const p of RUB_PACKAGES) {
      it(`${docName}: пакет ${p.id} указан объёмом`, () => {
        expect(text).toContain(ru(p.tokens));
        expect(text).toContain(en(p.tokens));
      });

      it(`${docName}: пакет ${p.id} указан ценой`, () => {
        expect(text).toContain(ru(p.priceRub));
        expect(text).toContain(en(p.priceRub));
      });
    }
  }
});
