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

  /** `decision` — сбой решения: без внятного ответа результат неизвестен, и об этом надо сказать. */
  const fail = (e: unknown, decision = false) => {
    if (e instanceof ShortsApiError && e.status === 409) {
      setError({ text: e.message, conflict: true });
    } else if (e instanceof ShortsApiError && e.status < 500) {
      setError({ text: e.message, conflict: false });
    } else {
      const why = e instanceof Error && e.message ? e.message : 'нет ответа';
      setError({
        text: decision ? `Не подтверждено: ${why}. Нажмите «Обновить», прежде чем повторять.` : why,
        conflict: false,
      });
    }
  };

  const load = async () => {
    setBusy(true);
    try {
      const list = await callShorts<ShortItem[]>({ action: 'list' });
      setItems(Array.isArray(list) ? list : []);
      setLoaded(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
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
    setOpenId(id);
    setDetail(null);
    loadDetail(id);
  };

  /** Решение по ролику. Версия — с раскрытой карточки; у «Запустить сейчас» идеи её нет и не нужно. */
  const act = async (kind: ShortAction, short: ShortItem, extra?: ActionExtra) => {
    const target = detail && detail.id === short.id ? detail : short;
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
      closeCard();
      await load();
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
      setNotice(res ? 'Ролик заказан — он в «Идеях». Запустить сразу — «Запустить сейчас» в его строке.' : 'Такой ролик уже заказан');
      await load();
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
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  /** После 409 — решение человека: и список, и открытая карточка с новой версией. */
  const reloadAll = async () => {
    setError(null);
    await load();
    if (openId) await loadDetail(openId);
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
      busy={busy}
      now={now}
      onToggle={() => toggle(i.id)}
      onAction={(kind, extra) => act(kind, i, extra)}
    />
  );

  return (
    <div data-testid="admin-shorts">
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
            {SCREEN_TITLES[s]} {counts[s]}
          </button>
        ))}
        <button
          type="button"
          data-testid="shorts-settings-toggle"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
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
        <div data-testid="shorts-notice" className="mb-3 px-3 py-2 rounded-md border border-gray-200 bg-white text-sm text-gray-600">
          {notice}
        </div>
      )}

      {showSettings && <ShortsSettingsForm />}

      {screen === 'queue' && <ShortsOrderForm agents={agents} busy={busy} onOrder={order} onRefill={refill} />}

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
        <div className="space-y-2">{archive.map(card)}</div>
      )}
    </div>
  );
};

export default AdminShortsView;
