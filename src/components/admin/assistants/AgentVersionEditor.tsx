import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, FileClock, Save, Upload } from 'lucide-react';
import { agentVersionsApi } from '../../../services/agentVersionsApi';
import type { AgentVersion } from '../../../services/agentVersionsApi';
import { lineDiff } from './lineDiff';

interface Props {
  agentId: number;
  initialDescription: string;
  initialPrompt: string;
  onDirtyChange?: (dirty: boolean) => void;
}

type Mode = 'draft' | 'published' | 'history';

const statusLabels: Record<AgentVersion['status'], string> = {
  draft: 'Черновик',
  published: 'Опубликована',
  superseded: 'Заменена',
};

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function isConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error &&
    (error as { status?: unknown }).status === 409;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

const AgentVersionEditor: React.FC<Props> = ({
  agentId,
  initialDescription,
  initialPrompt,
  onDirtyChange,
}) => {
  const initialRef = useRef({ initialDescription, initialPrompt });
  initialRef.current = { initialDescription, initialPrompt };

  const [activeAgentId, setActiveAgentId] = useState(agentId);
  const [mode, setMode] = useState<Mode>('draft');
  const [published, setPublished] = useState<AgentVersion | null>(null);
  const [draft, setDraft] = useState<AgentVersion | null>(null);
  const [baseVersionId, setBaseVersionId] = useState<string | null>(null);
  const [description, setDescription] = useState(initialDescription);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [history, setHistory] = useState<AgentVersion[]>([]);
  const [showDiff, setShowDiff] = useState(false);
  const [diffViewed, setDiffViewed] = useState(false);

  useEffect(() => {
    if (agentId === activeAgentId) return;
    if (dirty && !window.confirm('Есть несохранённые изменения. Переключить ассистента и потерять их?')) {
      return;
    }
    setActiveAgentId(agentId);
  }, [agentId, activeAgentId, dirty]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setNotice(null);
    setMode('draft');
    setPublished(null);
    setDraft(null);
    setBaseVersionId(null);
    setDescription(initialRef.current.initialDescription);
    setPrompt(initialRef.current.initialPrompt);
    setDirty(false);
    setHistory([]);
    setShowDiff(false);
    setDiffViewed(false);

    agentVersionsApi.state(activeAgentId)
      .then((next) => {
        if (cancelled) return;
        const source = next.draft ?? next.published;
        setPublished(next.published);
        setDraft(next.draft);
        setBaseVersionId(next.draft?.base_version_id ?? next.published?.id ?? null);
        setDescription(source?.description ?? initialRef.current.initialDescription);
        setPrompt(source?.system_prompt ?? initialRef.current.initialPrompt);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(`Не удалось загрузить версии: ${errorMessage(loadError, 'неизвестная ошибка')}`);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAgentId]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (mode !== 'history') return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    agentVersionsApi.versions(activeAgentId, 50)
      .then((items) => {
        if (!cancelled) setHistory(items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(`Не удалось загрузить историю: ${errorMessage(loadError, 'неизвестная ошибка')}`);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, activeAgentId]);

  const diff = useMemo(
    () => lineDiff(published?.system_prompt ?? '', prompt),
    [published?.system_prompt, prompt],
  );

  const markDirty = () => {
    setDirty(true);
    setNotice(null);
    setError(null);
    setShowDiff(false);
    setDiffViewed(false);
  };

  const switchMode = (nextMode: Mode) => {
    if (nextMode === mode || busy) return;
    if (dirty && !window.confirm('Есть несохранённые изменения. Покинуть черновик и потерять их?')) {
      return;
    }
    if (dirty) {
      const source = draft ?? published;
      setDescription(source?.description ?? initialRef.current.initialDescription);
      setPrompt(source?.system_prompt ?? initialRef.current.initialPrompt);
      setDirty(false);
    }
    setError(null);
    setNotice(null);
    setShowDiff(false);
    setDiffViewed(false);
    setMode(nextMode);
  };

  const saveDraft = async () => {
    if (busy || !dirty) return;
    if (!baseVersionId) {
      setError('Не найдена базовая версия. Обновите состояние ассистента перед сохранением черновика.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await agentVersionsApi.createDraft(activeAgentId, {
        description,
        system_prompt: prompt,
        base_version_id: baseVersionId,
      });
      setDraft(saved);
      setBaseVersionId(saved.base_version_id ?? baseVersionId);
      setDirty(false);
      setShowDiff(false);
      setDiffViewed(false);
      setNotice('Черновик сохранён. Опубликованная версия не изменилась.');
    } catch (saveError: unknown) {
      const message = errorMessage(saveError, 'неизвестная ошибка');
      setError(isConflict(saveError)
        ? `Конфликт версий: ${message}. Ваши правки сохранены в форме. Посмотрите diff и сохраните черновик после разрешения конфликта.`
        : `Не удалось сохранить черновик: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleDiff = () => {
    setShowDiff((visible) => {
      if (!visible) setDiffViewed(true);
      return !visible;
    });
    setError(null);
  };

  const publishDraft = async () => {
    if (busy) return;
    if (!draft || dirty || !diffViewed) {
      setError('Сначала сохраните черновик и посмотрите diff');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const publishedVersion = await agentVersionsApi.publish(
        activeAgentId,
        draft.id,
        published?.id ?? null,
      );
      setPublished(publishedVersion);
      setDraft(null);
      setBaseVersionId(publishedVersion.id);
      setDescription(publishedVersion.description);
      setPrompt(publishedVersion.system_prompt);
      setDirty(false);
      setShowDiff(false);
      setDiffViewed(false);
      setMode('published');

      const [nextState, nextHistory] = await Promise.all([
        agentVersionsApi.state(activeAgentId),
        agentVersionsApi.versions(activeAgentId, 50),
      ]);
      const currentPublished = nextState.published ?? publishedVersion;
      setPublished(nextState.published);
      setDraft(nextState.draft);
      setHistory(nextHistory);
      setBaseVersionId(nextState.draft?.base_version_id ?? currentPublished.id);
      setDescription(currentPublished.description);
      setPrompt(currentPublished.system_prompt);
      setNotice('Версия опубликована.');
    } catch (publishError: unknown) {
      const message = errorMessage(publishError, 'неизвестная ошибка');
      setError(isConflict(publishError)
        ? `Конфликт версий: ${message}. Опубликованная версия изменилась, ваши правки не перезаписаны.`
        : `Не удалось опубликовать версию: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const createFromHistory = async (version: AgentVersion) => {
    const latest = history[0];
    if (!latest || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await agentVersionsApi.createDraft(activeAgentId, {
        description: version.description,
        system_prompt: version.system_prompt,
        base_version_id: latest.id,
      });
      setDraft(created);
      setBaseVersionId(latest.id);
      setDescription(created.description);
      setPrompt(created.system_prompt);
      setDirty(false);
      setShowDiff(false);
      setDiffViewed(false);
      setMode('draft');
      setNotice(`Черновик создан из версии ${version.version}.`);
    } catch (createError: unknown) {
      const message = errorMessage(createError, 'неизвестная ошибка');
      setError(isConflict(createError)
        ? `Конфликт версий: ${message}. Локальные правки не перезаписаны.`
        : `Не удалось создать черновик из версии: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const modeButton = (value: Mode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      disabled={busy}
      onClick={() => switchMode(value)}
      className={mode === value
        ? 'px-3 py-2 rounded-lg bg-forest-600 text-white text-sm font-medium'
        : 'px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 disabled:opacity-50'}
    >
      {label}
    </button>
  );

  const metadata = (version: AgentVersion | null) => version && (
    <p className="text-xs text-gray-500">
      Версия {version.version} · {statusLabels[version.status]} · {version.created_by} · {formatDate(version.created_at)}
    </p>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {modeButton('draft', 'Черновик')}
        {modeButton('published', 'Опубликовано')}
        {modeButton('history', 'История')}
      </div>

      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          {notice}
        </div>
      )}

      {mode === 'draft' && (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Редактирование черновика</h3>
              {metadata(draft)}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={toggleDiff}
                className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm flex items-center"
              >
                {showDiff ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                {showDiff ? 'Скрыть diff' : 'Показать diff'}
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={busy || !dirty}
                className="px-3 py-2 bg-forest-600 hover:bg-forest-700 text-white rounded-lg text-sm flex items-center disabled:bg-gray-200 disabled:text-gray-500"
              >
                <Save className="w-4 h-4 mr-1" />
                {busy ? 'Сохранение...' : 'Сохранить черновик'}
              </button>
              <button
                type="button"
                onClick={publishDraft}
                disabled={busy}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm flex items-center disabled:opacity-50"
              >
                <Upload className="w-4 h-4 mr-1" />
                Опубликовать
              </button>
            </div>
          </div>
          {dirty && <p className="text-sm text-amber-600">Есть несохранённые изменения</p>}

          <div>
            <label htmlFor={`agent-description-${activeAgentId}`} className="block text-sm font-medium text-gray-700 mb-2">
              Описание ассистента
            </label>
            <textarea
              id={`agent-description-${activeAgentId}`}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                markDirty();
              }}
              className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">Символов: {description.length}</p>
          </div>

          <div>
            <label htmlFor={`agent-prompt-${activeAgentId}`} className="block text-sm font-medium text-gray-700 mb-2">
              Системный промпт
            </label>
            <textarea
              id={`agent-prompt-${activeAgentId}`}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                markDirty();
              }}
              className="w-full h-96 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">Символов: {prompt.length}</p>
          </div>

          {showDiff && (
            <section className="border border-gray-200 rounded-lg overflow-hidden">
              <h3 className="px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-800">
                Изменения относительно опубликованной версии
              </h3>
              <div className="font-mono text-xs overflow-x-auto">
                {diff.length === 0 ? (
                  <p className="p-4 text-gray-500">Изменений нет</p>
                ) : diff.map((row, index) => (
                  <div
                    key={index}
                    className={`${row.kind} px-4 py-1 whitespace-pre-wrap break-words ${
                      row.kind === 'added'
                        ? 'bg-green-50 text-green-900'
                        : row.kind === 'removed'
                          ? 'bg-red-50 text-red-900'
                          : 'text-gray-600'
                    }`}
                  >
                    {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}
                    {' '}{row.kind === 'added' ? row.right : row.left}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {mode === 'published' && (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Опубликованная версия · Только чтение</h3>
            {metadata(published)}
          </div>
          <div>
            <label htmlFor={`agent-description-${activeAgentId}`} className="block text-sm font-medium text-gray-700 mb-2">
              Описание ассистента
            </label>
            <textarea
              id={`agent-description-${activeAgentId}`}
              readOnly
              value={published?.description ?? ''}
              className="w-full h-24 px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700"
            />
          </div>
          <div>
            <label htmlFor={`agent-prompt-${activeAgentId}`} className="block text-sm font-medium text-gray-700 mb-2">
              Системный промпт
            </label>
            <textarea
              id={`agent-prompt-${activeAgentId}`}
              readOnly
              value={published?.system_prompt ?? ''}
              className="w-full h-96 px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 font-mono text-sm text-gray-700"
            />
          </div>
        </div>
      )}

      {mode === 'history' && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center">
            <FileClock className="w-4 h-4 mr-2 text-forest-600" />
            Последние 50 версий
          </h3>
          {busy && history.length === 0 ? (
            <p className="text-sm text-gray-500">Загрузка истории...</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500">Версий пока нет</p>
          ) : (
            <div className="space-y-3">
              {history.map((version) => (
                <article
                  key={version.id}
                  data-testid={`agent-version-${version.id}`}
                  className="p-4 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">
                        Версия {version.version} · {statusLabels[version.status]}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {version.created_by} · {formatDate(version.created_at)}
                      </p>
                      <p className="text-sm text-gray-600 mt-2">{version.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => createFromHistory(version)}
                      className="px-3 py-2 border border-forest-300 text-forest-700 rounded-lg hover:bg-forest-50 text-sm whitespace-nowrap disabled:opacity-50"
                    >
                      Создать черновик из версии
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default AgentVersionEditor;
