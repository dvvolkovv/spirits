import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LoginTabs from '../onboarding/LoginTabs';
import LoginConsentBlock from '../onboarding/LoginConsentBlock';
import { parseCustomMarkdown } from '../../utils/customMarkdown';
import { savePendingDraft } from '../../utils/pendingDraft';
import { getCampaign, getSessionId, getSource, track } from '../../services/eventsClient';
import { sendGuestMessage, type GuestSendResult } from './guestApi';
import type { GuestConfig, GuestEvent, GuestMessage } from './guestTypes';

export interface GuestChatProps {
  assistantId: string;
  assistantName: string;
  config: GuestConfig;
  /** Ключ начатой пробы (после перезагрузки страницы); null — проба новая. */
  token: string | null;
  initialMessages: GuestMessage[];
  /** Сколько ответов осталось у начатой пробы; null — проба новая. */
  initialLeft: number | null;
  /** Черновик: вопрос с лендинга (auto) или текст, который только подставить. */
  draft: { text: string; auto: boolean } | null;
  preview: boolean;
  onToken: (token: string) => void;
  onStarted: () => void;
  /** Проба на сервере пропала (7 дней, другой ассистент) — начать новую с этим текстом. */
  onTrialGone: (unsent: string) => void;
  /**
   * Идёт ход (от отправки до ответа/ошибки/стены) — родитель не даёт начать
   * вход посреди ответа: перенос пробы в этот момент теряет пару, которая
   * ещё пишется (ревью A7). true в начале хода, false по его завершении —
   * в том числе при ошибке и стене. При тихой отмене ('aborted', ревью B3)
   * не зовётся вовсе: компонента к этому моменту уже размонтирована.
   */
  onBusyChange?: (busy: boolean) => void;
}

type Wall = 'limit' | 'closed';
type ErrorKind = 'model' | 'busy' | 'network';

/** Та же отметка, что у галочки на экране входа: дал согласие здесь — там она уже стоит. */
const CONSENT_KEY = 'loginConsent';

function readConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === 'true'; } catch { return false; }
}

/**
 * Результат хода → вид ошибки на экране (ревью B4). 'server' (403 чужого
 * источника, 5xx — сервер ответил отказом) показывается как «ассистент
 * сейчас недоступен», а не как «нет сети» — это разные причины и разные
 * тексты для гостя. Switch по ВСЕМ значениям GuestSendResult и без default:
 * 'ok' (ответ есть, сюда не доходит — см. вызов ниже), 'trial_gone' и
 * 'aborted' уводят раньше отдельными ветками и этой функции не достигают, но
 * перечислены явно, чтобы новое значение в GuestSendResult завалило сборку
 * здесь, а не уехало молча в чужую ветку.
 */
function errorKindForResult(result: GuestSendResult): ErrorKind {
  switch (result) {
    case 'busy_trial': return 'busy';
    case 'network': return 'network';
    case 'server': return 'model';
    case 'bad_request': return 'model';
    case 'ok': return 'model';
    case 'trial_gone': return 'model';
    case 'aborted': return 'model';
  }
}

