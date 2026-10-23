import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';
import { categoryLabelKey, monthLabel, type SpendingMonth } from '../spending';

/**
 * Месяцы сводки расхода: строка месяца с итогом, по нажатию — категории.
 * Самый новый месяц раскрыт сразу: чаще всего спрашивают про текущий.
 * Общий для веба и кошелька мини-аппа — заголовок и запрос у каждого свои.
 *
 * Монтировать уже с загруженными данными: раскрытый месяц выбирается один
 * раз при монтировании (`months[0]`), догрузка после не переоткроет его.
 */
export function SpendingMonths({ months }: { months: SpendingMonth[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Set<string>>(() => new Set(months[0] ? [months[0].month] : []));

  if (months.length === 0) return null;

  const toggle = (month: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });

  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {months.map((m) => {
        const isOpen = open.has(m.month);
        return (
          <li key={m.month} data-testid={`spending-month-${m.month}`}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => toggle(m.month)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
            >
              <span className="flex items-center gap-1 text-gray-900">
                {isOpen ? (
                  <ChevronDown aria-hidden="true" className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight aria-hidden="true" className="h-4 w-4 text-gray-400" />
                )}
                {monthLabel(m.month)}
              </span>
              <span className="tabular-nums text-gray-900">{formatNumber(m.total)}</span>
            </button>
            {isOpen && (
              <ul className="pb-2">
                {m.categories.map((c) => (
                  <li key={c.key} className="flex items-center justify-between py-1 pl-8 pr-3 text-sm">
                    <span className="text-gray-700">
                      {t(categoryLabelKey(c.key))}
                      <span className="ml-2 text-xs text-gray-500">×{formatNumber(c.count)}</span>
                    </span>
                    <span className="tabular-nums text-gray-700">{formatNumber(c.tokens)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
