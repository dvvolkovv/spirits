// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { flush, mount, visibleText } from '../../../test/dom';
import MonitoringContentView from './MonitoringContentView';
import { apiClient } from '../../../services/apiClient';

vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
const api = vi.mocked(apiClient);

const overview = (files: unknown) => ({
  window: '30d', generatedAt: '2026-10-12T10:00:00.000Z', excludedUsers: [],
  images: { total: 0, uniqueUsers: 0, avgTokens: null },
  videos: { total: 0, completed: 0, failed: 0, inFlight: 0, successRatePct: null, avgWaitSeconds: null, avgTokens: null },
  dozvon: { total: 0, completed: 0, completionRatePct: null, avgDurationSec: null },
  files,
});

describe('MonitoringContentView: «Медиа и файлы»', () => {
  it('files: null — «нет данных», а не пустая секция', async () => {
    api.get.mockResolvedValue({ ok: true, json: async () => overview(null) } as any);
    const { container } = mount(<MonitoringContentView />);
    await flush(); await flush();
    expect(visibleText(container)).toContain('Нет данных: события не прочитались.');
  });

  it('старый бэк без files — секции нет', async () => {
    api.get.mockResolvedValue({ ok: true, json: async () => overview(undefined) } as any);
    const { container } = mount(<MonitoringContentView />);
    await flush(); await flush();
    expect(visibleText(container)).not.toContain('Медиа и файлы');
  });
});
