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

/**
 * token, initialMessages, initialLeft и draft читаются ТОЛЬКО при
 * монтировании (useState/useRef с ленивым начальным значением, draft — в
 * эффекте с deps []) — обновлённое значение этих пропсов у уже
 * смонтированного компонента не подхватится само (P4). Сменить ассистента
 * или восстановленную пробу — новым React `key` у <GuestChat>, что страница
 * и делает (GuestChatPage.tsx: key={`${assistantId}:${generation}`}).
 */
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
/**
 * 'busy' — остаётся за явным событием `error` с code:'busy' (сервер прислал
 * его посреди потока, обычно — перегружена сама модель). 'busyTrial' и
 * 'badRequest' — отдельные от него виды (M5): они приходят не событием
 * потока, а результатом хода целиком (409 «этот же ход уже пишется» и 400
 * соответственно), и означают разное — ревью качества B8 развело тексты.
 * 'interrupted' — обрыв связи ПОСЛЕ begin (I4, M11): сервер уже принял ход.
 */
type ErrorKind = 'model' | 'busy' | 'network' | 'interrupted' | 'badRequest' | 'busyTrial';

/** Та же отметка, что у галочки на экране входа: дал согласие здесь — там она уже стоит. */
const CONSENT_KEY = 'loginConsent';

function readConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === 'true'; } catch { return false; }
}

/**
 * Результат хода → вид ошибки на экране, когда явного события `error` не
 * было (ревью B4, M5). 'server' (403 чужого источника, 5xx — сервер ответил
 * отказом) показывается как «ассистент сейчас недоступен», а не как «нет
 * сети» — это разные причины и разные тексты для гостя. 'busy_trial' (409 —
 * у этой же пробы уже пишется ответ) и 'bad_request' (400) получили СВОИ
 * виды ошибки (M5) — раньше оба тонули в общих 'busy'/'model'.
 *
 * 'ok' сюда доходит, если поток закрылся без end/error/wall вовсе (досрочно,
 * но не исключением) — это тоже ошибка модели, текста разумнее не придумывать
 * новый. 'trial_gone' и 'aborted' уводят раньше отдельными ветками в send() и
 * этой функции не достигают, но перечислены явно (M6): switch — по ВСЕМ
 * значениям GuestSendResult и без default, поэтому новое значение в
 * GuestSendResult (добавленное без правки здесь) завалит `pnpm typecheck`
 * («Function lacks ending return statement») — но НЕ `pnpm build`, который
 * типы не проверяет.
 */
function errorKindForResult(result: GuestSendResult): ErrorKind {
  switch (result) {
    case 'busy_trial': return 'busyTrial';
    case 'network': return 'network';
    case 'server': return 'model';
    case 'bad_request': return 'badRequest';
    case 'ok': return 'model';
    case 'trial_gone': return 'model';
    case 'aborted': return 'model';
  }
}

