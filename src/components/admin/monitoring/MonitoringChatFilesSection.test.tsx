// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount, visibleText } from '../../../test/dom';
import MonitoringChatFilesSection, { type ChatFilesStats } from './MonitoringChatFilesSection';

const STATS: ChatFilesStats = {
  panel: { opens: 5, users: 3 },
  downloads: { total: 4, byKind: { image: 2, document: 1, video: 0, audio: 1 } },
  findFiles: { calls: 6, withResults: 4, withStored: 3 },
  storage: { stored: 10, failed: 2, topFailReason: 'timeout', bucketObjects: 601, bucketBytes: 324009984 },
};

describe('MonitoringChatFilesSection', () => {
  it('рисует цифры панели, поиска и хранилища', () => {
    const text = visibleText(mount(<MonitoringChatFilesSection files={STATS} />).container);
    expect(text).toContain('Медиа и файлы');
    expect(text).toContain('людей 3');
    expect(text).toContain('картинки 2 · документы 1 · видео 0 · озвучка 1');
    expect(text).toContain('66.7%');
    expect(text).toContain('50.0%');
    expect(text).toContain('не удалось 2 · чаще всего: таймаут');
    expect(text).toContain('309 МБ');
    // Строго «файл», а не «файлов»: без границы после слова «601 файлов»
    // тоже прошёл бы, потому что начинается с той же подстроки.
    expect(text).toMatch(/601 файл(?![а-я])/);
  });

  it('MinIO не ответил — так и пишет', () => {
    const files = { ...STATS, storage: { ...STATS.storage, bucketObjects: null, bucketBytes: null } };
    expect(visibleText(mount(<MonitoringChatFilesSection files={files} />).container)).toContain('MinIO не ответил');
  });

  it('вызовов не было — проценты прочерком', () => {
    const files = { ...STATS, findFiles: { calls: 0, withResults: 0, withStored: 0 } };
    expect(visibleText(mount(<MonitoringChatFilesSection files={files} />).container)).toContain('—');
  });

  it.each([
    [601, 'файл'],
    [2, 'файла'],
    [5, 'файлов'],
    [11, 'файлов'],
  ])('bucketObjects=%i — склоняется «файл(а/ов)»: %s', (bucketObjects, word) => {
    const files = { ...STATS, storage: { ...STATS.storage, bucketObjects } };
    const text = visibleText(mount(<MonitoringChatFilesSection files={files} />).container);
    expect(text).toContain(`${bucketObjects} ${word}`);
  });

  it('бакет меньше 1 МБ — показывает КБ, а не округляет до «0 МБ»', () => {
    const files = { ...STATS, storage: { ...STATS.storage, bucketBytes: 2048 } };
    expect(visibleText(mount(<MonitoringChatFilesSection files={files} />).container)).toContain('2 КБ');
  });
});
