/**
 * Личные разделы профиля для мини-аппа: желания, убеждения, намерения,
 * интересы, ценности, навыки.
 *
 * Данные приходят той же ручкой `/webhook/profile`, которую экран и так
 * вызывает ради имени и языка — отдельного запроса не нужно.
 *
 * Формы две, и обе живые. Простая: `desires: ['...', '...']`. Богатая:
 * `desiresRich: [{ name, description }]` — её отдаёт граф, когда у пункта есть
 * пояснение. Веб-профиль показывает богатую, если она есть, и падает на
 * простую иначе; здесь то же самое, иначе один и тот же профиль выглядел бы
 * в двух местах по-разному.
 *
 * Правки здесь нет сознательно (решение владельца 07.09.2026): списки
 * набираются ассистентами из разговоров, и править их с телефона незачем —
 * для этого есть веб.
 */

export interface SectionItem {
  name: string;
  description?: string;
}

export interface ProfileSection {
  key: string;
  items: SectionItem[];
}

/**
 * Ключи и порядок — как в веб-профиле. `intents`, а не `intentions`: так поле
 * называется в ответе бэкенда (проверено на живом профиле).
 */
export const SECTION_KEYS = ['desires', 'values', 'beliefs', 'intents', 'interests', 'skills'] as const;

function toItems(plain: unknown, rich: unknown): SectionItem[] {
  if (Array.isArray(rich) && rich.length) {
    return rich
      .map((r: any) => {
        // Строка в «богатом» массиве — обычное дело: граф отдаёт объект не
        // для каждого пункта. А вот объект без имени превращать в строку
        // нельзя: получалось «[object Object]» в списке.
        if (typeof r === 'string') return { name: r };
        return typeof r?.name === 'string'
          ? {
              name: r.name,
              description:
                typeof r?.description === 'string' && r.description ? r.description : undefined,
            }
          : { name: '' };
      })
      .filter((i) => i.name);
  }
  if (Array.isArray(plain)) {
    return plain
      .map((p) => ({ name: typeof p === 'string' ? p : String(p ?? '') }))
      .filter((i) => i.name);
  }
  return [];
}

/**
 * Собрать непустые разделы из ответа профиля.
 *
 * Пустые не возвращаем вовсе: у человека, который только зарегистрировался,
 * пусты все шесть, и шесть заголовков с прочерками выглядели бы как поломка.
 */
export function buildSections(profile: unknown): ProfileSection[] {
  const record = Array.isArray(profile) ? profile[0] : profile;
  const data = (record as any)?.profileJson ?? (record as any)?.profile_data ?? record ?? {};

  return SECTION_KEYS.map((key) => ({
    key,
    items: toItems(data?.[key], data?.[`${key}Rich`]),
  })).filter((s) => s.items.length > 0);
}
