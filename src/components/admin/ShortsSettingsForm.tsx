import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Loader } from 'lucide-react';
import { SLOT_DAYS } from './blogStatus';
import { callShorts } from './shortsApi';
import {
  PLATFORM_TITLES, SETTINGS_PLATFORMS, SettingsDraft, ShortFormat, ShortSettings, YOUTUBE_MODE_TITLES,
  draftErrors, draftToPatch, toDraft,
} from './shortStatus';

const FORMAT_BUTTONS: { value: ShortFormat; label: string }[] = [
  { value: 'skit', label: 'Сценки' },
  { value: 'chat', label: 'Только чат' },
];
const FIELD = 'mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500';
const pill = (on: boolean) =>
  clsx(
    'px-3 py-1.5 text-sm font-medium rounded-md border transition-colors',
    on ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-600 border-gray-300 hover:border-forest-300',
  );
const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const Hint: React.FC<{ text?: string }> = ({ text }) =>
  text ? <span className="mt-1 block text-xs text-rose-600">{text}</span> : null;

const CHANNEL_WARNING =
  'Канал не задан — пост в Telegram не выйдет, а YouTube грузится только после поста: ролик упадёт в момент слота.';

/**
 * Настройки роликов (`get_settings` / `update_settings`). Режим YouTube только
 * показан: включить загрузку можно лишь командой /youtube в боте (спека
 * YouTube, бэк иное отклоняет), а отсюда — только аварийный перевод в ручной.
 */
