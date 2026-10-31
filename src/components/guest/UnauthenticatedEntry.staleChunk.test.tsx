// src/components/guest/UnauthenticatedEntry.staleChunk.test.tsx
//
// C2 (Critical, ревью качества B9-fix): протухший index.html после выката
// (старый хеш чанка в закэшированной странице у человека) делает
// динамический import() ленивого GuestChatPage отклонённым промисом — без
// обработки это необработанное исключение внутри React.lazy и белый экран
// на самом массовом входе сайта.
//
// Юнит-тест самого хелпера, а не полный монтаж UnauthenticatedEntry с
// vi.mock('./GuestChatPage', () => { throw ... }): эмпирически проверено —
// бросок внутри фабрики vi.mock перехватывается самим Vitest как ЕГО
// собственная ошибка мокинга («There was an error when mocking a module»), а
// не превращается в обычный rejected import() — .catch() тогда не успевает
// сработать вовсе, и тест красный по ЧУЖОЙ причине, не по отсутствию фикса.
// Здесь загрузчику передаётся настоящий отклонённый промис напрямую, без
// обвязки import()/vi.mock — так тестируется именно обработка отказа.
import { describe, expect, it } from 'vitest';
import type { ComponentType } from 'react';
import { withChunkFailureFallback } from './UnauthenticatedEntry';

describe('C2: отказ ленивого чанка пробы', () => {
  it('отклонённый импорт — запасной модуль, а не брошенное исключение', async () => {
    const fallback = 'fallback-marker' as unknown as ComponentType;
    const loader = withChunkFailureFallback(
      () => Promise.reject(new Error('ChunkLoadError: протухший хеш чанка')),
      fallback,
    );
    await expect(loader()).resolves.toEqual({ default: fallback });
  });

  it('успешный импорт — отдаётся как есть, .catch() не подмешивается', async () => {
    const real = { default: 'real-module-marker' as unknown as ComponentType };
    const loader = withChunkFailureFallback(() => Promise.resolve(real), 'fallback-marker' as unknown as ComponentType);
    await expect(loader()).resolves.toEqual(real);
  });
});
