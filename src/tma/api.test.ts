import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getJson, postJson, putForm, getBlob, postStream } from './api';
import { apiClient } from '../services/apiClient';

function resp(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

beforeEach(() => vi.restoreAllMocks());

describe('getJson', () => {
  it('разбирает тело успешного ответа', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(resp(200, { tokens: 42 }));
    expect(await getJson('/webhook/user/tokens/')).toEqual({ tokens: 42 });
  });

  it('бросает на неуспешном статусе', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(resp(500, {}));
    await expect(getJson('/x')).rejects.toThrow('HTTP 500');
  });

  it('бросает, если тело не JSON', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new Error('bad json'); },
    } as any);
    await expect(getJson('/x')).rejects.toThrow();
  });
});

describe('postJson', () => {
  it('передаёт тело и разбирает ответ', async () => {
    const spy = vi.spyOn(apiClient, 'post').mockResolvedValue(resp(200, { ok: true }));
    expect(await postJson('/webhook/change-agent', { agent_id: 'a' })).toEqual({ ok: true });
    expect(spy).toHaveBeenCalledWith('/webhook/change-agent', { agent_id: 'a' });
  });
});

describe('putForm', () => {
  it('шлёт FormData через request, а не через put', async () => {
    // apiClient.put жёстко ставит Content-Type: application/json и делает
    // JSON.stringify — FormData через него не проходит.
    const spy = vi.spyOn(apiClient, 'request').mockResolvedValue(resp(200, { ok: true }));
    const fd = new FormData();
    await putForm('/webhook/avatar', fd);
    expect(spy).toHaveBeenCalledWith('/webhook/avatar', { method: 'PUT', body: fd });
  });
});

describe('getBlob', () => {
  // /webhook/avatar отдаёт либо байты картинки, либо 204 без тела — не JSON.
  it('возвращает blob на успешном ответе', async () => {
    const blob = new Blob(['x']);
    vi.spyOn(apiClient, 'get').mockResolvedValue({ ok: true, status: 200, blob: async () => blob } as any);
    expect(await getBlob('/webhook/avatar')).toBe(blob);
  });

  it('возвращает null на 204 (аватар не выставлен)', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ ok: true, status: 204, blob: async () => { throw new Error('no body'); } } as any);
    expect(await getBlob('/webhook/avatar')).toBeNull();
  });

  it('возвращает null на неуспешном статусе, не бросает', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ ok: false, status: 500, blob: async () => { throw new Error('x'); } } as any);
    expect(await getBlob('/webhook/avatar')).toBeNull();
  });
});

/** Ответ, тело которого приходит указанными кусками. */
function streamResp(status: number, chunks: string[]) {
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true },
      }),
    },
  } as unknown as Response;
}

describe('postStream', () => {
  it('отдаёт объекты по мере чтения', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(
      streamResp(200, ['{"n":1}\n{"n":2}\n', '{"n":3}\n']),
    );
    const got: any[] = [];
    await postStream('/webhook/search-mate', { query: 'x' }, (i) => got.push(i));
    expect(got).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it('объект, разорванный между чтениями, собирается целиком', async () => {
    // Ради этого и нужен буфер: кусок чтения почти всегда обрывается на
    // половине строки, и наивный разбор потерял бы такой объект.
    vi.spyOn(apiClient, 'post').mockResolvedValue(
      streamResp(200, ['{"name":"Ма', 'рия","age":30}\n']),
    );
    const got: any[] = [];
    await postStream('/x', {}, (i) => got.push(i));
    expect(got).toEqual([{ name: 'Мария', age: 30 }]);
  });

  it('хвост без перевода строки — тоже результат', async () => {
    // Последний объект выдачи приходит без завершающего \n.
    vi.spyOn(apiClient, 'post').mockResolvedValue(streamResp(200, ['{"a":1}\n{"b":2}']));
    const got: any[] = [];
    await postStream('/x', {}, (i) => got.push(i));
    expect(got).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('битая строка не рвёт выдачу', async () => {
    // Один испорченный элемент не повод терять остальные.
    vi.spyOn(apiClient, 'post').mockResolvedValue(
      streamResp(200, ['{"a":1}\nне json\n{"b":2}\n']),
    );
    const got: any[] = [];
    await postStream('/x', {}, (i) => got.push(i));
    expect(got).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('пустые строки пропускаются', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(streamResp(200, ['{"a":1}\n\n\n{"b":2}\n']));
    const got: any[] = [];
    await postStream('/x', {}, (i) => got.push(i));
    expect(got).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('неуспешный статус — исключение, как у остальных хелперов', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(streamResp(500, []));
    await expect(postStream('/x', {}, () => {})).rejects.toThrow('HTTP 500');
  });

  it('ответ без тела — пустая выдача, а не сбой', async () => {
    // Экран покажет «никого не нашлось», а не красное сообщение об ошибке.
    vi.spyOn(apiClient, 'post').mockResolvedValue({ ok: true, status: 200 } as Response);
    const got: any[] = [];
    await expect(postStream('/x', {}, (i) => got.push(i))).resolves.toBeUndefined();
    expect(got).toEqual([]);
  });
});
