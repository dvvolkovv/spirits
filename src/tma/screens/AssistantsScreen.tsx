import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getJson, postJson } from '../api';
import { closeApp } from '../telegram';
import { resolveLanguage } from '../../i18n/languages';
import { parseAgents, extractPreferredAgent, chooseAssistant, describeAgent, type Agent } from './assistantsFlow';

export function AssistantsScreen() {
  const { t, i18n } = useTranslation();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

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

  const choose = async (name: string) => {
    setSwitching(name);
    try {
      await chooseAssistant(name, {
        changeAgent: (n) => postJson('/webhook/change-agent', { agent: n }),
        closeApp,
      });
    } catch {
      // Смена не применилась — остаёмся на экране, ничего не закрываем.
      setSwitching(null);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">{t('tma.assistants.title')}</h1>
      <p className="mt-1 text-sm opacity-70">{t('tma.assistants.hint')}</p>

      {failed && <p className="mt-4 text-red-500">{t('tma.assistants.failed')}</p>}
      {!failed && agents === null && <p className="mt-4 opacity-60">…</p>}
      {agents?.length === 0 && <p className="mt-4 opacity-60">{t('tma.assistants.empty')}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {agents?.map((a) => {
          const { label, isCurrent } = describeAgent(a, current);
          return (
            <li key={a.id}>
              <button
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50"
                onClick={() => choose(a.name)}
                disabled={switching !== null}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                  {label.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1">
                  <span className="font-medium">{label}</span>
                  {a.description && <span className="block text-sm opacity-70">{a.description}</span>}
                </span>
                {isCurrent && (
                  <span className="rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">
                    {t('tma.assistants.current')}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
