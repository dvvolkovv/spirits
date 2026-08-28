/**
 * Логика экрана «Ассистенты» (Task 10), вынесенная из JSX ради тестов без
 * рендера React-дерева.
 *
 * Реальный /webhook/agents отдаёт массив НАПРЯМУЮ (без обёртки), поля —
 * `id, name, displayName, description, category` (см. agents.service.ts
 * getAgents). Плановые `avatar_url`/`is_current` в ответе не существуют:
 * аватарки живут в отдельном blob-эндпоинте (avatarService на веб-фронте,
 * сюда сознательно не тащим — лишний объём под один экран с одним
 * действием), а «текущий» вычисляется здесь из profile.preferred_agent.
 *
 * change-agent берёт СТРОКОВОЕ ИМЯ ассистента в поле `agent`, а не
 * числовой agent_id (agents.controller.ts: `body: { agent: string }`,
 * agents.service.ts changeAgent пишет его в ai_profiles_consolidated.
 * preferred_agent). Совпадает с тем, как это уже делает основной веб-чат
 * (ChatInterface.changeAgentOnServer).
 */
export interface Agent {
  id: number | string;
  name: string;
  displayName?: string;
  description?: string;
  category?: string;
}

export interface AssistantsDeps {
  changeAgent: (name: string) => Promise<unknown>;
  closeApp: () => void;
}

export interface AgentCard {
  label: string;
  isCurrent: boolean;
}

/**
 * Данные карточки одного ассистента для рендера: подпись и признак «текущий».
 * Раньше обе строчки жили прямо в JSX (AssistantsScreen) без единого теста —
 * ревью показало это мутацией `a.id === current` (сравнение id с именем-
 * строкой): бейдж «Текущий» тихо переставал появляться, и ни один тест
 * этого не ловил. Одна функция вместо двух отдельных геттеров — потому что
 * вызывающей стороне (map по списку карточек) нужны обе величины сразу, и
 * незачем гонять a.displayName?.trim() дважды.
 *
 * displayName у /webhook/agents формально всегда строка — agents.service.ts
 * getAgents строит её через COALESCE(t.display_name, a.display_name, a.name),
 * так что NULL невозможен. Но COALESCE не спасает от ПУСТОЙ строки: если в
 * agent_translations перевод сохранён как '' или пробелы (было — не
 * заполнили), COALESCE отдаст именно её, и `a.displayName || a.name` эту
 * пустую строку не поймает. Поэтому здесь trim(), а не просто `||`.
 */
export function describeAgent(a: Agent, current: string | null): AgentCard {
  const displayName = a.displayName?.trim();
  return {
    label: displayName || a.name,
    isCurrent: current !== null && a.name === current,
  };
}

/** GET /webhook/agents — массив без обёртки; на всякий случай терпим и {agents:[...]}. */
export function parseAgents(raw: unknown): Agent[] {
  if (Array.isArray(raw)) return raw as Agent[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as any).agents)) {
    return (raw as any).agents;
  }
  return [];
}

/**
 * GET /webhook/profile — массив `[{ profileJson: {...} }]` (см.
 * profile.service.ts getProfile), со старым форматом `profile_data` как
 * запасным вариантом (как в ProfileView.tsx основного веб-приложения).
 * preferred_agent — имя ассистента, то самое, что пишет change-agent.
 */
export function extractPreferredAgent(raw: unknown): string | null {
  const record = Array.isArray(raw) ? raw[0] : raw;
  const data = (record as any)?.profileJson ?? (record as any)?.profile_data ?? record ?? {};
  return typeof data.preferred_agent === 'string' ? data.preferred_agent : null;
}

/**
 * Тап по карточке: сменить ассистента и остаться на экране.
 *
 * Приложение больше НЕ закрывается само. Раньше закрывалось сразу после
 * смены, и снаружи это читалось как «ничего не произошло»: окно исчезло,
 * подтверждения не было, а в чате бота до 28.08.2026 отвечал прежний
 * ассистент — бот не читал preferred_agent вовсе. Теперь читает, и смену
 * нужно показать: экран помечает выбранного текущим, а уйти в переписку
 * человек решает сам кнопкой «Написать» (она и зовёт closeApp).
 *
 * Ошибку не глотаем — экран покажет её сам.
 */
export async function chooseAssistant(name: string, deps: AssistantsDeps): Promise<void> {
  await deps.changeAgent(name);
}
