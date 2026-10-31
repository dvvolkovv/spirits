import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import OnboardingPage from '../../pages/OnboardingPage';
import { avatarService } from '../../services/avatarService';
import { track } from '../../services/eventsClient';
import { rememberPendingAssistant } from '../../utils/pendingAssistant';
import { takePendingDraftEntry } from '../../utils/pendingDraft';
import { useEntryParams } from '../onboarding/useEntryParams';
import GuestChat from './GuestChat';
import { fetchGuestAgents, loadGuestSession } from './guestApi';
import { forgetTrial, readTrial, saveTrial } from './guestStorage';
import type { GuestAgent, GuestConfig, GuestMessage } from './guestTypes';

/** Роман — универсальный ассистент: к нему ведёт и поле в первом экране лендинга. */
const DEFAULT_ASSISTANT = '12';

interface Props {
  config: GuestConfig;
  preview: boolean;
}

interface Restored {
  token: string;
  messages: GuestMessage[];
  left: number;
}

const Spinner: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-gray-50">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
  </div>
);

/** Кабинет без входа: проба с ассистентом (spec 2026-10-30-guest-trial). */
const GuestChatPage: React.FC<Props> = ({ config, preview }) => {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  useEntryParams();
  const [agents, setAgents] = useState<GuestAgent[] | null>(null);
  const [assistantId, setAssistantId] = useState<string>(DEFAULT_ASSISTANT);
  const [restored, setRestored] = useState<Restored | null>(null);
  const [draft, setDraft] = useState<{ text: string; auto: boolean } | null>(null);
  const [started, setStarted] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [showLogin, setShowLogin] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  /** Идёт ход у GuestChat (ревью A7) — пока true, «Войти» в шапке недоступна:
   * перенос пробы посреди ответа теряет пару, которая ещё пишется. */
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const list = await fetchGuestAgents(i18n.language);
      const stored = readTrial();
      let chosen: string | null = null;
      let rest: Restored | null = null;
      // m3 (Critical, ревью качества B9-fix): список пуст — ниже и так
      // покажется экран входа (agents.length === 0), а ключ пробы трогать
      // незачем: список может быть пуст из-за сбоя сети fetchGuestAgents, а
      // не потому что ассистентов и в самом деле нет.
      if (stored && list.length > 0) {
        const s = await loadGuestSession(stored.token);
        if (s.status === 'ok') {
          if (list.some((a) => a.id === s.assistantId)) {
            chosen = s.assistantId;
            rest = { token: stored.token, messages: s.messages, left: s.left };
          } else {
            // Ассистент, с которым шла проба, больше не в списке — продолжить
            // с ним всё равно нельзя, ключ не жалко.
            forgetTrial();
          }
        } else if (s.status === 'gone') {
          forgetTrial();
        } else {
          // 'error': сбой (сеть, 5xx, таймаут) — НЕ повод терять ключ («при
          // сбое ключ остаётся», обещание «перезагрузка разговор не
          // теряет»). Открываем пробу этим же ключом без ленты — она
          // подгрузится, когда сервер ответит. Если сохранённый ассистент
          // тем временем не в списке — просто не восстанавливаем сейчас
          // (ключ всё равно остаётся для следующей попытки, на этот раз
          // ничего не стираем: мы не ПОДТВЕРДИЛИ, что пробы нет).
          if (list.some((a) => a.id === stored.assistantId)) {
            chosen = stored.assistantId;
            rest = { token: stored.token, messages: [], left: null };
          }
        }
      }
      if (!chosen) {
        const fromUrl = (searchParams.get('assistant') || '').trim();
        if (list.some((a) => a.id === fromUrl)) chosen = fromUrl;
        else if (list.some((a) => a.id === DEFAULT_ASSISTANT)) chosen = DEFAULT_ASSISTANT;
        else chosen = list[0]?.id ?? DEFAULT_ASSISTANT;
      }
      if (!alive) return;
      setAgents(list);
      setAssistantId(chosen);
      setRestored(rest);
      setStarted(!!rest && rest.messages.length > 0);
      setDraft(rest ? null : takePendingDraftEntry(chosen));
      track('guest_trial_view', { assistant_id: chosen, restored: !!rest });
    })();
    return () => { alive = false; };
    // Один раз при открытии: дальше состояние ведёт сама страница. Смена
    // ?assistant= из select (доп. B6) намеренно не перезапускает этот эффект —
    // он только про стартовый выбор, выбор потом меняет onChange select'а.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // m2: список ассистентов ещё не загружен (идёт первый запрос) или пуст —
    // ниже всё равно покажется Spinner/экран входа, аватар на них не нужен,
    // а дёргать сервер заранее для несуществующего или неподтверждённого
    // ассистента смысла не имеет.
    if (!agents || agents.length === 0) return;
    let alive = true;
    setAvatar(null);
    avatarService
      .getAvatarUrl(Number(assistantId))
      .then((url) => { if (alive && url) setAvatar(url); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [assistantId, agents]);

  if (agents === null) return <Spinner />;
  if (agents.length === 0) return <OnboardingPage />;

  const name = agents.find((a) => a.id === assistantId)?.name ?? '';
  const onToken = (token: string) => {
    saveTrial({ token, assistantId });
    // После входа кабинет откроет этого ассистента.
    rememberPendingAssistant(assistantId);
  };
  const onTrialGone = (unsent: string) => {
    forgetTrial();
    setRestored(null);
    setStarted(false);
    setDraft({ text: unsent, auto: false });
    setGeneration((g) => g + 1);
  };

  return (
    <>
      {/*
        C1 (Critical, ревью качества B9-fix): раньше showLogin подменял ВЕСЬ
        возврат компонента на экран входа — GuestChat размонтировался, и
        после «Вернуться» рождался новый экземпляр с token=null и пустой
        лентой: следующее сообщение открывало НОВУЮ пробу (старая
        осиротевала, потолок трёх ответов обходился), а черновик с лендинга
        уходил в чат повторно. Теперь контейнер с шапкой и чатом всегда в
        дереве — на время экрана входа он просто скрыт классом hidden
        (display:none), а не размонтирован: GuestChat не теряет состояние.
      */}
      <div className={showLogin ? 'hidden' : 'flex h-screen flex-col bg-gray-50'}>
        <header className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
          {avatar ? (
            <img src={avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-forest-100" />
          )}
          <div className="min-w-0 flex-1">
            {started ? (
              <>
                <p className="truncate font-semibold text-gray-900">{name}</p>
                <p className="truncate text-xs text-gray-500">{t('guest.pickLocked')}</p>
              </>
            ) : (
              <select
                aria-label={t('guest.pickAssistant')}
                value={assistantId}
                onChange={(e) => {
                  const id = e.target.value;
                  setAssistantId(id);
                  setDraft(null);
                  setGeneration((g) => g + 1);
                  // Доп. B6: тот же ассистент — в адресе, не только в состоянии
                  // страницы. useEntryParams (страницы пробы и экрана входа)
                  // перечитает ?assistant= и запомнит его как намерение входа —
                  // иначе после входа кабинет открыл бы прежнего ассистента.
                  setSearchParams(
                    (p) => {
                      const n = new URLSearchParams(p);
                      n.set('assistant', id);
                      return n;
                    },
                    { replace: true },
                  );
                }}
                className="max-w-full rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-900"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            // m1: не просто disabled — подсказка ПОЧЕМУ (перенос пробы
            // посреди ответа теряет пару, которая ещё пишется).
            title={busy ? t('guest.loginDisabledHint') : undefined}
            onClick={() => setShowLogin(true)}
            className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('guest.login')}
          </button>
        </header>
        <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          <GuestChat
            key={`${assistantId}:${generation}`}
            assistantId={assistantId}
            assistantName={name}
            config={config}
            token={restored?.token ?? null}
            initialMessages={restored?.messages ?? []}
            initialLeft={restored ? restored.left : null}
            draft={draft}
            preview={preview}
            onToken={onToken}
            onStarted={() => setStarted(true)}
            onTrialGone={onTrialGone}
            onBusyChange={setBusy}
          />
        </main>
      </div>
      {showLogin && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowLogin(false)}
            className="absolute left-4 top-4 z-20 text-sm font-medium text-forest-800 hover:underline"
          >
            {t('guest.backToChat')}
          </button>
          <OnboardingPage />
        </div>
      )}
    </>
  );
};

export default GuestChatPage;
