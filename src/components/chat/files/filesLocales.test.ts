import { describe, it, expect } from 'vitest';
import ru from '../../../i18n/locales/ru.json';
import en from '../../../i18n/locales/en.json';
import de from '../../../i18n/locales/de.json';
import es from '../../../i18n/locales/es.json';
import fr from '../../../i18n/locales/fr.json';
import pt from '../../../i18n/locales/pt.json';
import zh from '../../../i18n/locales/zh.json';

/** Ключи панели «Медиа и файлы». check-locales требует их везде, тест — ещё и без кириллицы вне ru. */
const KEYS = [
  'open', 'title', 'tab_media', 'tab_files', 'empty_media', 'empty_files', 'load_error', 'retry',
  'download', 'close', 'back', 'prev', 'next', 'unsaved', 'unsaved_hint', 'video', 'image',
  // Загрузки пользователя (спека 2026-11-16, раздел «Панель»): пометки
  // источника, удаление, подпись комментария ассистента.
  'uploaded_by_you', 'from_telegram', 'delete', 'delete_confirm', 'delete_failed', 'note_label',
];
const LOCALES: Record<string, any> = { ru, en, de, es, fr, pt, zh };

/**
 * Текст пустой вкладки «Файлы», каким он был до загрузок: только про файлы
 * ассистента. С загрузками в панели такой текст вводил бы в заблуждение,
 * поэтому каждый язык обязан его сменить.
 */
const EMPTY_FILES_BEFORE_UPLOADS: Record<string, string> = {
  ru: 'Здесь появятся файлы, которые создаст ассистент',
  en: 'Files the assistant creates will appear here',
  de: 'Hier erscheinen Dateien, die der Assistent erstellt',
  es: 'Aquí aparecerán los archivos que cree el asistente',
  fr: "Les fichiers créés par l'assistant apparaîtront ici",
  pt: 'Os ficheiros criados pelo assistente aparecerão aqui',
  zh: '助手创建的文件将显示在这里',
};

// Вежливое «Sie/Ihnen/Ihr» — с заглавной; «sie» со строчной — «она/они»
// (то же правило, что в src/i18n/localeRegister.test.ts).
const SIE = /\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/;

describe('тексты панели «Медиа и файлы»', () => {
  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name}: все ключи на месте`, () => {
      for (const k of KEYS) {
        const v = loc.chat?.files?.[k];
        expect(typeof v, `${name}: chat.files.${k}`).toBe('string');
        expect(v, `${name}: chat.files.${k}`).toBeTruthy();
        if (name !== 'ru') expect(v, `${name}: chat.files.${k}`).not.toMatch(/[Ѐ-ӿ]/);
      }
      expect(loc.chat.files.unsaved).toContain('{{n}}');
    });

    it(`${name}: пустая вкладка «Файлы» говорит и о загрузках пользователя`, () => {
      expect(loc.chat.files.empty_files).not.toBe(EMPTY_FILES_BEFORE_UPLOADS[name]);
    });
  }

  it('ru: тексты загрузок — как в спеке («…и которые вы загрузите», ассистенты больше не откроют)', () => {
    expect(ru.chat.files).toMatchObject({
      empty_files: 'Здесь появятся файлы, которые создаст ассистент и которые вы загрузите',
      uploaded_by_you: 'Загрузили вы',
      from_telegram: 'Из Telegram',
      delete: 'Удалить',
      delete_confirm: 'Удалить файл? Ассистенты больше не смогут его открыть.',
      delete_failed: 'Не удалось удалить файл. Попробуйте ещё раз.',
      note_label: 'Комментарий ассистента',
    });
  });

  it('de: панель обращается на «du», без «Sie»', () => {
    expect(Object.entries(de.chat.files).filter(([, v]) => SIE.test(String(v))).map(([k]) => k)).toEqual([]);
  });

  // pt.json — европейский португальский (pt-PT) во всём остальном файле
  // («ficheiro», «Descarregar», «Seguinte», «Eliminar»). Первая редакция
  // chat.files.* была бразильской («arquivo», «Baixar», «Próximo»); здесь это
  // закреплено, чтобы не вернулось при следующей правке локали. Регистр —
  // формальное третье лицо, как у соседних строк («Tente novamente», «por si»).
  it('pt: европейский вариант (ficheiro/Descarregar/Seguinte/Eliminar), не бразильский', () => {
    expect(pt.chat.files).toEqual({
      open: 'Multimédia e ficheiros',
      title: 'Multimédia e ficheiros',
      tab_media: 'Multimédia',
      tab_files: 'Ficheiros',
      empty_media: 'As imagens e os vídeos desta conversa aparecerão aqui',
      empty_files: 'Os ficheiros criados pelo assistente e os que carregar aparecerão aqui',
      load_error: 'Não foi possível carregar',
      retry: 'Tentar novamente',
      download: 'Descarregar',
      close: 'Fechar',
      back: 'Voltar',
      prev: 'Anterior',
      next: 'Seguinte',
      unsaved: 'Não guardados: {{n}}',
      unsaved_hint: 'O ficheiro estava num servidor temporário e foi eliminado',
      video: 'Vídeo',
      image: 'Imagem',
      uploaded_by_you: 'Carregado por si',
      from_telegram: 'Do Telegram',
      delete: 'Eliminar',
      delete_confirm: 'Eliminar o ficheiro? Os assistentes deixarão de poder abri-lo.',
      delete_failed: 'Não foi possível eliminar o ficheiro. Tente novamente.',
      note_label: 'Comentário do assistente',
    });
  });
});
