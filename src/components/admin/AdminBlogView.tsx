import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, CalendarClock, Loader, RefreshCw } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import {
  statusLabel,
  statusTone,
  canTransition,
  isTerminal,
  normalizeSlotDays,
  isValidSlotHour,
  SLOT_DAYS,
  BlogStatus,
} from './blogStatus';
import { formatSlotAt } from './blogSlotFormat';

interface BlogPost {
  id: string;
  rubric: 'news' | 'case';
  source: string;
  topicKey: string;
  topicHint: string | null;
  title: string | null;
  body: string | null;
  imageUrl: string | null;
  status: BlogStatus;
  slotAt: string | null;
  tgUrl: string | null;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

interface BlogSettings {
  channelChatId: string | null;
  slotDays: number[];
  slotHourMsk: number;
  imageStyle: string;
}

type Screen = 'queue' | 'archive' | 'settings';

const SCREEN_LABEL: Record<Screen, string> = {
  queue: 'Очередь',
  archive: 'Архив',
  settings: 'Настройки',
};

/**
 * Ошибка эндпоинта с сохранённым кодом: 409 обрабатывается иначе всех
 * остальных, а текст всегда берётся с сервера — он единственный знает, что
 * именно разошлось.
 *
 * `code` — машинный код из поля `error` тела. У переноса слота два разных
 * 409, и различить их можно только по нему: `slot_taken` (слот увёл другой
 * пост) и `version_conflict` (сам пост поменяли в другом месте).
 */
class BlogApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'BlogApiError';
  }
}

/**
 * Nest кладёт причину в `message` (строкой или массивом при валидации), а в
 * `error` — либо свой код (`slot_taken`), либо общее «Conflict»; без
 * `message` им же и объясняемся.
 */
const readError = async (r: Response): Promise<{ message: string | null; code: string | null }> => {
  try {
    const body = await r.json();
    const code = typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : null;
    const m = body?.message;
    if (Array.isArray(m) && m.length) return { message: m.join('; '), code };
    if (typeof m === 'string' && m.trim()) return { message: m.trim(), code };
    return { message: code, code };
  } catch {
    // Тело не json (прокси, html-заглушка) — останется код ответа.
    return { message: null, code: null };
  }
};

const call = async (payload: any): Promise<any> => {
  const r = await apiClient.post('/webhook/admin/blog', payload);
  if (!r.ok) {
    const { message, code } = await readError(r);
    throw new BlogApiError(message || `сервер ответил ${r.status}`, r.status, code);
  }
  return r.json();
};

/** Слот расписания из `free_slots`: `takenBy` — пост на нём, иначе null. */
interface FreeSlot {
  slotAt: string;
  takenBy: { id: string; title: string | null } | null;
}

/** Сколько ближайших слотов предлагать: при пн/ср/пт это две недели. */
const SLOT_CHOICES = 6;

type SlotState = 'free' | 'taken' | 'current';

/**
 * Несохранённая правка текста и версия поста, от которой она начата.
 *
 * Версия фиксируется при первом изменении и уходит с сохранением. Очередь
 * перечитывается после любого успешного действия и приносит свежий
 * `updatedAt`; отправь правку с ним — бэк сверит её не с той версией, от
 * которой она сделана, и молча затрёт изменение, внесённое за это время в
 * личке бота или в соседней вкладке. С исходной версией он ответит 409.
 */
interface Draft {
  title: string;
  body: string;
  baseUpdatedAt: string;
}

/** Список слотов под постом: `slots === null` — ещё не пришёл. */
interface SlotPicker {
  postId: string;
  slots: FreeSlot[] | null;
  loading: boolean;
  loadError: string | null;
  /** «Этот слот уже занял пост …» — после 409 slot_taken. */
  note: string | null;
}

/** ISO с сервера бывает с миллисекундами и без — сравниваем моменты, а не строки. */
const sameInstant = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return false;
  const x = Date.parse(a);
  return !Number.isNaN(x) && x === Date.parse(b);
};

/**
 * Свой слот поста отмечен, но не выбираем: перенос на то же место ничего не
 * меняет. Чужой виден, но тоже не выбираем — бэк всё равно ответит 409.
 */
const slotState = (slot: FreeSlot, post: BlogPost): SlotState => {
  if (slot.takenBy?.id === post.id || sameInstant(slot.slotAt, post.slotAt)) return 'current';
  return slot.takenBy ? 'taken' : 'free';
};

