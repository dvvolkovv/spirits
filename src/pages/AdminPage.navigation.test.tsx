// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { actAsync, byButton, byLabel, click, clickAsync, flush, mount, type, visibleText } from '../test/dom';
import type { Mounted } from '../test/dom';
import type { AgentVersion } from '../services/agentVersionsApi';

const { get, state, versions } = vi.hoisted(() => ({
  get: vi.fn(),
  state: vi.fn(),
  versions: vi.fn(),
}));

vi.mock('../services/apiClient', () => ({ apiClient: { get } }));
vi.mock('../services/agentVersionsApi', () => ({
  agentVersionsApi: {
    state,
    versions,
    createDraft: vi.fn(),
    publish: vi.fn(),
  },
}));
vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t }) };
});
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { isAdmin: true }, isLoading: false }),
}));

vi.mock('../components/admin/AdminSupportView', () => ({ default: () => 'РАЗДЕЛ-ПОДДЕРЖКА' }));
vi.mock('../components/admin/AdminUsersView', () => ({ default: () => 'РАЗДЕЛ-ПОЛЬЗОВАТЕЛИ' }));
vi.mock('../components/admin/AdminProductsView', () => ({ default: () => 'РАЗДЕЛ-САЙТЫ-И-БОТЫ' }));
vi.mock('../components/admin/AdminPaymentsView', () => ({ default: () => 'РАЗДЕЛ-ПЛАТЕЖИ' }));
vi.mock('../components/admin/AdminTokensView', () => ({ default: () => 'РАЗДЕЛ-ТОКЕНЫ' }));
vi.mock('../components/admin/AdminUsageView', () => ({ default: () => 'РАЗДЕЛ-ИСПОЛЬЗОВАНИЕ' }));
vi.mock('../components/admin/AdminCallsView', () => ({ default: () => 'РАЗДЕЛ-ЗВОНКИ' }));
vi.mock('../components/admin/AdminCouponsView', () => ({ default: () => 'РАЗДЕЛ-КУПОНЫ' }));
vi.mock('../components/admin/AdminReferralsView', () => ({ default: () => 'РАЗДЕЛ-РЕФЕРАЛЫ' }));
vi.mock('../components/admin/AdminRetentionView', () => ({ default: () => 'РАЗДЕЛ-RETENTION' }));
vi.mock('../components/admin/AdminActivationView', () => ({ default: () => 'РАЗДЕЛ-АКТИВАЦИЯ' }));
vi.mock('../components/admin/AdminMonitoringView', () => ({ default: () => 'РАЗДЕЛ-МОНИТОРИНГ' }));
vi.mock('../components/admin/AdminProductManagementView', () => ({ default: () => 'РАЗДЕЛ-УПРАВЛЕНИЕ-ПРОДУКТОМ' }));
vi.mock('../components/admin/AdminIntegrationsView', () => ({ default: () => 'РАЗДЕЛ-ИНТЕГРАЦИИ' }));
vi.mock('../components/admin/AdminBlogView', () => ({ default: () => 'РАЗДЕЛ-БЛОГ' }));

import AdminPage from './AdminPage';

const published: AgentVersion = {
  id: 'version-1',
  agent_id: 7,
  version: 1,
  description: 'Опубликованное описание',
  system_prompt: 'Опубликованный промпт',
  status: 'published',
  base_version_id: null,
  created_by: 'admin@linkeon.io',
  created_at: '2026-01-01T10:00:00.000Z',
  published_at: '2026-01-01T11:00:00.000Z',
  published_by: 'admin@linkeon.io',
};

const RouteLink = () => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/chat')}>Открыть чат</button>;
};

let mounted: Mounted | undefined;

const goHistory = async (delta: number, expectedPathname: string) => {
  await actAsync(async () => {
    window.history.go(delta);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (window.location.pathname === expectedPathname) return;
    }
  });
  await flush();
};

const renderAdmin = async () => {
  mounted = mount(
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<><AdminPage /><RouteLink /></>} />
        <Route path="/chat" element={<div>РАЗДЕЛ-ЧАТ</div>} />
      </Routes>
    </BrowserRouter>,
  );
  await flush();
  await flush();
};

