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
  getAgents: () => Promise<unknown>;
  getProfile: () => Promise<unknown>;
  changeAgent: (name: string) => Promise<unknown>;
  closeApp: () => void;
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
 * Тап по карточке: сменить ассистента и закрыть Mini App — разговор дальше
 * живёт в чате бота. Порядок принципиален (проверяется тестом): закрыть
 * ДО того, как change-agent реально применился на сервере, значило бы
 * закрыть приложение, оставив пользователя со старым ассистентом, если
 * запрос ещё не долетел или упал.
 */
export async function chooseAssistant(name: string, deps: AssistantsDeps): Promise<void> {
  await deps.changeAgent(name);
  deps.closeApp();
}
