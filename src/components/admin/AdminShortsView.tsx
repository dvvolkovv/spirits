import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Loader, RefreshCw, Settings } from 'lucide-react';
import ShortCard from './ShortCard';
import ShortsOrderForm from './ShortsOrderForm';
import ShortsSettingsForm from './ShortsSettingsForm';
import { AgentOption, ShortsApiError, callShorts, loadAgents } from './shortsApi';
import {
  ActionExtra, GROUP_TITLES, ShortAction, ShortDetail, ShortItem, ShortsScreen,
  actionRequest, archiveOf, queueGroups, screenCounts, successText,
} from './shortStatus';

const SCREENS: ShortsScreen[] = ['queue', 'published', 'rejected'];
const SCREEN_TITLES: Record<ShortsScreen, string> = { queue: 'В очереди', published: 'Вышли', rejected: 'Отклонены' };
const EMPTY_TEXT: Record<ShortsScreen, string> = {
  queue: 'Очередь роликов пуста',
  published: 'Вышедших роликов пока нет',
  rejected: 'Отклонённых роликов нет',
};

/** Бэк отдаёт весь активный хвост очереди, но только последние 100 каждого
    архивного статуса (published/rejected) — точный счёт там неотличим от
    «их не меньше 100», и число на переключателе превращается в «100+». */
const countLabel = (screen: ShortsScreen, n: number): string => (screen !== 'queue' && n >= 100 ? '100+' : String(n));

interface Banner {
  text: string;
  /** 409: на экране устаревшее — плашка жёлтая, с «Загрузить заново». */
  conflict: boolean;
}

/**
 * Экран «Ролики» вкладки «Блог» (спека spirits_back
 * docs/superpowers/specs/2026-10-30-admin-shorts-in-blog-design.md).
 *
 * Решения по ролику подписаны версией, с которой открыта карточка. На 409
 * экран сам ничего не перечитывает: свежая версия сняла бы защиту, и следующее
 * нажатие одобрило бы ролик, которого владелец не видел. Перечитывает
 * «Загрузить заново» — по решению человека.
 */
