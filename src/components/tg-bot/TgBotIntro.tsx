import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Send, Server } from 'lucide-react';

interface Props {
  /**
   * Развёрнута ли карточка при появлении. Решает список ботов: тому, у кого
   * нет ни одного, нужно объяснение целиком, остальным — строка заголовка.
   */
  defaultOpen: boolean;
  /** Открыть «Продукты»: собственного бота для клиентов делают там. */
  onOpenProducts: () => void;
}

/**
 * Что за бот живёт на этой вкладке — и чем он не является.
 *
 * Сюда приходят с лендинга (секция «Сайты и боты», utm_content=sites), где
 * «телеграм-бот» — это продукт с токеном от @BotFather. Бот этой вкладки
 * другой: ассистент Linkeon в своей группе. Поэтому карточка кончается
 * указателем на «Продукты» — без него человек, пришедший за ботом для
 * клиентов, решает, что такого у нас нет.
 *
 * Каждое утверждение текста сверено с бэкендом (src/tg-bot): за ответы всем
 * участникам платит владелец; сообщения группы сохраняются ещё до решения,
 * отвечать ли (кроме пришедших при нулевом балансе и ссылок на встречу), и
 * видны ему в «Истории». Меняется поведение бота — меняется и текст.
 */
export const TgBotIntro: React.FC<Props> = ({ defaultOpen, onOpenProducts }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  const why = [
    ['work', t('tgBot.intro.why_work')],
    ['family', t('tgBot.intro.why_family')],
    ['personal', t('tgBot.intro.why_personal')],
  ] as const;
  const how = [
    ['link', t('tgBot.intro.how_link')],
    ['setup', t('tgBot.intro.how_setup')],
    ['add', t('tgBot.intro.how_add')],
  ] as const;

  return (
    <section className="mb-5 bg-white rounded-2xl border border-gray-200">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          // Тело в свёрнутом виде не рисуется, и ссылаться было бы не на что.
          aria-controls={open ? bodyId : undefined}
          className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left"
        >
          <span className="w-9 h-9 rounded-xl bg-forest-100 text-forest-700 flex items-center justify-center shrink-0">
            <Send size={18} />
          </span>
          <span className="flex-1 font-semibold text-gray-900">{t('tgBot.intro.title')}</span>
          <ChevronDown
            size={18}
            className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>

      {open && (
        <div id={bodyId} className="px-4 sm:px-5 pb-5 space-y-4 text-sm text-gray-600">
          <p>{t('tgBot.intro.lead')}</p>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">{t('tgBot.intro.why_title')}</h3>
            <ul className="list-disc pl-5 space-y-1.5 marker:text-forest-700">
              {why.map(([k, text]) => <li key={k}>{text}</li>)}
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1.5">{t('tgBot.intro.how_title')}</h3>
            <ol className="space-y-1.5">
              {how.map(([k, text], i) => (
                <li key={k} className="flex gap-2.5">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-forest-100 text-forest-700 text-xs font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t('tgBot.intro.cost_title')}</h3>
            <p>{t('tgBot.intro.cost')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-1">{t('tgBot.intro.note_title')}</h3>
            <p>{t('tgBot.intro.note_history')}</p>
            <p className="mt-1">{t('tgBot.intro.note_commands')}</p>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p>{t('tgBot.intro.products')}</p>
            <button
              type="button"
              onClick={onOpenProducts}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-forest-600 text-forest-700 hover:bg-forest-50 font-medium transition-colors"
            >
              <Server size={16} /> {t('tgBot.intro.products_button')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