beforeEach(() => {
  window.history.replaceState({}, '', '/admin?tab=assistants');
  get.mockReset();
  state.mockReset();
  versions.mockReset();
  get.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [{ id: 7, name: 'Райя', description: 'Описание', system_prompt: 'Промпт' }],
  });
  state.mockResolvedValue({ published, draft: null });
  versions.mockResolvedValue([published]);
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  vi.restoreAllMocks();
});

describe('защита несохранённых правок в SPA', () => {
  it('отмена перехода на другую вкладку админки и на другой маршрут сохраняет редактор', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderAdmin();
    await clickAsync(byButton(mounted!.container, /^Райя$/));
    await flush();
    await flush();
    type(byLabel(mounted!.container, /Системный промпт/)!, 'Несохранённая правка');
    await flush();
    expect(visibleText(mounted!.container)).toContain('Есть несохранённые изменения');

    click(mounted!.container.querySelector('[data-testid="admin-tab-users"]')!);
    expect(confirm).toHaveBeenCalledOnce();
    expect(byLabel(mounted!.container, /Системный промпт/)?.value).toBe('Несохранённая правка');
    expect(visibleText(mounted!.container)).not.toContain('РАЗДЕЛ-ПОЛЬЗОВАТЕЛИ');

    click(byButton(mounted!.container, /Открыть чат/)!);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(byLabel(mounted!.container, /Системный промпт/)?.value).toBe('Несохранённая правка');
    expect(visibleText(mounted!.container)).not.toContain('РАЗДЕЛ-ЧАТ');
  });

  it('отмена Back восстанавливает позицию без потери destination, повторный Back подтверждается', async () => {
    window.history.replaceState({ idx: 0 }, '', '/chat');
    window.history.pushState({ idx: 1 }, '', '/admin?tab=assistants');
    const confirm = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await renderAdmin();
    await clickAsync(byButton(mounted!.container, /^Райя$/));
    await flush();
    type(byLabel(mounted!.container, /Системный промпт/)!, 'Несохранённая правка');
    await flush();

    await goHistory(-1, '/admin');
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/admin');
    expect(byLabel(mounted!.container, /Системный промпт/)?.value).toBe('Несохранённая правка');

    await goHistory(-1, '/chat');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe('/chat');
    expect(visibleText(mounted!.container)).toContain('РАЗДЕЛ-ЧАТ');
  });

  it('отмена Forward сохраняет destination, повторный Forward подтверждается', async () => {
    window.history.replaceState({ idx: 0 }, '', '/chat');
    window.history.pushState({ idx: 1 }, '', '/admin?tab=assistants');
    window.history.pushState({ idx: 2 }, '', '/chat');
    await goHistory(-1, '/admin');
    const confirm = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await renderAdmin();
    await clickAsync(byButton(mounted!.container, /^Райя$/));
    await flush();
    type(byLabel(mounted!.container, /Системный промпт/)!, 'Несохранённая правка');
    await flush();

    await goHistory(1, '/admin');
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/admin');
    expect(byLabel(mounted!.container, /Системный промпт/)?.value).toBe('Несохранённая правка');

    await goHistory(1, '/chat');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe('/chat');
    expect(visibleText(mounted!.container)).toContain('РАЗДЕЛ-ЧАТ');
  });

  it('подтверждённый уход очищает dirty: пустые Assistants и первый ассистент не спрашивают снова', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderAdmin();
    await clickAsync(byButton(mounted!.container, /^Райя$/));
    await flush();
    type(byLabel(mounted!.container, /Системный промпт/)!, 'Несохранённая правка');
    await flush();

    click(mounted!.container.querySelector('[data-testid="admin-tab-users"]')!);
    await flush();
    expect(confirm).toHaveBeenCalledOnce();
    expect(visibleText(mounted!.container)).toContain('РАЗДЕЛ-ПОЛЬЗОВАТЕЛИ');

    click(mounted!.container.querySelector('[data-testid="admin-tab-assistants"]')!);
    await flush();
    click(mounted!.container.querySelector('[data-testid="admin-tab-users"]')!);
    await flush();
    expect(confirm).toHaveBeenCalledOnce();

    click(mounted!.container.querySelector('[data-testid="admin-tab-assistants"]')!);
    await flush();
    await clickAsync(byButton(mounted!.container, /^Райя$/));
    expect(confirm).toHaveBeenCalledOnce();
  });
});