/**
 * Служебные метки customMarkdown.tsx (__BUTTON_…__/__LINK_…__/…), оставшиеся
 * в тексте после parseCustomMarkdown: в пробе нет истории чата с состоянием и
 * обработчиков кнопок/карточек. __LINK_…__ меняется на текст ссылки (сама
 * ссылка не восстанавливается — это просто обычный текст). __IMAGE_…__ и
 * __VIDEO_…__ меняются на сам адрес: это голый URL, и remark-gfm autolink
 * сам превращает его в обычную ссылку, которую отрисует components.a ниже
 * (I2) — что для ссылки из {{link:}} намеренно не делается. Остальное —
 * пустой строкой (I1 ревью качества B8).
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
  // T2 (хвост по перепроверке 31.10): ленивый квантификатор [\w-]+? вместо
  // жадного [\w-]+. Жадный захватывал подчёркивания ЗА пределами собственного
  // id метки: (1) две соседние метки одного вида («{{link}}{{link}}» без
  // текста между ними) — жадный шёл через закрывающие `__` первой метки и
  // доходил до `__` второй, id получался один слипшийся и не находился в
  // карте — пропадали ОБЕ подписи; (2) голый адрес картинки/видео (I1/I2),
  // за которым сразу (без пробела) следует `_` из остального текста — жадный
  // прихватывал этот чужой `_` в id, не находил ключ в карте и терял саму
  // ссылку. Ленивый останавливается на первом же `__` после id — ровно на
  // границе метки.
  return text
    .replace(/__LINK_([\w-]+?)__/g, (_m, id: string) => links.get(id)?.text ?? '')
    .replace(/__IMAGE_([\w-]+?)__/g, (_m, id: string) => images.get(id) ?? '')
    .replace(/__VIDEO_([\w-]+?)__/g, (_m, id: string) => videos.get(id) ?? '')
    .replace(/__BUTTON_([\w-]+?)__/g, '')
    .replace(/__ASK_(\d+)__/g, '')
    .replace(/__PACTION_(\d+)__/g, '')
    .replace(/__AUDIO_CLIP_([\w-]+?)__/g, '')
    .replace(/__VOICECALL_([\w-]+?)__/g, '')
    .replace(/__MEETING_([\w-]+?)__/g, '');
}

/**
 * Ссылка ответа ассистента (I2): веб-адрес и почта/телефон — настоящая <a>.
 * Остальное (javascript:, data:, пустая, битая) — текстом без href: иначе её
 * открыли бы средняя кнопка или «Открыть в новой вкладке» мимо какой-либо
 * проверки. ym-disable-tracklink — мимо «Внешних переходов» Метрики, как и в
 * основном чате (webvisorPrivacy.test.ts).
 *
 * T3 (хвост по перепроверке 31.10): target="_blank" — ТОЛЬКО веб-адресам (в
 * пробе нет роутера кабинета, куда вести внутренний переход, поэтому вместо
 * внутренней навигации, как в основном чате, — честная новая вкладка).
 * mailto:/tel: не открывают вкладку вовсе — их подхватывает почтовая
 * программа/звонок, а target="_blank" на такой ссылке в Firefox оставляет
 * пустую вкладку висеть (как и в основном чате, createLinkComponent).
 */
