import React, { useEffect, useState } from 'react';
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

  const apply = (s: ShortSettings) => {
    setSaved(s);
    setDraft(toDraft(s));
  };

  useEffect(() => {
    let alive = true;
    callShorts<ShortSettings>({ action: 'get_settings' })
      .then((s) => {
        if (alive) apply(s);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error && e.message ? e.message : 'не загрузил настройки');
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async (settings: object, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await callShorts<ShortSettings>({ action: 'update_settings', settings }));
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
          <span className="text-rose-700">{error}</span>
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
  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => setDraft({ ...draft, [key]: value });
  const toManual = () => {
    const ask =
      'Перевести YouTube в ручной режим? Ролики перестанут загружаться сами — в личку будет приходить набор для выкладки. ' +
      'Включить загрузку снова — командой /youtube в боте.';
    if (window.confirm(ask)) save({ youtubeMode: 'manual' }, 'YouTube переведён в ручной режим');
  };

  return (
    <div data-testid="shorts-settings" className="mb-4 space-y-4 max-w-lg bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-medium text-gray-700">Настройки роликов</div>

      <div className="text-sm">
        <span className="text-gray-600">Дни слотов</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
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
          onChange={(e) => set('slotHourMsk', e.target.value)} className={FIELD} />
        <Hint text={errors.slotHourMsk} />
      </label>

      <div className="text-sm">
        <span className="text-gray-600">Формат новых роликов</span>
        <div className="mt-1 flex gap-1.5">
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
        <div className="mt-1 flex gap-1.5">
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
          onChange={(e) => set('maxOmniSeconds', e.target.value)} className={FIELD} />
        <Hint text={errors.maxOmniSeconds} />
      </label>

      <label className="block text-sm">
        <span className="text-gray-600">Голос финала (SpeechKit)</span>
        <input data-testid="shorts-voice" value={draft.narratorVoice}
          onChange={(e) => set('narratorVoice', e.target.value)} className={FIELD} />
        <Hint text={errors.narratorVoice} />
      </label>

      <label className="block text-sm">
        <span className="text-gray-600">Порог длины ответа ассистента, знаков</span>
        <input data-testid="shorts-min-answer" type="number" min={100} max={5000} step={50} value={draft.minAnswerChars}
          onChange={(e) => set('minAnswerChars', e.target.value)} className={FIELD} />
        <Hint text={errors.minAnswerChars} />
      </label>

      <label className="block text-sm">
        <span className="text-gray-600">Готовить ролик за, часов до слота</span>
        <input data-testid="shorts-lead" type="number" min={1} max={96} step={1} value={draft.prepareLeadHours}
          onChange={(e) => set('prepareLeadHours', e.target.value)} className={FIELD} />
        <Hint text={errors.prepareLeadHours} />
      </label>

      <label className="block text-sm">
        <span className="text-gray-600">Канал Telegram (id вида -100…)</span>
        <input data-testid="shorts-channel" value={draft.tgChannelChatId}
          onChange={(e) => set('tgChannelChatId', e.target.value)} className={FIELD} />
        <Hint text={errors.tgChannelChatId} />
      </label>

      <div className="text-sm">
        <span className="text-gray-600">YouTube: </span>
        <span data-testid="shorts-youtube-mode" className="font-medium">{YOUTUBE_MODE_TITLES[saved.youtubeMode]}</span>
        <span className="block text-xs text-gray-500">Включить загрузку — командой /youtube в боте.</span>
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
        {notice && <span data-testid="shorts-settings-notice" className="text-sm text-green-700">{notice}</span>}
      </div>
      {error && <div data-testid="shorts-settings-error" className="text-sm text-rose-700">{error}</div>}
    </div>
  );
};

export default ShortsSettingsForm;