const ShortsSettingsForm: React.FC = () => {
  const [saved, setSaved] = useState<ShortSettings | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Не отвечаем setState'ом размонтированному компоненту: загрузку можно
  // перезапустить вручную («Повторить»), и её промис может дожить до ухода с
  // экрана. Флаг поднимается явно при каждом монтировании эффекта — иначе
  // StrictMode (эффект → снятие → эффект в dev) гасит его на снятии и никогда
  // не возвращает на повторном монтировании: обе ответа get_settings тихо
  // отбрасываются, и форма зависает на «Загружаю настройки…» (см. aliveRef в
  // ProductActionCard.tsx).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const apply = (s: ShortSettings) => {
    setSaved(s);
    setDraft(toDraft(s));
  };

  /** Общая загрузка — и при монтировании, и по кнопке «Повторить» после сбоя. */
  const load = () => {
    setBusy(true);
    setError(null);
    return callShorts<ShortSettings>({ action: 'get_settings' })
      .then((s) => {
        if (alive.current) apply(s);
      })
      .catch((e: unknown) => {
        if (alive.current) {
          setError(`Не загрузил настройки: ${e instanceof Error && e.message ? e.message : 'неизвестная ошибка'}`);
        }
      })
      .finally(() => {
        if (alive.current) setBusy(false);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * `keepDraft` — для аварийного перевода YouTube в ручной: меняется только
   * режим, а несохранённую правку остальных полей терять незачем. Без флага
   * `apply` пересобрал бы черновик из ответа сервера и стёр бы её.
   */
  const save = async (settings: Partial<ShortSettings>, done: string, keepDraft = false) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const s = await callShorts<ShortSettings>({ action: 'update_settings', settings });
      if (keepDraft) setSaved(s); else apply(s);
      setNotice(done);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'неизвестная ошибка');
    } finally {
      setBusy(false);
    }
  };

  if (!draft || !saved) {
    return (
      <div data-testid="shorts-settings" className="mb-4 bg-white border border-gray-200 rounded-lg p-4 text-sm">
        {error ? (
          <div data-testid="shorts-settings-error" role="alert" className="flex items-center gap-2 text-rose-700">
            <span>{error}</span>
            <button
              type="button"
              data-testid="shorts-settings-retry"
              onClick={load}
              disabled={busy}
              className="px-2 py-0.5 text-xs font-medium rounded border border-rose-300 bg-white hover:bg-rose-100 disabled:opacity-50"
            >
              Повторить
            </button>
          </div>
        ) : (
          <span className="flex items-center gap-2 text-gray-500">
            <Loader className="w-4 h-4 animate-spin" />
            Загружаю настройки…
          </span>
        )}
      </div>
    );
  }

  const errors = draftErrors(draft);
  const valid = Object.keys(errors).length === 0;
  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => {
    setDraft({ ...draft, [key]: value });
    // Правка поля делает прежнее уведомление/ошибку неактуальными.
    setNotice(null);
    setError(null);
  };
  const toManual = () => {
    const ask =
      'Перевести YouTube в ручной режим? Ролики перестанут загружаться сами — в личку будет приходить набор для выкладки. ' +
      'Включить загрузку снова — командой /youtube в боте.';
    if (window.confirm(ask)) save({ youtubeMode: 'manual' }, 'YouTube переведён в ручной режим', true);
  };
  const channelWarning = draft.platforms.includes('telegram') && !draft.tgChannelChatId.trim();

  return (
    <div data-testid="shorts-settings" className="mb-4 space-y-4 max-w-lg bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-medium text-gray-700">Настройки роликов</div>

      {/*
        min-w-0: у fieldset в браузерах по умолчанию интринсик min-width
        (min-content) — без сброса он мог бы раздвинуть max-w-lg карточки.
        disabled={busy}: пока идёт сохранение, ответ сервера перезапишет
        черновик — редактировать в это окно нечего, да и опасно.
      */}
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div className="text-sm">
          <span className="text-gray-600">Дни слотов</span>
          <div role="group" aria-label="Дни слотов" className="mt-1 flex flex-wrap gap-1.5">
            {SLOT_DAYS.map((d) => {
              const on = draft.slotDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  data-testid={`shorts-day-${d.value}`}
                  aria-pressed={on}
                  onClick={() => set('slotDays', toggleIn(draft.slotDays, d.value))}
                  className={clsx(
                    'w-11 py-1.5 text-sm font-medium rounded-md border transition-colors',
                    on ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-600 border-gray-300 hover:border-forest-300',
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          <Hint text={errors.slotDays} />
        </div>

        <label className="block text-sm">
          <span className="text-gray-600">Час слота по Москве</span>
          <input data-testid="shorts-hour" type="number" min={0} max={23} step={1} value={draft.slotHourMsk}
            aria-invalid={!!errors.slotHourMsk}
            onChange={(e) => set('slotHourMsk', e.target.value)} className={FIELD} />
          <Hint text={errors.slotHourMsk} />
        </label>

        <div className="text-sm">
          <span className="text-gray-600">Формат новых роликов</span>
          <div role="group" aria-label="Формат новых роликов" className="mt-1 flex gap-1.5">
            {FORMAT_BUTTONS.map((f) => (
              <button key={f.value} type="button" data-testid={`shorts-format-${f.value}`} aria-pressed={draft.format === f.value}
                onClick={() => set('format', f.value)} className={pill(draft.format === f.value)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-sm">
          <span className="text-gray-600">Площадки</span>
          <div role="group" aria-label="Площадки" className="mt-1 flex gap-1.5">
            {SETTINGS_PLATFORMS.map((p) => (
              <button key={p} type="button" data-testid={`shorts-platform-${p}`} aria-pressed={draft.platforms.includes(p)}
                onClick={() => set('platforms', toggleIn(draft.platforms, p))} className={pill(draft.platforms.includes(p))}>
                {PLATFORM_TITLES[p]}
              </button>
            ))}
          </div>
          <Hint text={errors.platforms} />
        </div>

        <label className="block text-sm">
          <span className="text-gray-600">Предел секунд Omni на ролик (клип — 8 с)</span>
          <input data-testid="shorts-max-omni" type="number" min={8} max={400} step={8} value={draft.maxOmniSeconds}
            aria-invalid={!!errors.maxOmniSeconds}
            onChange={(e) => set('maxOmniSeconds', e.target.value)} className={FIELD} />
          <Hint text={errors.maxOmniSeconds} />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Голос финала (SpeechKit)</span>
          <input data-testid="shorts-voice" value={draft.narratorVoice}
            aria-invalid={!!errors.narratorVoice}
            onChange={(e) => set('narratorVoice', e.target.value)} className={FIELD} />
          <Hint text={errors.narratorVoice} />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Порог длины ответа ассистента, знаков</span>
          <input data-testid="shorts-min-answer" type="number" min={100} max={5000} step={1} value={draft.minAnswerChars}
            aria-invalid={!!errors.minAnswerChars}
            onChange={(e) => set('minAnswerChars', e.target.value)} className={FIELD} />
          <Hint text={errors.minAnswerChars} />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Готовить ролик за, часов до слота</span>
          <input data-testid="shorts-lead" type="number" min={1} max={96} step={1} value={draft.prepareLeadHours}
            aria-invalid={!!errors.prepareLeadHours}
            onChange={(e) => set('prepareLeadHours', e.target.value)} className={FIELD} />
          <Hint text={errors.prepareLeadHours} />
        </label>

        <label className="block text-sm">
          <span className="text-gray-600">Канал Telegram (id вида -100…)</span>
          <input data-testid="shorts-channel" value={draft.tgChannelChatId}
            aria-invalid={!!errors.tgChannelChatId}
            onChange={(e) => set('tgChannelChatId', e.target.value)} className={FIELD} />
          <Hint text={errors.tgChannelChatId} />
          {channelWarning && (
            <span data-testid="shorts-channel-warning" className="mt-1 block text-xs text-amber-700">
              {CHANNEL_WARNING}
            </span>
          )}
        </label>
      </fieldset>

      <div className="text-sm">
        <span className="text-gray-600">YouTube: </span>
        <span data-testid="shorts-youtube-mode" className="font-medium">{YOUTUBE_MODE_TITLES[saved.youtubeMode]}</span>
        <span className="block text-xs text-gray-500">
          {saved.youtubeMode === 'manual'
            ? 'Включить загрузку — командой /youtube в боте.'
            : 'Сменить доступ — командой /youtube в боте.'}
        </span>
        {saved.youtubeMode !== 'manual' && (
          <button type="button" data-testid="shorts-youtube-manual" onClick={toManual} disabled={busy}
            className="mt-1 px-3 py-1 text-xs bg-rose-50 text-rose-700 rounded hover:bg-rose-100 disabled:opacity-50">
            Перевести в ручной
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" data-testid="shorts-save-settings" onClick={() => save(draftToPatch(draft), 'Настройки сохранены')}
          disabled={busy || !valid}
          className="px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-md hover:bg-forest-700 disabled:opacity-50">
          Сохранить
        </button>
        {notice && <span data-testid="shorts-settings-notice" role="status" className="text-sm text-green-700">{notice}</span>}
      </div>
      {error && <div data-testid="shorts-settings-error" role="alert" className="text-sm text-rose-700">{error}</div>}
    </div>
  );
};

export default ShortsSettingsForm;