const GuestLink: React.FC<{ href?: string; children?: React.ReactNode }> = ({ href, children }) => {
  const url = href ?? '';
  if (isContactLink(url)) {
    return (
      <a href={url} className="ym-disable-tracklink text-forest-600 underline hover:text-forest-700">
        {children}
      </a>
    );
  }
  if (isWebLink(url)) {
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
      {/*
        T3 (хвост по перепроверке 31.10, найдено при тесте на tel:):
        react-markdown по умолчанию сам зачищает href/src через свой
        defaultUrlTransform — пропускает только https?/ircs?/mailto/xmpp, а
        tel: превращает в '' ДО того, как href доходит до GuestLink. Из-за
        этого isContactLink('') всегда false, и обычная markdown-ссылка на
        телефон не рендерилась вовсе (мы же отдаём ровно isWebLink/
        isContactLink тексту — defaultUrlTransform здесь лишний, более
        узкий и необъяснённый слой). identity-функция отключает его: GuestLink/
        GuestImage ниже и так решают, какой href безопасен (javascript:/
        data: — проверено тестами, остаются текстом).
      */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={GUEST_MARKDOWN_COMPONENTS} urlTransform={(url) => url}>
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
  const [input, setInputState] = useState('');
  /**
   * Зеркало input (T1, хвост по перепроверке 31.10): к моменту отмены/сбоя
   * хода обычный `input` в замыкании send() уже устарел — он читается один
   * раз на старте хода (когда поле оптимистично очищается), а поле НЕ
   * блокируется на время хода (M2): человек может успеть напечатать своё,
   * пока ждёт ответ, и это нужно прочитать СЕЙЧАС, не то значение, что было
   * на старте. setInput ниже — единственная точка записи, обновляет и state
   * (что видно на экране), и это зеркало (что читает send()) вместе.
   */
  const inputRef = useRef('');
  const setInput = (value: string): void => {
    inputRef.current = value;
    setInputState(value);
  };
  const [sending, setSending] = useState(false);
  const [wall, setWall] = useState<Wall | null>(props.initialLeft === 0 ? 'limit' : null);
  const [error, setError] = useState<ErrorKind | null>(null);
  const [consent, setConsent] = useState<boolean>(readConsent);
  const tokenRef = useRef<string | null>(props.token);
  const draftTaken = useRef(false);
  /** Текущий ход (ревью B3) — чтобы оборвать его, если страница ушла раньше ответа. */
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Синхронный замок от двойной отправки (M1): sending — React state,
   * обновляется асинхронно, и быстрый повторный клик/Enter в тот же тик (до
   * перерисовки) всё ещё видел бы sending=false. Ref — обновляется немедленно.
   */
  const sendingRef = useRef(false);
  /**
   * Этот ход отменён ПОТОМУ, что завис (M11, см. send), а не потому, что
   * страница ушла (B3) — обе причины дают одинаковый result 'aborted', и без
   * этого признака их было бы не различить после await.
   */
  const stalledRef = useRef(false);
  /**
   * Компонент сейчас на экране. В StrictMode (I5) React синхронно монтирует
   * эффекты, тут же чистит (как при размонтировании) и монтирует снова —
   * cleanup-эффект B3 ниже успевает позвать abortRef.current?.abort() для
   * хода, который только что стартовал (например, автоотправка черновика),
   * хотя компонент никуда не делся. true изначально и на каждом (ре)монтировании,
   * false — только в cleanup; используется в send(), чтобы отличить этот
   * артефакт StrictMode от настоящего ухода со страницы.
   */
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
      // T4 (хвост по перепроверке 31.10): 'nearest', а не 'start' — стена
      // обычно приходит ВМЕСТЕ с третьим (последним) ответом, который уже в
      // кадре; 'start' пригвождает верх стены к верху экрана и уводит из
      // вида конец этого ответа, 'nearest' довернёт ленту ровно настолько,
      // чтобы стена стала видна, не отдирая от ответа над ней.
      wallRef.current?.scrollIntoView?.({ block: 'nearest' });
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

  /** Сервер шлёт ping раз в 20с (M11) — таймер зависания переживает обычный ход. */
  const STALL_MS = 60_000;

  /**
   * При откате/сбое хода (и для черновика savePendingDraft на стене) не
   * затирать то, что человек уже начал писать за время ожидания — приписать
   * СВОЙ текст ВПЕРЁД этого, а не взамен (T1, хвост по перепроверке 31.10:
   * поле не блокируется на время хода, M2, и человек успевает напечатать
   * новое, пока старое ждёт ответа). Возвращает склеенный текст — вызывающий
   * код использует его и для поля, и (на стене) для черновика: одна и та же
   * строка в обоих местах.
   */
  const restoreInput = (text: string): string => {
    const cur = inputRef.current;
    const merged = cur.trim() ? `${text}\n\n${cur}` : text;
    setInput(merged);
    return merged;
  };

  const send = async (raw: string) => {
    const message = raw.trim();
    // M1: sendingRef, а не sending — синхронный замок, видимый уже следующей
    // строкой, а не после перерисовки.
    if (!message || sendingRef.current || wall || !consent || message.length > config.maxChars) return;

    let bubbleAdded = false;
    /**
     * T5 (хвост по перепроверке 31.10): answered — ответ УЖЕ дописан в ленту;
     * bubbleRemoved — пузырь человека УЖЕ убран одной из веток ниже. catch не
     * должен слепо резать «последнее сообщение»: если ответ уже встал в
     * ленту, последнее — это ОН (бросок track()/onTrialGone() ПОСЛЕ успешного
     * ответа не должен его стирать); если пузырь уже убран своей веткой
     * (например, trial_gone), повторное «убрать последнее» в catch срезало бы
     * СЛЕДУЮЩЕЕ по счёту сообщение — чужое, из более ранней пары.
     */
    let answered = false;
    let bubbleRemoved = false;
    let silentAbort = false;
    try {
      // T5: замок (sendingRef, синхронный) и onBusyChange(true) — ВНУТРИ try,
      // чтобы finally их снял, даже если что-то из этих строк бросит
      // (например, чужой onBusyChange) — иначе sendingRef остаётся true
      // навсегда, и кнопка отправки блокируется до перезагрузки страницы.
      sendingRef.current = true;
      setSending(true);
      props.onBusyChange?.(true);
      setError(null);

      // Входные данные — ДО оптимистичных шагов (I6), но КАЖДОЕ в своём try
      // (T5, хвост по перепроверке 31.10): source/campaign/sid — атрибуция,
      // необязательная для сервера (сам ход эти поля не требует). Недоступное
      // хранилище (Safari private mode бросает на sessionStorage/localStorage)
      // не должно гасить отправку ошибкой «нет связи» — связь-то есть, просто
      // одно из необязательных полей не прочиталось; раньше бросок любого из
      // трёх уходил в общий catch ниже и показывал сетевую ошибку, хотя
      // сообщение вполне могло уйти.
      let source: string | null = null;
      let campaign: string | null = null;
      let sid: string | null = null;
      try { source = getSource(); } catch { /* необязательно для сервера */ }
      try { campaign = getCampaign(); } catch { /* необязательно для сервера */ }
      try { sid = getSessionId(); } catch { /* необязательно для сервера */ }

      const first = messages.length === 0;
      // T4 (хвост по перепроверке 31.10): собственная отправка ВСЕГДА
      // подводит ленту к низу, даже если человек до этого прокрутил вверх
      // читать историю — иначе свой же пузырь и «печатает…» могут остаться
      // вне кадра, и неясно, ушло ли сообщение.
      nearBottomRef.current = true;
      setPartial('');
      setInput('');
      setMessages((m) => [...m, { role: 'user', content: message }]);
      bubbleAdded = true;

      stalledRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;

      let began = false;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;
      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          stalledRef.current = true;
          controller.abort();
        }, STALL_MS);
      };
      resetStallTimer();

      let answer = null as string | null;
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
          source,
          campaign,
          sid,
        },
        (ev: GuestEvent) => {
          // M11: каждое событие (в т.ч. ping) отодвигает дедлайн зависания.
          resetStallTimer();
          if (ev.type === 'guest' && ev.token) {
            tokenRef.current = ev.token;
            props.onToken(ev.token);
          } else if (ev.type === 'begin') {
            // M10: страница узнаёт о начале хода, когда сервер его принял, —
            // не раньше отправки, когда он мог и не дойти.
            began = true;
            if (first) props.onStarted();
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
      if (stallTimer) clearTimeout(stallTimer);
      abortRef.current = null;

      if (result === 'aborted' && !stalledRef.current) {
        // Отмена не от защёлки зависания (M11) — страница ушла (B3) или это
        // синтетический cleanup-проход StrictMode (I5), оборвавший ещё не
        // начавшийся ход. Настоящий уход — молча: компонента уже нет, чтобы
        // показать на ней откат. StrictMode-артефакт — компонент на месте,
        // откатываем как обычный сбой, но без текста ошибки (ничего и не
        // ломалось — просто начнём ход заново на следующий тик).
        if (!mountedRef.current) { silentAbort = true; return; }
        setPartial(null);
        setMessages((m) => m.slice(0, -1));
        bubbleRemoved = true;
        restoreInput(message);
        return;
      }

      // Зависший поток (M11) отображается так же, как обрыв сети.
      const effectiveResult: GuestSendResult = result === 'aborted' ? 'network' : result;

      setPartial(null);

      if (effectiveResult === 'trial_gone') {
        setMessages((m) => m.slice(0, -1));
        bubbleRemoved = true;
        props.onTrialGone(message);
        return;
      }
      if (answer !== null) {
        // Стена может прийти ВМЕСТЕ с ответом (последний в пробе) — гасить
        // её отдельной веткой нельзя, проверка ниже общая для обоих случаев.
        const text = answer;
        setMessages((m) => [...m, { role: 'assistant', content: text }]);
        answered = true;
      } else {
        // Обрыв ПОСЛЕ begin (I4): сервер принял ход и запишет пару, даже
        // если клиент уйдёт, — пузырь остаётся, текст в поле не
        // возвращается (повтор продублировал бы уже уходящий ответ). Стена
        // важнее обрыва и имеет приоритет — как и раньше. T5 (хвост по
        // перепроверке 31.10): явный код ошибки (gotError) — тоже НЕ
        // interrupted, даже если итог хода вдобавок 'network' (поток мог
        // оборваться сразу после события error, не дойдя до чистого конца) —
        // сервер прямо назвал причину сбоя, и это не повод подменять её
        // обобщённым «связь прервалась».
        const interrupted = !gotWall && !gotError && effectiveResult === 'network' && began;
        if (!interrupted) {
          // Ответа нет — сообщение возвращается в поле: отправить ещё раз
          // или, если проба закрыта, дождаться входа черновиком с тем же
          // ассистентом.
          setMessages((m) => m.slice(0, -1));
          bubbleRemoved = true;
          // T1: черновик при стене — та же склейка с тем, что человек уже
          // успел напечатать (restoreInput), а не голый исходный message.
          const merged = restoreInput(message);
          if (gotWall) savePendingDraft(merged, assistantId);
        }
        if (!gotWall) {
          setError(gotError ?? (interrupted ? 'interrupted' : errorKindForResult(effectiveResult)));
        }
      }
      if (gotWall) {
        setWall(gotWall);
        track('guest_trial_wall', { reason: gotWall, assistant_id: assistantId });
      }
    } catch {
      // T1/T5 (найдено тестом catch-веток): если исключение прилетело ИЗ
      // самого sendGuestMessage (до строки setPartial(null) основного потока
      // ниже по функции — та выполняется только после проверки на 'aborted'),
      // partial остаётся '' (оптимистично выставлен в начале хода) — и
      // «печатает…» висел бы на экране навечно, хотя ход уже упал в catch.
      setPartial(null);
      // T5: catch ПОСЛЕ того, как ответ уже встал в ленту (answered), не
      // должен его стирать, если дальше бросит track()/onTrialGone() —
      // «последнее сообщение» в этот момент — сам ответ, не пузырь человека.
      // Если пузырь уже убран своей веткой (bubbleRemoved) — второй раз
      // резать не нужно, иначе «последним» стало бы чужое, более раннее
      // сообщение.
      if (bubbleAdded && !answered && !bubbleRemoved) setMessages((m) => m.slice(0, -1));
      restoreInput(message);
      setError('network');
    } finally {
      sendingRef.current = false;
      if (!silentAbort) {
        setSending(false);
        props.onBusyChange?.(false);
      }
    }
  };

  useEffect(() => {
    if (draftTaken.current || !props.draft) return;
    const draft = props.draft;
    // M8: черновик длиннее предела поля — только подставить, не отправлять
    // самим (отправка всё равно отсеклась бы проверкой длины в send()).
    const tooLong = draft.text.length > config.maxChars;
    if (!draft.auto || tooLong || !consent || messages.length > 0 || wall) {
      draftTaken.current = true;
      setInput(draft.text);
      return;
    }
    // I5 (StrictMode): автоотправка — через setTimeout(0), а не прямо здесь.
    // React в StrictMode синхронно монтирует эффекты, тут же чистит (как при
    // размонтировании) и монтирует снова; без отсрочки это успевает оборвать
    // сигналом ход, который только начался в первом (черновом) проходе.
    // setTimeout — макрозадача, она ждёт, пока весь этот синхронный цикл
    // отыграет, и запускает send() уже у устоявшегося компонента.
    //
    // draftTaken выставляется ТОЛЬКО когда таймер и впрямь выстрелил, а не
    // при его планировании: синтетический cleanup StrictMode снимает ещё не
    // выстрелившый таймер первого (чернового) прохода ДО того, как второй
    // (настоящий) проход успевает поставить свой — пометь draftTaken здесь,
    // и второй проход решил бы, что черновик уже обработан, и не поставил
    // бы свой таймер вовсе. Проверка внутри — на случай, если оба таймера
    // всё же переживут цикл: сработает только первый.
    const timer = setTimeout(() => {
      if (draftTaken.current) return;
      draftTaken.current = true;
      void send(draft.text);
    }, 0);
    return () => clearTimeout(timer);
    // Только при первом показе: черновик подставляется/отправляется один раз.
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
            <div key={i} className="ml-auto w-fit max-w-[85%] break-words whitespace-pre-wrap rounded-2xl rounded-br-md bg-forest-700 px-4 py-3 text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="w-fit max-w-[85%] break-words rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3">
              <GuestAnswer content={m.content} />
            </div>
          ),
        )}
        {partial !== null && (
          <div className="w-fit max-w-[85%] break-words rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3">
            {partial ? (
              <GuestAnswer content={partial} streaming />
            ) : (
              <span className="text-sm text-gray-500">{t('guest.typing', { name: assistantName })}</span>
            )}
          </div>
        )}
        {wall && (
          <div ref={wallRef} data-testid="guest-wall" className="rounded-2xl border border-forest-100 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900">{wall === 'limit' ? t('guest.wall.title') : t('guest.wall.closedTitle')}</h2>
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
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {t(`guest.errors.${error}`)}
              {(error === 'interrupted' || error === 'badRequest') && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="ml-2 font-semibold underline"
                >
                  {t('guest.reload')}
                </button>
              )}
            </p>
          )}
          {!consent && <LoginConsentBlock checked={consent} onChange={changeConsent} />}
          <div className="flex items-end gap-2">
            <textarea
              data-testid="guest-chat-input"
              // text-base (16px), md:text-sm — иначе iOS Safari зумит страницу
              // при фокусе на поле мельче 16px (I8, как в AskCard.tsx).
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-forest-600 ym-disable-keys"
              rows={2}
              maxLength={config.maxChars}
              value={input}
              // M2: поле не блокируется на время хода (locked включает sending)
              // — блокировка снимает фокус, а на мобиле прячет клавиатуру.
              // Блокируется только кнопка отправки, ниже. Пока проба не
              // закрыта стеной, поле всегда доступно.
              disabled={wall !== null}
              placeholder={t('guest.inputPlaceholder')}
              enterKeyHint="send"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // IME (zh/ja/ko): Enter подтверждает кандидата набора, а не
                // отправляет форму — keyCode 229 ловит браузеры, которые не
                // выставляют isComposing на этом событии (I9).
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <button
              type="button"
              // T5 (хвост по перепроверке 31.10): черновик длиннее maxChars
              // (подставленный, например, из savePendingDraft/draft — M8 не
              // отправляет его сам, но и textarea.maxLength не ограничивает
              // программную подстановку значения) — кнопка заблокирована, а
              // не тихо игнорирует клик: send() и так отсекла бы такой текст
              // по длине, но без disabled это выглядело бы как нерабочая
              // кнопка. Счётчик длины ниже — уже видимая подсказка почему.
              disabled={locked || !consent || !input.trim() || input.length > config.maxChars}
              onClick={() => void send(input)}
              className="rounded-xl bg-forest-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t('guest.send')}
            </button>
          </div>
          {/* M8: счётчик только числами и «/» — без перевода, чтобы не плодить
              ключ локали ради цифр. Виден после 80% предела, как предупреждение. */}
          {input.length > config.maxChars * 0.8 && (
            <p className="text-right text-xs text-gray-400">{input.length}/{config.maxChars}</p>
          )}
          <p className="text-xs text-gray-500">{t('guest.trialNote')}</p>
        </div>
      )}
    </div>
  );
};

export default GuestChat;