/** Ответ без кнопок и медиа из разметки ассистента: в пробе их нечем исполнить. */
const GuestAnswer: React.FC<{ content: string }> = ({ content }) => {
  const { content: text } = parseCustomMarkdown(content, { streaming: true });
  return (
    <div className="prose prose-sm max-w-none text-gray-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
};

/**
 * Чат пробы без входа (spec 2026-10-30-guest-trial). Лента и поле скрыты от
 * Вебвизора, как и обычный чат (webvisorPrivacy.test.ts).
 */
const GuestChat: React.FC<GuestChatProps> = (props) => {
  const { assistantId, assistantName, config, preview } = props;
  const { t, i18n } = useTranslation();
  const [messages, setMessages] = useState<GuestMessage[]>(props.initialMessages);
  const [partial, setPartial] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [wall, setWall] = useState<Wall | null>(props.initialLeft === 0 ? 'limit' : null);
  const [error, setError] = useState<ErrorKind | null>(null);
  const [consent, setConsent] = useState<boolean>(readConsent);
  const tokenRef = useRef<string | null>(props.token);
  const draftTaken = useRef(false);
  /** Текущий ход (ревью B3) — чтобы оборвать его, если страница ушла раньше ответа. */
  const abortRef = useRef<AbortController | null>(null);

  // Размонтирование посреди хода отменяет его: сигнал уходит в sendGuestMessage
  // третьим аргументом (см. send), страница уже не дождётся результата.
  useEffect(() => () => abortRef.current?.abort(), []);

  const changeConsent = (value: boolean) => {
    setConsent(value);
    try { localStorage.setItem(CONSENT_KEY, value ? 'true' : 'false'); } catch { /* приватный режим */ }
  };

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || sending || wall || !consent || message.length > config.maxChars) return;
    const first = messages.length === 0;
    setSending(true);
    props.onBusyChange?.(true);
    setError(null);
    setPartial('');
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: message }]);
    if (first) props.onStarted();

    const controller = new AbortController();
    abortRef.current = controller;

    let answer: string | null = null;
    let gotWall: Wall | null = null;
    let gotError: ErrorKind | null = null;
    const result = await sendGuestMessage(
      {
        token: tokenRef.current,
        assistantId,
        message,
        lang: i18n.language,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        preview,
        source: getSource(),
        campaign: getCampaign(),
        sid: getSessionId(),
      },
      (ev: GuestEvent) => {
        if (ev.type === 'guest' && ev.token) {
          tokenRef.current = ev.token;
          props.onToken(ev.token);
        } else if (ev.type === 'item') {
          setPartial((s) => (s ?? '') + ev.content);
        } else if (ev.type === 'end') {
          answer = ev.content;
        } else if (ev.type === 'wall') {
          gotWall = ev.reason;
        } else if (ev.type === 'error') {
          gotError = ev.code;
        }
      },
      controller.signal,
    );
    abortRef.current = null;

    // Молча (ревью B3): страницы уже нет, чтобы показать на ней ошибку или
    // снять индикатор хода, — ни setState, ни onBusyChange.
    if (result === 'aborted') return;

    setPartial(null);

    if (result === 'trial_gone') {
      setMessages((m) => m.slice(0, -1));
      setSending(false);
      props.onBusyChange?.(false);
      props.onTrialGone(message);
      return;
    }
    if (answer !== null) {
      const text = answer;
      setMessages((m) => [...m, { role: 'assistant', content: text }]);
    } else {
      // Ответа нет — сообщение возвращается в поле: отправить ещё раз или, если
      // проба закрыта, дождаться входа черновиком в чате с тем же ассистентом.
      setMessages((m) => m.slice(0, -1));
      setInput(message);
      if (gotWall) savePendingDraft(message, assistantId);
    }
    if (gotWall) {
      setWall(gotWall);
      track('guest_trial_wall', { reason: gotWall, assistant_id: assistantId });
    } else if (answer === null) {
      setError(gotError ?? errorKindForResult(result));
    }
    setSending(false);
    props.onBusyChange?.(false);
  };

  useEffect(() => {
    if (draftTaken.current || !props.draft) return;
    draftTaken.current = true;
    if (props.draft.auto && consent && messages.length === 0 && !wall) void send(props.draft.text);
    else setInput(props.draft.text);
    // Только при первом показе: черновик подставляется один раз.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = sending || wall !== null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-testid="guest-messages-list" className="flex-1 space-y-4 overflow-y-auto px-4 py-6 ym-hide-content">
        {messages.length === 0 && partial === null && !wall && (
          <p className="text-center text-sm text-gray-500">{t('guest.empty', { name: assistantName })}</p>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-forest-700 px-4 py-3 text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="max-w-[90%] rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3">
              <GuestAnswer content={m.content} />
            </div>
          ),
        )}
        {partial !== null && (
          <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3">
            {partial ? (
              <GuestAnswer content={partial} />
            ) : (
              <span className="text-sm text-gray-500">{t('guest.typing', { name: assistantName })}</span>
            )}
          </div>
        )}
        {wall && (
          <div data-testid="guest-wall" className="rounded-2xl border border-forest-100 bg-white p-5 shadow-sm">
            <p className="font-semibold text-gray-900">{wall === 'limit' ? t('guest.wall.title') : t('guest.wall.closedTitle')}</p>
            <p className="mt-1 text-sm text-gray-600">
              {wall === 'limit' ? t('guest.wall.text') : t('guest.wall.closedText', { name: assistantName })}
            </p>
            <div className="mt-4">
              <LoginTabs />
            </div>
          </div>
        )}
      </div>
      {!wall && (
        <div className="space-y-2 border-t border-gray-100 bg-white px-4 py-3">
          {error && <p role="alert" className="text-sm text-red-600">{t(`guest.errors.${error}`)}</p>}
          {!consent && <LoginConsentBlock checked={consent} onChange={changeConsent} />}
          <div className="flex items-end gap-2">
            <textarea
              data-testid="guest-chat-input"
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-600 ym-disable-keys"
              rows={2}
              maxLength={config.maxChars}
              value={input}
              disabled={locked}
              placeholder={t('guest.inputPlaceholder')}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <button
              type="button"
              disabled={locked || !consent || !input.trim()}
              onClick={() => void send(input)}
              className="rounded-xl bg-forest-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('guest.send')}
            </button>
          </div>
          <p className="text-xs text-gray-500">{t('guest.trialNote')}</p>
        </div>
      )}
    </div>
  );
};

export default GuestChat;
