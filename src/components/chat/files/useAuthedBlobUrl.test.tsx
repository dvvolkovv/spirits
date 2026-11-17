// src/components/chat/files/useAuthedBlobUrl.test.tsx
// @vitest-environment jsdom
//
// Приватные загрузки (/webhook/chat-uploads/:id и …/thumb) отдаются только
// владельцу по JWT, а <img src> заголовок Authorization не шлёт. Хук забирает
// байты через apiClient и отдаёт blob:-адрес. Здесь проверяется, что адрес
// появляется только после ответа, не появляется при ошибке и всегда
// отзывается.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flush, actAsync } from '../../../test/dom';
import { apiClient } from '../../../services/apiClient';
import { useAuthedBlob, useAuthedBlobUrl } from './useAuthedBlobUrl';

vi.mock('../../../services/apiClient', () => ({ apiClient: { get: vi.fn() } }));
const api = vi.mocked(apiClient);

function Probe({ path, enabled }: { path?: string; enabled?: boolean }) {
  const src = useAuthedBlobUrl(path, enabled);
  return <span data-testid="probe" data-src={src ?? ''} />;
}
const srcOf = (c: HTMLElement) => c.querySelector('[data-testid="probe"]')!.getAttribute('data-src');

function FailProbe({ path }: { path?: string }) {
  const { url, failed } = useAuthedBlob(path);
  return <span data-testid="fail-probe" data-src={url ?? ''} data-failed={String(failed)} />;
}
const failedOf = (c: HTMLElement) => c.querySelector('[data-testid="fail-probe"]')!.getAttribute('data-failed');
const blobRes = () => ({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/webp' }) }) as any;
const settle = async () => { await flush(); await flush(); };

/** Ответ, который приходит по команде теста: так ловится состояние «файл ещё едет». */
function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const THUMB = '/webhook/chat-uploads/11111111-1111-4111-8111-111111111111/thumb';
const OTHER = '/webhook/chat-uploads/22222222-2222-4222-8222-222222222222/thumb';

let created = 0;
beforeEach(() => {
  vi.clearAllMocks();
  created = 0;
  // jsdom не реализует object URL (как в uploadMemory.test.tsx).
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => `blob:mock-${++created}`);
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
});

describe('useAuthedBlobUrl', () => {
  it('пока файл едет — пусто; после ответа — blob-адрес; запрос идёт через apiClient (он ставит Bearer)', async () => {
    const d = deferred();
    api.get.mockReturnValue(d.promise as any);
    const { container } = mount(<Probe path={THUMB} />);
    expect(srcOf(container)).toBe('');
    expect(api.get).toHaveBeenCalledWith(THUMB, expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await actAsync(() => { d.resolve(blobRes()); });
    await settle();
    expect(srcOf(container)).toBe('blob:mock-1');
  });

  it('ответ не 2xx (чужой или удалённый файл — 404) — пусто, blob-адрес не создаётся', async () => {
    api.get.mockResolvedValue({ ok: false, status: 404, blob: vi.fn() } as any);
    const { container } = mount(<Probe path={THUMB} />);
    await settle();
    expect(srcOf(container)).toBe('');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('сеть упала — пусто, исключение наружу не выходит', async () => {
    api.get.mockRejectedValue(new Error('network'));
    const { container } = mount(<Probe path={THUMB} />);
    await settle();
    expect(srcOf(container)).toBe('');
  });

  it('без адреса или с enabled=false — запроса нет', async () => {
    const a = mount(<Probe path={undefined} />);
    const b = mount(<Probe path={THUMB} enabled={false} />);
    await settle();
    expect(api.get).not.toHaveBeenCalled();
    expect(srcOf(a.container)).toBe('');
    expect(srcOf(b.container)).toBe('');
  });

  it('смена адреса отзывает прежний blob и не показывает его, пока едет новый', async () => {
    api.get.mockResolvedValueOnce(blobRes());
    const { container, rerender } = mount(<Probe path={THUMB} />);
    await settle();
    expect(srcOf(container)).toBe('blob:mock-1');

    const d = deferred();
    api.get.mockReturnValueOnce(d.promise as any);
    rerender(<Probe path={OTHER} />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
    expect(srcOf(container)).toBe('');

    await actAsync(() => { d.resolve(blobRes()); });
    await settle();
    expect(srcOf(container)).toBe('blob:mock-2');
  });

  it('размонтирование отзывает blob-адрес', async () => {
    api.get.mockResolvedValue(blobRes());
    const { container, unmount } = mount(<Probe path={THUMB} />);
    await settle();
    expect(srcOf(container)).toBe('blob:mock-1');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
  });

  it('ответ после размонтирования: запрос отменён, blob-адрес не создаётся (утекать нечему)', async () => {
    const d = deferred();
    api.get.mockReturnValue(d.promise as any);
    const { unmount } = mount(<Probe path={THUMB} />);
    const signal = (api.get.mock.calls[0][1] as { signal: AbortSignal }).signal;
    unmount();
    expect(signal.aborted).toBe(true);

    await actAsync(() => { d.resolve(blobRes()); });
    await settle();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

// Просмотр должен отличать «ещё едет» от «не загрузится»: иначе при 404 или
// обрыве сети вместо значка и «Скачать» бесконечно крутится индикатор.
describe('useAuthedBlob — признак неудачи', () => {
  it('пока едет и после успеха — не failed', async () => {
    const d = deferred();
    api.get.mockReturnValue(d.promise as any);
    const { container } = mount(<FailProbe path={THUMB} />);
    expect(failedOf(container)).toBe('false');
    await actAsync(() => { d.resolve(blobRes()); });
    await settle();
    expect(failedOf(container)).toBe('false');
    expect(container.querySelector('[data-testid="fail-probe"]')!.getAttribute('data-src')).toBe('blob:mock-1');
  });

  it('ответ не 2xx (404) — failed', async () => {
    api.get.mockResolvedValue({ ok: false, status: 404, blob: vi.fn() } as any);
    const { container } = mount(<FailProbe path={THUMB} />);
    await settle();
    expect(failedOf(container)).toBe('true');
  });

  it('сеть упала — failed', async () => {
    api.get.mockRejectedValue(new Error('network'));
    const { container } = mount(<FailProbe path={THUMB} />);
    await settle();
    expect(failedOf(container)).toBe('true');
  });

  it('смена адреса сбрасывает failed; сбой отменённого прежнего запроса новый не помечает', async () => {
    api.get.mockResolvedValueOnce({ ok: false, status: 404, blob: vi.fn() } as any);
    const { container, rerender } = mount(<FailProbe path={THUMB} />);
    await settle();
    expect(failedOf(container)).toBe('true');

    const d = deferred();
    api.get.mockReturnValueOnce(d.promise as any);
    rerender(<FailProbe path={OTHER} />);
    await settle();
    expect(failedOf(container)).toBe('false');

    // Прежний запрос OTHER отменяется сменой на THUMB и падает уже отменённым.
    const again = deferred();
    api.get.mockReturnValueOnce(again.promise as any);
    rerender(<FailProbe path={THUMB} />);
    await actAsync(() => { d.resolve({ ok: false, status: 500, blob: vi.fn() }); });
    await settle();
    expect(failedOf(container)).toBe('false');

    await actAsync(() => { again.resolve(blobRes()); });
    await settle();
    expect(failedOf(container)).toBe('false');
  });
});

// Очередь общая на модуль: каждый тест ниже отвечает на все свои запросы,
// иначе занятые места перешли бы в следующий тест.
describe('useAuthedBlobUrl — не больше 6 запросов разом', () => {
  const path = (i: number) => `/webhook/chat-uploads/p${i}/thumb`;
  const probes = (from: number, to: number) => (
    <>
      {Array.from({ length: to - from }, (_, i) => (
        <Probe key={from + i} path={path(from + i)} />
      ))}
    </>
  );
  const allSrc = (c: HTMLElement) =>
    Array.from(c.querySelectorAll('[data-testid="probe"]')).map((e) => e.getAttribute('data-src') ?? '');

  it('10 превью разом: в полёте не больше 6, после ответов адрес получают все 10', async () => {
    const pending: ReturnType<typeof deferred>[] = [];
    let inFlight = 0;
    let peak = 0;
    api.get.mockImplementation((() => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const d = deferred();
      pending.push(d);
      return d.promise.then((v) => { inFlight -= 1; return v; });
    }) as any);

    const { container } = mount(probes(0, 10));
    await settle();
    expect(api.get).toHaveBeenCalledTimes(6);

    while (pending.length > 0) {
      const d = pending.shift()!;
      await actAsync(() => { d.resolve(blobRes()); });
      await settle();
      await settle();
    }
    expect(api.get).toHaveBeenCalledTimes(10);
    expect(peak).toBeLessThanOrEqual(6);
    expect(allSrc(container).every((s) => s.startsWith('blob:'))).toBe(true);
  });

  it('превью ушло, не дождавшись очереди, — его запрос не шлётся и место не занимает', async () => {
    const pending: ReturnType<typeof deferred>[] = [];
    api.get.mockImplementation((() => {
      const d = deferred();
      pending.push(d);
      return d.promise;
    }) as any);

    mount(probes(0, 6));
    const queued = mount(<Probe path={path(6)} />);
    await settle();
    expect(api.get).toHaveBeenCalledTimes(6);
    queued.unmount();

    // Одно место освободилось — ждущих нет, запрос ушедшей плитки не стартует.
    await actAsync(() => { pending[0].resolve(blobRes()); });
    await settle();
    await settle();
    expect(api.get).toHaveBeenCalledTimes(6);
    expect(api.get).not.toHaveBeenCalledWith(path(6), expect.anything());

    // А свободное место достаётся новой плитке сразу.
    mount(<Probe path={path(7)} />);
    expect(api.get).toHaveBeenCalledTimes(7);
    expect(api.get).toHaveBeenLastCalledWith(path(7), expect.anything());

    for (const d of pending.slice(1)) await actAsync(() => { d.resolve(blobRes()); });
    await settle();
    await settle();
  });

  it('ошибка запроса тоже освобождает место', async () => {
    api.get.mockRejectedValue(new Error('network'));
    mount(probes(0, 7));
    await settle();
    await settle();
    expect(api.get).toHaveBeenCalledTimes(7);
  });
});
