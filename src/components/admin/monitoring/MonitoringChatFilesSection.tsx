import React from 'react';
import { Download, FolderOpen, HardDrive, Search } from 'lucide-react';
import Stat from './Stat';

/** Блок files из GET /webhook/admin/monitoring/product/content (spirits_back: chat-files-stats.ts). */
export interface ChatFilesStats {
  panel: { opens: number; users: number };
  downloads: { total: number; byKind: Record<'image' | 'document' | 'video' | 'audio', number> };
  findFiles: { calls: number; withResults: number; withStored: number };
  storage: {
    stored: number;
    failed: number;
    topFailReason: string | null;
    bucketObjects: number | null;
    bucketBytes: number | null;
  };
}

const REASON_LABEL: Record<string, string> = {
  timeout: 'таймаут',
  access_denied: 'нет прав в MinIO',
  too_large: 'слишком большой',
  not_found: 'файла нет на релее',
  other: 'прочее',
};

const fmtNum = (n: number) => n.toLocaleString('ru-RU');
const pctOf = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');
const fmtBytes = (b: number | null) => {
  if (b === null) return '—';
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} ГБ`;
  return `${Math.round(b / 1024 ** 2)} МБ`;
};

const MonitoringChatFilesSection: React.FC<{ files: ChatFilesStats }> = ({ files }) => {
  const { panel, downloads, findFiles, storage } = files;
  const k = downloads.byKind;
  const top = storage.topFailReason ? ` · чаще всего: ${REASON_LABEL[storage.topFailReason] ?? storage.topFailReason}` : '';
  return (
    <section>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Медиа и файлы</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<FolderOpen className="w-3.5 h-3.5" />} label="Открытий панели" value={fmtNum(panel.opens)} sub={`людей ${panel.users}`} />
        <Stat icon={<Download className="w-3.5 h-3.5" />} label="Скачиваний" value={fmtNum(downloads.total)}
          sub={`картинки ${k.image} · документы ${k.document} · видео ${k.video} · озвучка ${k.audio}`} />
        <Stat icon={<Search className="w-3.5 h-3.5" />} label="Поиск файлов ассистентом" value={fmtNum(findFiles.calls)}
          sub={`нашлось что-то: ${pctOf(findFiles.withResults, findFiles.calls)} · можно скачать: ${pctOf(findFiles.withStored, findFiles.calls)}`} />
        <Stat icon={<HardDrive className="w-3.5 h-3.5" />} label="Сохранено файлов" value={fmtNum(storage.stored)}
          sub={`не удалось ${storage.failed}${top}`} />
        <Stat icon={<HardDrive className="w-3.5 h-3.5" />} label="Бакет linkeon-chat-files" value={fmtBytes(storage.bucketBytes)}
          sub={storage.bucketObjects === null ? 'MinIO не ответил' : `${fmtNum(storage.bucketObjects)} файл(ов)`} />
      </div>
    </section>
  );
};

export default MonitoringChatFilesSection;
