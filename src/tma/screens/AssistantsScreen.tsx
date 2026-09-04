import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson, postJson } from '../api';
import { closeApp } from '../telegram';
import { resolveLanguage } from '../../i18n/languages';
import { parseAgents, extractPreferredAgent, chooseAssistant, describeAgent, type Agent } from './assistantsFlow';
import { Card } from '../../shared/ui/Card';
import { Avatar } from '../../shared/ui/Avatar';
import { loadAgentAvatars, releaseAvatars } from './agentAvatars';

/**
 * Экран звонка грузится только по нажатию: он тянет livekit-client весом
 * около полутора мегабайт, а мини-апп открывают с телефона. В стартовом
 * бандле ему делать нечего — звонят не при каждом открытии.
 */
const CallSheet = lazy(() => import('./CallSheet').then((m) => ({ default: m.CallSheet })));

export function AssistantsScreen() {
  const { t, i18n } = useTranslation();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchFailed, setSwitchFailed] = useState(false);

  useEffect(() => {
    const lang = resolveLanguage(i18n.language);
    getJson(`/webhook/agents?lang=${lang}`)
      .then((r) => setAgents(parseAgents(r)))
      .catch(() => setFailed(true));

    // «Текущий» ассистент не приходит вместе со списком (нет is_current в
    // ответе) — берём отдельно из профиля. Падение этого запроса не должно
    // прятать сам список: просто ни одна карточка не будет помечена.
    getJson('/webhook/profile')
      .then((r) => setCurrent(extractPreferredAgent(r)))
      .catch(() => {});
  }, [i18n.language]);

  /**
   * Фото ассистентов. Грузятся отдельно от списка: ручка отдаёт байты по
   * одному, и ждать их все, прежде чем показать имена, незачем — список
   * появляется сразу, фото подтягиваются следом.
   */
  const [avatars, setAvatars] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!agents?.length) return;
    let alive = true;
    let loaded: Record<number, string> = {};
    loadAgentAvatars(agents.map((a) => Number(a.id))).then((urls) => {
      loaded = urls;
      // Экран могли покинуть, пока грузилось: тогда сразу отзываем, иначе
      // блобы повиснут до перезагрузки страницы.
      if (alive) setAvatars(urls); else releaseAvatars(urls);
    });
    return () => { alive = false; releaseAvatars(loaded); };
  }, [agents]);

  const [calling, setCalling] = useState(false);

  const choose = async (name: string) => {
    setSwitching(name);
    setSwitchFailed(false);
    try {
      await chooseAssistant(name, {
        changeAgent: (n) => postJson('/webhook/change-agent', { agent: n }),
        closeApp,
      });
      // Подтверждение на месте: окно больше не закрывается само, человек
      // должен увидеть, что смена произошла.
      setCurrent(name);
    } catch {
      setSwitchFailed(true);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t('tma.assistants.title')}</h1>
      <p className="mt-1 text-sm text-gray-500">{t('tma.assistants.hint')}</p>

      {failed && <p className="mt-4 text-red-600">{t('tma.assistants.failed')}</p>}
      {switchFailed && <p className="mt-4 text-red-600">{t('tma.assistants.switchFailed')}</p>}
      {!failed && agents === null && <p className="mt-4 text-gray-400">…</p>}
      {agents?.length === 0 && <p className="mt-4 text-gray-400">{t('tma.assistants.empty')}</p>}

      {/* Звонок ведущему. Стоит рядом с «Написать»: это два способа начать
          один и тот же разговор, и разносить их по экрану незачем. */}
      <button
        onClick={() => setCalling(true)}
        className="mt-4 w-full rounded-2xl border border-forest-700 px-4 py-3 font-medium text-forest-700"
      >
        {t('tma.call.callRoman')}
      </button>

      {calling && (
        <Suspense fallback={null}>
          <CallSheet onClose={() => setCalling(false)} />
        </Suspense>
      )}

      {current && (
        <button
          className="mt-4 w-full rounded-2xl bg-green-600 px-4 py-3 font-medium text-white"
          onClick={closeApp}
        >
          {t('tma.assistants.writeTo', { name: current })}
        </button>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {agents?.map((a) => {
          const { label, isCurrent } = describeAgent(a, current);
          return (
            <li key={a.id}>
              <Card onClick={() => choose(a.name)} disabled={switching !== null}>
                <span className="flex items-center gap-3">
                  <Avatar name={label} src={avatars[Number(a.id)]} />
                  <span className="flex-1">
                    <span className="font-medium">{label}</span>
                    {a.description && (
                      <span className="block text-sm text-gray-500">{a.description}</span>
                    )}
                  </span>
                  {isCurrent && (
                    <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">
                      {t('tma.assistants.current')}
                    </span>
                  )}
                </span>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