const AdminShortsView: React.FC = () => {
  const [items, setItems] = useState<ShortItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<ShortsScreen>('queue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Banner | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShortDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  /** Замок одобрения и публикации: кнопка гаснет с перерисовкой, а нажатие, успевшее раньше неё, держит он. */
  const lock = useRef(false);
  /** Ответ на раскрытие, пришедший после закрытия или раскрытия другого ролика, отбрасывается. */
  const detailTicket = useRef(0);
  /** Текущий openId без замыкания: решение по ролику закрывает карточку по состоянию на момент ответа, не на момент клика. */
  const openIdRef = useRef<string | null>(null);
  /** Свой счёт у списка: ответ не по счёту (два «Обновить» подряд) отбрасывается, «занят» снимает только последний. */
  const listTicket = useRef(0);

  /** `decision` — сбой решения: без внятного ответа результат неизвестен, и об этом надо сказать. */
  const fail = (e: unknown, decision = false, prefix = '') => {
    if (e instanceof ShortsApiError && e.status === 409) {
      setError({ text: e.message, conflict: true });
    } else if (e instanceof ShortsApiError && e.status < 500) {
      setError({ text: `${prefix}${e.message}`, conflict: false });
    } else {
      const why = e instanceof Error && e.message ? e.message : 'нет ответа';
      setError({
        // «Обновить» здесь перечитывает только список: открытая карточка
        // остаётся со старым содержимым и кнопками, пока её не свернуть и
        // раскрыть заново, — отсюда вторая часть подсказки.
        text: decision
          ? `Не подтверждено: ${why.replace(/[.\s]+$/, '')}. Нажмите «Обновить», затем сверните и раскройте ролик заново, прежде чем повторять.`
          : `${prefix}${why}`,
        conflict: false,
      });
    }
  };

  const load = async (prefix = '') => {
    const ticket = ++listTicket.current;
    setBusy(true);
    try {
      const list = await callShorts<unknown>({ action: 'list' });
      // Не массив — это отказ сервера, а не пустая очередь: молчаливое [] увело
      // бы владельца в пустой экран, будто роликов и правда нет.
      if (!Array.isArray(list)) throw new Error('сервер прислал не список роликов');
      if (ticket === listTicket.current) {
        setItems(list as ShortItem[]);
        setLoaded(true);
      }
    } catch (e) {
      if (ticket === listTicket.current) fail(e, false, prefix);
    } finally {
      if (ticket === listTicket.current) setBusy(false);
    }
  };

  const loadDetail = async (id: string) => {
    const ticket = ++detailTicket.current;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const d = await callShorts<ShortDetail>({ action: 'get', id });
      if (ticket === detailTicket.current) setDetail(d);
    } catch (e) {
      if (ticket === detailTicket.current) setDetailError(e instanceof Error && e.message ? e.message : 'неизвестная ошибка');
    } finally {
      if (ticket === detailTicket.current) setDetailLoading(false);
    }
  };

  const closeCard = () => {
    detailTicket.current += 1;
    openIdRef.current = null;
    setOpenId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  useEffect(() => {
    load();
    loadAgents().then(setAgents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => {
    if (openId === id) {
      closeCard();
      return;
    }
    openIdRef.current = id;
    setOpenId(id);
    setDetail(null);
    loadDetail(id);
  };

  /** Решение по ролику. Версия — с раскрытой карточки; у «Запустить сейчас» идеи её нет и не нужно. */
  const act = async (kind: ShortAction, short: ShortItem, extra?: ActionExtra) => {
    // Версия и содержимое — только с карточки ИМЕННО этого ролика, раскрытой
    // сейчас; если раскрыта карточка другого ролика (или не раскрыта вовсе),
    // решение ничем не подписано — лучше не отправить его совсем, чем молча
    // взять версию строки списка, которую владелец не видел. «Запустить
    // сейчас» — исключение: это кнопка идеи в строке, версии у идеи нет.
    // Решения строки — «Запустить сейчас» и «Отклонить» у идеи — подписываются
    // строкой списка; остальные — только раскрытой карточкой этого ролика.
    const rowAction = kind === 'start_now' || (kind === 'reject' && short.status === 'idea');
    const target = detail?.id === short.id ? detail : rowAction ? short : null;
    if (!target) return;
    const request = actionRequest(kind, target, extra);
    if (request.lock && lock.current) return;
    if (request.confirm && !window.confirm(request.confirm)) return;
    if (request.lock) lock.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await callShorts(request.payload);
      setNotice(successText(kind, target, res, new Date()));
      // openId — из рефа, не из замыкания: за время запроса владелец мог
      // закрыть этот ролик и раскрыть другой, и закрывать тогда чужую
      // карточку не надо.
      if (openIdRef.current === short.id) closeCard();
      // Внутри try: load() сам гасит свои ошибки через fail(), но с пояснением,
      // что не обновился именно список, а не что решение не прошло — оно уже прошло.
      await load('Список не обновился: ');
    } catch (e) {
      fail(e, true);
    } finally {
      if (request.lock) lock.current = false;
      setBusy(false);
    }
  };

  const order = async (payload: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await callShorts(payload);
      // Список перечитываем в любом исходе: дубль всё равно уже лежит идеей.
      // Префикс — как у act(): заказ (или дубль) уже определён, упасть
      // здесь может только перечитывание списка, и баннер не должен читаться
      // как «заказ не прошёл».
      await load('Список не обновился: ');
      if (!res) {
        // Бэк сравнивает нормализованные первые 80 символов открытой ручной
        // идеи — дубль нашёлся, новая запись не создана. Текст в форме не
        // трогаем: это не отказ по содержимому, и стирать историю незачем.
        setNotice('Такой ролик уже заказан — он в «Идеях». Текст оставлен в поле.');
        return false;
      }
      setNotice('Ролик заказан — он в «Идеях». Запустить сразу — «Запустить сейчас» в его строке.');
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const refill = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await callShorts<{ added?: number }>({ action: 'refill_topics' });
      const added = Number(res?.added ?? 0);
      setNotice(added > 0 ? `Добавлено тем: ${added}` : 'Темы на неделю уже есть');
      // Префикс — как у act()/order(): пополнение уже определено, упасть
      // здесь может только перечитывание списка.
      await load('Список не обновился: ');
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /** После 409 — решение человека: и список, и открытая карточка с новой версией. */
  const reloadAll = async () => {
    setError(null);
    // Оба запроса стартуют в один тик: `get` открытой карточки берёт свой
    // билет СРАЗУ, и раскрытие другого ролика, случившееся пока list летит,
    // получит билет позже и честно победит. Было: await list, потом get —
    // окно между ними давало чужому раскрытию билет МЕНЬШЕ, и устаревший
    // ответ занимал чужую, уже раскрытую карточку.
    await Promise.all([load(), openId ? loadDetail(openId) : undefined]);
  };

  const refresh = () => {
    setError(null);
    setNotice(null);
    load();
  };

  const counts = screenCounts(items);
  const now = new Date();
  const groups = queueGroups(items);
  const archive = screen === 'queue' ? [] : archiveOf(items, screen);
  const empty = loaded && (screen === 'queue' ? groups.length === 0 : archive.length === 0);
  const agentName = (i: ShortItem): string | null => {
    if (i.scene?.assistantName) return i.scene.assistantName;
    const a = i.assistantId != null ? agents.find((x) => x.id === i.assistantId) : undefined;
    return a ? a.displayName : null;
  };
  const card = (i: ShortItem) => (
    <ShortCard
      key={i.id}
      item={i}
      assistantName={agentName(i)}
      open={openId === i.id}
      detail={openId === i.id ? detail : null}
      detailLoading={openId === i.id && detailLoading}
      detailError={openId === i.id ? detailError : null}
      // Открытая карточка гаснет и своим перечитыванием: кнопка, нажатая пока
      // летит новая версия, подписала бы решение версией, которая уже не
      // актуальна с точки зрения владельца, — дождаться ответа надёжнее.
      busy={busy || (openId === i.id && detailLoading)}
      now={now}
      onToggle={() => toggle(i.id)}
      onAction={(kind, extra) => act(kind, i, extra)}
    />
  );

  return (
    // ym-hide-content: заказ ручного ролика несёт историю владельца (её
    // заголовок и собранная по ней сцена видны и в архиве) — Вебвизор не
    // должен её записать. Сторож — webvisorPrivacy.test.ts.
    <div data-testid="admin-shorts" className="ym-hide-content">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {SCREENS.map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`shorts-screen-${s}`}
            onClick={() => setScreen(s)}
            className={clsx(
              'px-3 py-1.5 text-sm font-medium rounded-full border transition-colors',
              screen === s ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-600 border-gray-200 hover:border-forest-300',
            )}
          >
            {SCREEN_TITLES[s]} {countLabel(s, counts[s])}
          </button>
        ))}
        <button
          type="button"
          data-testid="shorts-settings-toggle"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          aria-label="Настройки роликов"
          title="Настройки роликов"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-600 text-sm font-medium rounded-md border border-gray-200 hover:border-forest-300 hover:text-forest-700 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">Настройки роликов</span>
        </button>
        <button
          type="button"
          data-testid="shorts-refresh"
          onClick={refresh}
          disabled={busy}
          title="Обновить"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-600 text-sm font-medium rounded-md border border-gray-200 hover:border-forest-300 hover:text-forest-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', busy && 'animate-spin')} />
          <span className="hidden sm:inline">Обновить</span>
        </button>
      </div>

      {error && (
        <div
          data-testid="shorts-error"
          data-conflict={error.conflict ? 'true' : 'false'}
          className={clsx(
            'mb-3 px-3 py-2 rounded-md border text-sm',
            error.conflict ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-700',
          )}
        >
          {error.conflict ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error.text.replace(/[.\s]+$/, '')}. Ничего не записано.</span>
              <button
                type="button"
                data-testid="shorts-conflict-reload"
                onClick={reloadAll}
                disabled={busy}
                className="px-2 py-0.5 text-xs font-medium rounded border border-amber-400 bg-white hover:bg-amber-100 disabled:opacity-50"
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
        <div data-testid="shorts-notice" className="mb-3 px-3 py-2 rounded-md border border-gray-200 bg-white text-sm text-gray-600">
          {notice}
        </div>
      )}

      {showSettings && <ShortsSettingsForm />}

      {/*
        Форма остаётся смонтированной на всех подэкранах и просто скрывается
        вне «Очереди»: наполовину набранная история должна переживать взгляд
        на «Вышли»/«Отклонены», а не слетать вместе с размонтированием.
      */}
      <div hidden={screen !== 'queue'}>
        <ShortsOrderForm agents={agents} busy={busy} onOrder={order} onRefill={refill} />
      </div>

      {busy && !loaded && (
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
          <Loader className="w-4 h-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {empty && <div className="text-sm text-gray-500 text-center py-12">{EMPTY_TEXT[screen]}</div>}

      {screen === 'queue' ? (
        groups.map(({ group, items: list }) => (
          <section key={group} data-testid={`shorts-group-${group}`} className="mb-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {GROUP_TITLES[group]} · {list.length}
            </h3>
            <div className="space-y-2">{list.map(card)}</div>
          </section>
        ))
      ) : (
        <>
          <div className="space-y-2">{archive.map(card)}</div>
          {/* Бэк отдаёт все активные плюс последние 100 каждого архивного
              статуса — на 100 строках за экраном может остаться больше. */}
          {archive.length >= 100 && (
            <div data-testid="shorts-archive-hint" className="text-xs text-gray-500 text-center py-2">
              Показаны последние 100.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminShortsView;
