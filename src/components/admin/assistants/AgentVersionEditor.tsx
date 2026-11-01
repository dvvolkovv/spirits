import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, FileClock, Save, Upload } from 'lucide-react';
import { agentVersionsApi } from '../../../services/agentVersionsApi';
import type { AgentVersion } from '../../../services/agentVersionsApi';
import AgentTestChat from './AgentTestChat';
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

  const [mode, setMode] = useState<Mode>('draft');
  const [published, setPublished] = useState<AgentVersion | null>(null);
  const [draft, setDraft] = useState<AgentVersion | null>(null);
  const [baseVersionId, setBaseVersionId] = useState<string | null>(null);
  const [description, setDescription] = useState(initialDescription);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshFailure, setRefreshFailure] = useState<'publish' | 'conflict' | null>(null);
  const [busy, setBusy] = useState(true);
  const [history, setHistory] = useState<AgentVersion[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [diffViewed, setDiffViewed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setNotice(null);
    setRefreshFailure(null);
    setMode('draft');
    setPublished(null);
    setDraft(null);
    setBaseVersionId(null);
    setDescription(initialRef.current.initialDescription);
    setPrompt(initialRef.current.initialPrompt);
    setDirty(false);
    setHistory([]);
    setExpandedHistoryId(null);
    setShowDiff(false);
    setDiffViewed(false);

    agentVersionsApi.state(agentId)
      .then((next) => {
        if (cancelled) return;
        const source = next.draft ?? next.published;
        setPublished(next.published);
        setDraft(next.draft);
        setBaseVersionId(next.draft?.id ?? next.published?.id ?? null);
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
  }, [agentId]);

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
    agentVersionsApi.versions(agentId, 50)
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
  }, [mode, agentId]);

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

  const markDraftDivergence = (
    nextDraft: AgentVersion | null,
    localDescription = description,
    localPrompt = prompt,
  ) => {
    if (nextDraft && (
      localDescription !== nextDraft.description || localPrompt !== nextDraft.system_prompt
    )) {
      setDirty(true);
    }
  };

  const reloadAfterConflict = async () => {
    const [nextState, nextHistory] = await Promise.all([
      agentVersionsApi.state(agentId),
      agentVersionsApi.versions(agentId, 50),
    ]);
    setPublished(nextState.published);
    setDraft(nextState.draft);
    setHistory(nextHistory);
    setBaseVersionId(nextState.draft?.id ?? nextState.published?.id ?? null);
    setShowDiff(false);
    setDiffViewed(false);
    markDraftDivergence(nextState.draft);
  };

  const recoverConflict = async () => {
    setError('Версия изменилась другим администратором');
    try {
      await reloadAfterConflict();
      setRefreshFailure(null);
    } catch {
      setRefreshFailure('conflict');
    }
  };

  const refreshPublishedState = async (publishedVersion: AgentVersion) => {
    const [nextState, nextHistory] = await Promise.all([
      agentVersionsApi.state(agentId),
      agentVersionsApi.versions(agentId, 50),
    ]);
    const currentPublished = nextState.published ?? publishedVersion;
    setPublished(currentPublished);
    setDraft(nextState.draft);
    setHistory(nextHistory);
    setBaseVersionId(nextState.draft?.id ?? currentPublished.id);
    setDescription(currentPublished.description);
    setPrompt(currentPublished.system_prompt);
    markDraftDivergence(
      nextState.draft,
      currentPublished.description,
      currentPublished.system_prompt,
    );
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
    setRefreshFailure(null);
    try {
      const saved = await agentVersionsApi.createDraft(agentId, {
        description,
        system_prompt: prompt,
        base_version_id: baseVersionId,
      });
      setDraft(saved);
      setBaseVersionId(saved.id);
      setDescription(saved.description);
      setPrompt(saved.system_prompt);
      setDirty(false);
      setShowDiff(false);
      setDiffViewed(false);
      setNotice('Черновик сохранён. Опубликованная версия не изменилась.');
    } catch (saveError: unknown) {
      if (isConflict(saveError)) {
        await recoverConflict();
      } else {
        setError(`Не удалось сохранить черновик: ${errorMessage(saveError, 'неизвестная ошибка')}`);
      }
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

  const draftMatchesLocal = !!draft &&
    draft.description === description && draft.system_prompt === prompt;

  const publishDraft = async () => {
    if (busy) return;
    if (!draft || dirty || !diffViewed || !draftMatchesLocal) {
      if (draft && !draftMatchesLocal) setDirty(true);
      setError('Сначала сохраните черновик и посмотрите diff');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setRefreshFailure(null);

    let publishedVersion: AgentVersion;
    try {
      publishedVersion = await agentVersionsApi.publish(
        agentId,
        draft.id,
        published?.id ?? null,
      );
    } catch (publishError: unknown) {
      if (isConflict(publishError)) {
        await recoverConflict();
      } else {
        setError(`Не удалось опубликовать версию: ${errorMessage(publishError, 'неизвестная ошибка')}`);
      }
      setBusy(false);
      return;
    }

    setPublished(publishedVersion);
    setDraft(null);
    setBaseVersionId(publishedVersion.id);
    setDescription(publishedVersion.description);
    setPrompt(publishedVersion.system_prompt);
    setDirty(false);
    setShowDiff(false);
    setDiffViewed(false);
    setMode('published');
    setNotice('Версия опубликована.');

    try {
      await refreshPublishedState(publishedVersion);
      setRefreshFailure(null);
    } catch {
      setRefreshFailure('publish');
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
    setRefreshFailure(null);
    try {
      const created = await agentVersionsApi.createDraft(agentId, {
        description: version.description,
        system_prompt: version.system_prompt,
        base_version_id: latest.id,
      });
      setDraft(created);
      setBaseVersionId(created.id);
      setDescription(created.description);
      setPrompt(created.system_prompt);
      setDirty(false);
      setShowDiff(false);
      setDiffViewed(false);
      setMode('draft');
      setNotice(`Черновик создан из версии ${version.version}.`);
    } catch (createError: unknown) {
      if (isConflict(createError)) {
        await recoverConflict();
      } else {
        setError(`Не удалось создать черновик из версии: ${errorMessage(createError, 'неизвестная ошибка')}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const retryRefresh = async () => {
    if (!refreshFailure || busy) return;
    const failure = refreshFailure;
    setBusy(true);
    try {
      if (failure === 'publish' && published) {
        await refreshPublishedState(published);
      } else if (failure === 'conflict') {
        await reloadAfterConflict();
      }
      setRefreshFailure(null);
    } catch {
      setRefreshFailure(failure);
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
  const publishUnavailable = busy || !draft || dirty || !diffViewed || !draftMatchesLocal;

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
      {refreshFailure && (
        <div role="alert" className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 flex flex-wrap items-center gap-3">
          <span>
            {refreshFailure === 'publish'
              ? 'Опубликовано, но не удалось обновить состояние'
              : 'Не удалось обновить состояние после конфликта'}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={retryRefresh}
            className="px-3 py-1 border border-amber-400 rounded-lg hover:bg-amber-100 disabled:opacity-50"
          >
            Повторить обновление
          </button>
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
                disabled={publishUnavailable}
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm flex items-center disabled:opacity-50"
              >
                <Upload className="w-4 h-4 mr-1" />
                Опубликовать
              </button>
            </div>
          </div>
          {publishUnavailable && (
            <p className="text-sm text-gray-500">Сначала сохраните черновик и посмотрите diff</p>
          )}
          {dirty && <p className="text-sm text-amber-600">Есть несохранённые изменения</p>}

          <div>
            <label htmlFor={`agent-description-${agentId}`} className="block text-sm font-medium text-gray-700 mb-2">
              Описание ассистента
            </label>
            <textarea
              id={`agent-description-${agentId}`}
              value={description}
              disabled={busy}
              onChange={(event) => {
                setDescription(event.target.value);
                markDirty();
              }}
              className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent text-sm"
            />
            <p className="text-xs text-gray-500 mt-2">Символов: {description.length}</p>
          </div>

          <div>
            <label htmlFor={`agent-prompt-${agentId}`} className="block text-sm font-medium text-gray-700 mb-2">
              Системный промпт
            </label>
            <textarea
              id={`agent-prompt-${agentId}`}
              value={prompt}
              disabled={busy}
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

          {draft && !dirty && draftMatchesLocal && (
            <AgentTestChat key={draft.id} agentId={agentId} versionId={draft.id} />
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
            <label htmlFor={`agent-description-${agentId}`} className="block text-sm font-medium text-gray-700 mb-2">
              Описание ассистента
            </label>
            <textarea
              id={`agent-description-${agentId}`}
              readOnly
              value={published?.description ?? ''}
              className="w-full h-24 px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700"
            />
          </div>
          <div>
            <label htmlFor={`agent-prompt-${agentId}`} className="block text-sm font-medium text-gray-700 mb-2">
              Системный промпт
            </label>
            <textarea
              id={`agent-prompt-${agentId}`}
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
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-expanded={expandedHistoryId === version.id}
                        aria-controls={`agent-history-prompt-${version.id}`}
                        onClick={() => setExpandedHistoryId(
                          expandedHistoryId === version.id ? null : version.id,
                        )}
                        className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm whitespace-nowrap"
                      >
                        {expandedHistoryId === version.id ? 'Скрыть промпт' : 'Показать промпт'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => createFromHistory(version)}
                        className="px-3 py-2 border border-forest-300 text-forest-700 rounded-lg hover:bg-forest-50 text-sm whitespace-nowrap disabled:opacity-50"
                      >
                        Создать черновик из версии
                      </button>
                    </div>
                  </div>
                  {expandedHistoryId === version.id && (
                    <textarea
                      id={`agent-history-prompt-${version.id}`}
                      aria-label={`Системный промпт версии ${version.version}`}
                      readOnly
                      value={version.system_prompt}
                      className="w-full h-56 mt-4 px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 font-mono text-sm text-gray-700"
                    />
                  )}
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
