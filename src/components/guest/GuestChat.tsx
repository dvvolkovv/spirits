import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LoginTabs from '../onboarding/LoginTabs';
import LoginConsentBlock from '../onboarding/LoginConsentBlock';
import { parseCustomMarkdown, type LinkConfig } from '../../utils/customMarkdown';
import { isContactLink, isWebLink } from '../../utils/cabinetSections';
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

/**
 * Служебные метки customMarkdown.tsx (__BUTTON_…__/__LINK_…__/…), оставшиеся
 * в тексте после parseCustomMarkdown: в пробе нет истории чата с состоянием и
 * обработчиков кнопок/карточек, поэтому заменяются текстом (ссылка, адрес
 * картинки/видео — он сам станет обычной <a> через remark-gfm autolink и
 * components.a ниже) или пустой строкой (I1 ревью качества B8).
 *
 * Блок уточняющих вопросов (ASK) — тоже пустой строкой, а не
 * askBlocksToPlainText: это интерактивная карточка с вариантами ответа,
 * которую не отрисовать без кнопок, а голый текст вопроса без возможности
 * выбрать вариант рискует запутать гостя больше, чем его отсутствие.
 *
 * ВНИМАНИЕ: id в метке уже содержит префикс (btn_…, link_…, video_…) — он
 * попал туда при замене тега в customMarkdown.tsx. Ключ в карте — та же
 * строка целиком, БЕЗ повторного префикса (ниже — links.get(id), не
 * links.get(`link_${id}`)). В ChatInterface.tsx (StreamingMessage) префикс
 * добавляется повторно (buttons.get(`btn_${buttonId}`) и т.п., строки
 * ~205/215/225) — рабочий, но не копируемый сюда баг: двойной префикс не
 * совпадает ни с одним ключом карты, и там эти метки просто не находят конфиг.
 */
function stripGuestLabels(
  text: string,
  links: Map<string, LinkConfig>,
  images: Map<string, string>,
  videos: Map<string, string>,
): string {
  return text
    .replace(/__LINK_([\w-]+)__/g, (_m, id: string) => links.get(id)?.text ?? '')
    .replace(/__IMAGE_([\w-]+)__/g, (_m, id: string) => images.get(id) ?? '')
    .replace(/__VIDEO_([\w-]+)__/g, (_m, id: string) => videos.get(id) ?? '')
    .replace(/__BUTTON_([\w-]+)__/g, '')
    .replace(/__ASK_(\d+)__/g, '')
    .replace(/__PACTION_(\d+)__/g, '')
    .replace(/__AUDIO_CLIP_([\w-]+)__/g, '')
    .replace(/__VOICECALL_([\w-]+)__/g, '')
    .replace(/__MEETING_([\w-]+)__/g, '');
}

/**
 * Ссылка ответа ассистента (I2): веб-адрес и почта/телефон — настоящая <a>,
 * открывается новой вкладкой (в пробе нет роутера кабинета, куда вести
 * внутренний переход). Остальное (javascript:, data:, пустая, битая) —
 * текстом без href: иначе её открыли бы средняя кнопка или «Открыть в новой
 * вкладке» мимо какой-либо проверки. ym-disable-tracklink — мимо «Внешних
 * переходов» Метрики, как и в основном чате (webvisorPrivacy.test.ts).
 */
const GuestLink: React.FC<{ href?: string; children?: React.ReactNode }> = ({ href, children }) => {
  const url = href ?? '';
  if (isWebLink(url) || isContactLink(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="ym-disable-tracklink text-forest-600 underline hover:text-forest-700"
      >
        {children}
      </a>
    );
  }
  return <span>{children}</span>;
};

/** Картинка ответа ассистента (I2) — без запроса в сеть: только подпись alt, если она есть. */
const GuestImage: React.FC<{ alt?: string }> = ({ alt }) => (alt ? <span>{alt}</span> : null);

const GUEST_MARKDOWN_COMPONENTS = { a: GuestLink, img: GuestImage };

/**
 * Ответ ассистента. streaming — только для текущего (ещё печатающегося)
 * куска: у него возможен недописанный тег в хвосте (M4) — у готовых сообщений
 * из истории его быть не может, а streaming:true там лишь рискует погасить
 * настоящий недописанный `{{` в конце готового текста. React.memo (M12):
 * одно и то же готовое сообщение из messages не нуждается в повторном
 * разборе customMarkdown при каждом чужом обновлении состояния чата.
 */
const GuestAnswer: React.FC<{ content: string; streaming?: boolean }> = React.memo(({ content, streaming }) => {
  const { content: parsed, links, images, videos } = parseCustomMarkdown(content, { streaming: !!streaming });
  const text = stripGuestLabels(parsed, links, images, videos);
  return (
    <div className="prose prose-sm max-w-none text-gray-800">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={GUEST_MARKDOWN_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
GuestAnswer.displayName = 'GuestAnswer';

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

  /** Лента (I3): прокрутка вниз и к стене. */
  const listRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  /**
   * Был ли человек у низа ленты ДО этого обновления (≤120px) — обновляется
   * собственным скроллом человека, а не эффектом по messages/partial/wall:
   * к моменту этого эффекта новое сообщение уже в DOM, и scrollHeight уже
   * его учитывает. true по умолчанию — первые сообщения сами уезжают в низ.
   */
  const nearBottomRef = useRef(true);
  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
  };
  useEffect(() => {
    if (wall) {
      // scrollIntoView может отсутствовать в jsdom — опциональный вызов.
      wallRef.current?.scrollIntoView?.({ block: 'start' });
      return;
    }
    if (nearBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, partial, wall]);

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
      <div
        ref={listRef}
        onScroll={handleListScroll}
        data-testid="guest-messages-list"
        className="flex-1 space-y-4 overflow-y-auto px-4 py-6 ym-hide-content"
      >
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
              <GuestAnswer content={partial} streaming />
            ) : (
              <span className="text-sm text-gray-500">{t('guest.typing', { name: assistantName })}</span>
            )}
          </div>
        )}
        {wall && (
          <div ref={wallRef} data-testid="guest-wall" className="rounded-2xl border border-forest-100 bg-white p-5 shadow-sm">
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