const normalizeFreeSlots = (raw: unknown): FreeSlot[] =>
  Array.isArray(raw)
    ? raw
        .filter((s) => s && typeof s.slotAt === 'string')
        .map((s) => ({
          slotAt: s.slotAt,
          takenBy: s.takenBy && s.takenBy.id != null
            ? { id: String(s.takenBy.id), title: typeof s.takenBy.title === 'string' ? s.takenBy.title : null }
            : null,
        }))
    : [];

const slotTakenText = (name: string | null) =>
  name
    ? `Этот слот уже занял пост «${name}» — выберите другой`
    : 'Этот слот уже занял другой пост — выберите другой';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const AdminBlogView: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('queue');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [settings, setSettings] = useState<BlogSettings | null>(null);
  const [hourRaw, setHourRaw] = useState('');
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [newRubric, setNewRubric] = useState<'news' | 'case'>('case');
  const [editing, setEditing] = useState<Record<string, Draft>>({});
  const [picker, setPicker] = useState<SlotPicker | null>(null);
  const slotsRequest = useRef(0);

  const fail = (e: any) => {
    const conflict = e instanceof BlogApiError && e.status === 409;
    setError({ text: e?.message || 'неизвестная ошибка', conflict });
  };

  /**
   * `dropDrafts` — для явного «Загрузить заново» после 409: там смысл в том,
   * чтобы увидеть чужую версию, а не свою. Обычная перезагрузка чернового
   * текста не трогает — и его версии тоже: правка остаётся на той основе, от
   * которой начата, а расхождение с пришедшей версией видно у поста заранее.
   */
  const load = async (dropDrafts = false) => {
    setBusy(true);
    setError(null);
    try {
      if (screen === 'settings') {
        const s: BlogSettings = await call({ action: 'get_settings' });
        setSettings({ ...s, slotDays: normalizeSlotDays(s.slotDays) });
        setHourRaw(String(s.slotHourMsk));
      } else {
        setPosts(await call({ action: screen === 'queue' ? 'list' : 'archive' }));
        if (dropDrafts) setEditing({});
      }
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setNotice(null);
    setPicker(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  /**
   * Действие над постом. На 409 перезагрузки НЕТ намеренно: свежий
   * `updatedAt` снял бы защиту, и второй клик затёр бы чужую правку — ровно
   * то, от чего бэк и ставит 409. Вместо этого показываем баннер с кнопкой
   * «Загрузить заново», и решает человек.
   */
  const act = async (payload: any) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    // Любое другое действие меняет очередь, а с ней и занятость слотов.
    setPicker(null);
    try {
      const res = await call(payload);
      if (payload.id) {
        setEditing((prev) => {
          const next = { ...prev };
          delete next[payload.id];
          return next;
        });
      }
      if (res && res.skipped) setNotice(`Не добавлено: ${res.skipped}`);
      await load();
      return true;
    } catch (e: any) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Как назвать пост, занявший слот: заголовок с сервера, иначе — что о нём знает очередь. */
  const takerName = (taker: FreeSlot['takenBy']): string | null => {
    if (!taker) return null;
    if (taker.title?.trim()) return taker.title.trim();
    const local = posts.find((p) => p.id === taker.id);
    return local?.title?.trim() || local?.topicHint?.trim() || null;
  };

  /**
   * Список слотов — заново при каждом открытии, без кеша: после переноса
   * соседнего поста старый список показал бы освободившийся слот занятым, и
   * обмен двух постов местами упёрся бы в тупик. Ответ, пришедший после
   * закрытия или повторного открытия списка, отбрасывается.
   */
  const loadSlots = async (postId: string): Promise<FreeSlot[] | null> => {
    const ticket = ++slotsRequest.current;
    const current = (prev: SlotPicker | null): prev is SlotPicker =>
      prev !== null && prev.postId === postId && ticket === slotsRequest.current;
    setPicker((prev) => (current(prev) ? { ...prev, loading: true, loadError: null } : prev));
    try {
      const slots = normalizeFreeSlots(await call({ action: 'free_slots', count: SLOT_CHOICES }));
      setPicker((prev) => (current(prev) ? { ...prev, slots, loading: false } : prev));
      return slots;
    } catch (e) {
      const text = (e instanceof Error && e.message) || 'неизвестная ошибка';
      setPicker((prev) => (current(prev) ? { ...prev, loading: false, loadError: text } : prev));
      return null;
    }
  };

  const togglePicker = (post: BlogPost) => {
    if (picker?.postId === post.id) {
      setPicker(null);
      return;
    }
    setPicker({ postId: post.id, slots: null, loading: true, loadError: null, note: null });
    loadSlots(post.id);
  };

  /**
   * Перенос на выбранный слот — с версией поста, как правка текста.
   *
   * Два 409 здесь значат разное, и путать их нельзя:
   *  - `slot_taken` — пост цел, но слот увёл другой. Список слотов устарел:
   *    перечитываем только его и называем, кто занял;
   *  - `version_conflict` — сам пост поменяли в другом месте. Ровно как у
   *    правки текста: баннер и «Загрузить заново», без перечитывания —
   *    свежий `updatedAt` снял бы защиту, и следующий клик затёр бы чужую
   *    правку.
   *
   * Черновик текста перенос, в отличие от `act`, не сбрасывает: слот к
   * тексту отношения не имеет, и терять несохранённую правку незачем.
   */
  const reschedule = async (post: BlogPost, slot: FreeSlot) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await call({
        action: 'reschedule',
        id: post.id,
        slotAt: slot.slotAt,
        updatedAt: post.updatedAt,
      });
      setPicker(null);
      // Перенос сам сдвигает версию поста. Правку, начатую с той версии, что
      // сервер только что подтвердил, переводим на новую: с начала правки пост
      // никто не трогал, а слот к тексту отношения не имеет. Уже устаревшая
      // правка остаётся на своей основе и при сохранении честно получит 409.
      if (typeof saved?.updatedAt === 'string') {
        const moved: string = saved.updatedAt;
        setEditing((prev) => {
          const own = prev[post.id];
          if (!own || !sameInstant(own.baseUpdatedAt, post.updatedAt)) return prev;
          return { ...prev, [post.id]: { ...own, baseUpdatedAt: moved } };
        });
      }
      const at = typeof saved?.slotAt === 'string' ? saved.slotAt : slot.slotAt;
      const name = post.title?.trim() || post.topicHint?.trim();
      setNotice(`${name ? `«${name}»` : 'Пост'} выйдет ${formatSlotAt(at, new Date())}`);
      await load();
    } catch (e) {
      if (e instanceof BlogApiError && e.status === 409 && e.code === 'slot_taken') {
        const fresh = await loadSlots(post.id);
        const taker = fresh?.find((s) => sameInstant(s.slotAt, slot.slotAt))?.takenBy ?? null;
        const note = slotTakenText(taker && taker.id !== post.id ? takerName(taker) : null);
        setPicker((prev) => (prev && prev.postId === post.id ? { ...prev, note } : prev));
      } else {
        // Список собран по устаревшей версии поста — закрываем его вместе с баннером.
        if (e instanceof BlogApiError && e.status === 409) setPicker(null);
        fail(e);
      }
    } finally {
      setBusy(false);
    }
  };

  const addTopic = async () => {
    const topic = newTopic.trim();
    if (!topic) return;
    if (await act({ action: 'add_topic', rubric: newRubric, topic })) setNewTopic('');
  };

  const toggleDay = (day: number) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const has = prev.slotDays.includes(day);
      const next = has ? prev.slotDays.filter((d) => d !== day) : [...prev.slotDays, day];
      return { ...prev, slotDays: normalizeSlotDays(next) };
    });
  };

  const daysValid = !!settings && settings.slotDays.length > 0;
  const hourValid = isValidSlotHour(hourRaw);
  /** Точка отсчёта для «сегодня/завтра» в датах слотов. */
  const now = new Date();

  const saveSettings = () => {
    if (!settings || !daysValid || !hourValid) return;
    return act({
      action: 'update_settings',
      channelChatId: (settings.channelChatId ?? '').trim() || null,
      slotDays: normalizeSlotDays(settings.slotDays),
      slotHourMsk: Number(hourRaw),
      imageStyle: settings.imageStyle,
    });
  };

  return (
    <div data-testid="admin-blog" className="h-full overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(['queue', 'archive', 'settings'] as Screen[]).map((s) => (
          <button
            key={s}
            data-testid={`blog-screen-${s}`}
            onClick={() => setScreen(s)}
            className={clsx(
              'px-3 py-1.5 text-sm font-medium rounded-full border transition-colors',
              screen === s
                ? 'bg-forest-600 text-white border-forest-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-forest-300',
            )}
          >
            {SCREEN_LABEL[s]}
          </button>
        ))}
        <button
          onClick={() => load()}
          disabled={busy}
          title="Обновить"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-600 text-sm font-medium rounded-md border border-gray-200 hover:border-forest-300 hover:text-forest-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', busy && 'animate-spin')} />
          <span className="hidden sm:inline">Обновить</span>
        </button>
      </div>

      {error && (
        <div
          data-testid="blog-error"
          className={clsx(
            'mb-3 px-3 py-2 rounded-md border text-sm',
            error.conflict
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-700',
          )}
        >
          {error.conflict ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">Пост изменили в другом месте</span>
              <span>— {error.text}. Ничего не перезаписано; на экране устаревшая версия.</span>
              <button
                data-testid="blog-conflict-reload"
                onClick={() => load(true)}
                className="px-2 py-0.5 text-xs font-medium rounded border border-amber-400 bg-white hover:bg-amber-100"
              >
                Загрузить заново
              </button>
            </div>
          ) : (
            error.text
          )}
        </div>
      )}

      {notice && (
        <div data-testid="blog-notice" className="mb-3 px-3 py-2 rounded-md border border-gray-200 bg-white text-sm text-gray-600">
          {notice}
        </div>
      )}

      {busy && (
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
          <Loader className="w-4 h-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {screen === 'queue' && (
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            data-testid="blog-new-topic"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            placeholder="Своя тема одной строкой"
            className="flex-1 min-w-[12rem] border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
          />
          <select
            data-testid="blog-new-rubric"
            value={newRubric}
            onChange={(e) => setNewRubric(e.target.value === 'news' ? 'news' : 'case')}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="case">Кейс</option>
            <option value="news">Новинка</option>
          </select>
          <button
            data-testid="blog-add-topic"
            onClick={addTopic}
            disabled={!newTopic.trim() || busy}
            className="px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-md hover:bg-forest-700 disabled:opacity-50"
          >
            Добавить
          </button>
        </div>
      )}

      {screen === 'settings' && settings && (
        <div className="space-y-4 max-w-lg bg-white border border-gray-200 rounded-lg p-4">
          <label className="block text-sm">
            <span className="text-gray-600">Канал (chat id или @handle)</span>
            <input
              data-testid="blog-channel"
              value={settings.channelChatId ?? ''}
              onChange={(e) => setSettings({ ...settings, channelChatId: e.target.value })}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
            />
          </label>

          {/*
            Дни только чекбоксами. Текстовое поле «через запятую» пропускало бы
            99: бэк `slotDays` не валидирует, кладёт массив в JSONB как есть, и
            вылезло бы это только на апруве поста — `nextSlotAfter` не нашёл бы
            слот за две недели вперёд.
          */}
          <div className="text-sm">
            <span className="text-gray-600">Дни слотов</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {SLOT_DAYS.map((d) => {
                const on = settings.slotDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    data-testid={`blog-day-${d.value}`}
                    aria-pressed={on}
                    onClick={() => toggleDay(d.value)}
                    className={clsx(
                      'w-11 py-1.5 text-sm font-medium rounded-md border transition-colors',
                      on
                        ? 'bg-forest-600 text-white border-forest-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-forest-300',
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            {!daysValid && (
              <div className="mt-1 text-xs text-rose-600">
                Нужен хотя бы один день: с пустым списком апрув поста упадёт.
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="text-gray-600">Час слота по Москве</span>
            <input
              data-testid="blog-hour"
              type="number"
              min={0}
              max={23}
              step={1}
              value={hourRaw}
              onChange={(e) => setHourRaw(e.target.value)}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
            />
            {!hourValid && (
              <span className="mt-1 block text-xs text-rose-600">Целое число от 0 до 23.</span>
            )}
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">Фирменный стиль картинок</span>
            <textarea
              data-testid="blog-image-style"
              value={settings.imageStyle}
              onChange={(e) => setSettings({ ...settings, imageStyle: e.target.value })}
              rows={3}
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
            />
          </label>

          <button
            data-testid="blog-save-settings"
            onClick={saveSettings}
            disabled={busy || !daysValid || !hourValid}
            className="px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-md hover:bg-forest-700 disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      )}

      {screen !== 'settings' && (
        <div className="space-y-3">
          {posts.length === 0 && !busy && (
            <div className="text-sm text-gray-500 text-center py-12">
              {screen === 'queue' ? 'Очередь пуста' : 'Архив пуст'}
            </div>
          )}

          {posts.map((p) => {
            const own = editing[p.id];
            // Без правки — текст и версия с сервера: от этой версии правка и начнётся.
            const draft: Draft = own ?? { title: p.title ?? '', body: p.body ?? '', baseUpdatedAt: p.updatedAt };
            // Та же проверка, что у бэка в `assertVersion`: версии разошлись — будет 409.
            const draftStale = !!own && !sameInstant(own.baseUpdatedAt, p.updatedAt);
            const broken = p.status === 'failed';
            const editable = !isTerminal(p.status);
            const textReady = p.status !== 'idea' && p.status !== 'drafting';

            return (
              <div
                key={p.id}
                data-testid={`blog-post-${p.id}`}
                data-status={p.status}
                className={clsx(
                  'border rounded-lg p-3',
                  broken ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white',
                )}
              >
                <div className="flex items-start gap-3">
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt="" className="w-24 h-24 object-cover rounded flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={clsx('px-2 py-0.5 text-xs rounded', statusTone(p.status))}>
                        {statusLabel(p.status)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {p.rubric === 'news' ? 'Новинка' : 'Кейс'} · {p.source}
                      </span>
                      {/* Та же фраза, что владелец получил в Telegram при апруве. */}
                      {p.status === 'approved' ? (
                        <span data-testid={`blog-when-${p.id}`} className="text-xs font-medium text-forest-700">
                          {p.slotAt ? `Выйдет ${formatSlotAt(p.slotAt, now)}` : 'Слот не назначен'}
                        </span>
                      ) : (
                        p.slotAt && (
                          <span className="text-xs text-gray-500">слот {formatSlotAt(p.slotAt, now)}</span>
                        )
                      )}
                      {broken && p.attempts > 0 && (
                        <span className="text-xs text-red-700">попыток: {p.attempts}</span>
                      )}
                    </div>

                    {textReady ? (
                      <>
                        <input
                          data-testid={`blog-title-${p.id}`}
                          value={draft.title}
                          onChange={(e) => {
                            const title = e.target.value;
                            // Версию правки задаёт первое изменение; дальше она не трогается.
                            setEditing((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? draft), title } }));
                          }}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-medium mb-1"
                        />
                        <textarea
                          data-testid={`blog-body-${p.id}`}
                          value={draft.body}
                          onChange={(e) => {
                            const body = e.target.value;
                            setEditing((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] ?? draft), body } }));
                          }}
                          rows={4}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                        />
                        <div
                          className={clsx(
                            'text-xs mt-0.5',
                            draft.body.length > 1000 ? 'text-rose-600' : 'text-gray-400',
                          )}
                        >
                          {draft.body.length} / 1000 символов подписи
                        </div>
                        {draftStale && (
                          <div
                            data-testid={`blog-draft-stale-${p.id}`}
                            className="mt-1 flex items-start gap-1.5 text-xs rounded px-2 py-1.5 border bg-amber-50 border-amber-300 text-amber-900"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                            <span>
                              Пост изменился с начала вашей правки: сохранение закончится конфликтом. Если
                              правка нужна, скопируйте её до того, как загрузите пост заново.
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-gray-700">{p.topicHint || p.topicKey}</div>
                    )}

                    {/*
                      Сорвавшийся пост приходит именно в очереди (бэковый `list`
                      отдаёт всё, кроме published и rejected), и без причины его
                      не починить — она здесь на виду, а не мелким серым.
                    */}
                    {p.lastError && (
                      <div
                        data-testid={`blog-error-${p.id}`}
                        className={clsx(
                          'mt-2 flex items-start gap-1.5 text-xs rounded px-2 py-1.5',
                          broken ? 'bg-red-100 text-red-800 font-medium' : 'bg-gray-100 text-gray-600',
                        )}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                        <span className="break-words">Причина срыва: {p.lastError}</span>
                      </div>
                    )}

                    {p.tgUrl && (
                      <a
                        href={p.tgUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-1 text-xs text-forest-700 underline"
                      >
                        Пост в канале
                      </a>
                    )}
                  </div>
                </div>

                {/*
                  Кнопки гасятся по машине состояний, а не по `isQueue`: у
                  `failed` он даёт false, и сорвавшийся пост остался бы вовсе
                  без действий — ни переписать, ни выбросить.
                */}
                {editable && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      data-testid={`blog-save-text-${p.id}`}
                      onClick={() => act({
                        action: 'update_text',
                        id: p.id,
                        title: draft.title,
                        body: draft.body,
                        // Версия, от которой начата правка, а не пришедшая с последней загрузкой.
                        updatedAt: draft.baseUpdatedAt,
                      })}
                      disabled={busy || !textReady}
                      className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                    >
                      Сохранить текст
                    </button>
                    <button
                      data-testid={`blog-image-${p.id}`}
                      onClick={() => act({ action: 'regenerate_image', id: p.id })}
                      disabled={busy || !textReady}
                      className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                    >
                      Перегенерировать картинку
                    </button>
                    {canTransition(p.status, 'drafting') && (
                      <button
                        data-testid={`blog-redraft-${p.id}`}
                        onClick={() => act({ action: 'redraft', id: p.id })}
                        disabled={busy}
                        className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                      >
                        Переписать заново
                      </button>
                    )}
                    {canTransition(p.status, 'approved') && (
                      <button
                        data-testid={`blog-approve-${p.id}`}
                        onClick={() => act({ action: 'approve', id: p.id })}
                        disabled={busy}
                        className="px-3 py-1 text-xs bg-forest-600 text-white rounded hover:bg-forest-700 disabled:opacity-50"
                      >
                        Одобрить
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button
                        data-testid={`blog-reschedule-${p.id}`}
                        onClick={() => togglePicker(p)}
                        disabled={busy}
                        aria-expanded={picker?.postId === p.id}
                        className={clsx(
                          'flex items-center gap-1 px-3 py-1 text-xs rounded disabled:opacity-50',
                          picker?.postId === p.id
                            ? 'bg-forest-100 text-forest-800'
                            : 'bg-gray-100 hover:bg-gray-200',
                        )}
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        Перенести
                      </button>
                    )}
                    {canTransition(p.status, 'rejected') && (
                      <button
                        data-testid={`blog-reject-${p.id}`}
                        onClick={() => act({ action: 'reject', id: p.id })}
                        disabled={busy}
                        className="px-3 py-1 text-xs bg-rose-50 text-rose-700 rounded hover:bg-rose-100 disabled:opacity-50"
                      >
                        В мусор
                      </button>
                    )}
                  </div>
                )}

                {picker?.postId === p.id && (
                  <div data-testid={`blog-slots-${p.id}`} className="mt-3 pt-3 border-t border-gray-100">
                    <div className="mb-2 text-xs text-gray-500">Ближайшие слоты, время московское</div>

                    {picker.note && (
                      <div
                        data-testid={`blog-slot-note-${p.id}`}
                        className="mb-2 flex items-start gap-1.5 px-2 py-1.5 text-xs rounded border bg-amber-50 border-amber-300 text-amber-900"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                        <span>{picker.note}</span>
                      </div>
                    )}

                    {picker.loadError && (
                      <div className="mb-2 text-xs text-rose-700">
                        Не удалось загрузить слоты: {picker.loadError}
                      </div>
                    )}

                    {picker.loading && !picker.slots && (
                      <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-500">
                        <Loader className="w-3.5 h-3.5 animate-spin" />
                        Загружаю слоты…
                      </div>
                    )}

                    {picker.slots && picker.slots.length === 0 && !picker.loading && (
                      <div className="mb-2 text-xs text-gray-500">
                        Впереди нет ни одного слота — проверьте дни в настройках.
                      </div>
                    )}

                    {picker.slots && picker.slots.length > 0 && (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {picker.slots.map((s) => {
                          const state = slotState(s, p);
                          const taker = state === 'taken' ? takerName(s.takenBy) : null;
                          return (
                            <button
                              key={s.slotAt}
                              type="button"
                              data-testid={`blog-slot-${p.id}-${s.slotAt}`}
                              data-state={state}
                              aria-current={state === 'current' ? 'true' : undefined}
                              disabled={state !== 'free' || busy || picker.loading}
                              onClick={() => reschedule(p, s)}
                              className={clsx(
                                'flex flex-col items-start gap-0.5 w-full min-w-0 text-left px-3 py-2 text-xs rounded-md border transition-colors',
                                state === 'free' &&
                                  'bg-white border-gray-200 text-gray-800 hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50',
                                state === 'taken' && 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed',
                                state === 'current' && 'bg-forest-50 border-forest-300 text-forest-800',
                              )}
                            >
                              <span className="font-medium">{capitalize(formatSlotAt(s.slotAt, now))}</span>
                              <span className="max-w-full truncate">
                                {state === 'current'
                                  ? 'сейчас здесь'
                                  : state === 'taken'
                                    ? taker
                                      ? `занят: «${taker}»`
                                      : 'занят другим постом'
                                    : 'свободен'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <button
                      onClick={() => setPicker(null)}
                      className="mt-2 text-xs text-gray-500 underline hover:text-gray-700"
                    >
                      Отмена
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminBlogView;
