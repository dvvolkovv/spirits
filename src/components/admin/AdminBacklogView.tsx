import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Plus, ChevronDown, ChevronRight, Loader, MessageSquare, Trash2, Save, X, Pencil, RefreshCw } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

type Status = 'proposed' | 'approved' | 'in_progress' | 'done' | 'rejected';
type Complexity = 'low' | 'medium' | 'high';

interface BacklogItem {
  id: string;
  title: string;
  analysis_md: string;
  effort: string | null;
  complexity: Complexity | null;
  costs: string | null;
  status: Status;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  comments_count?: number;
}

interface BacklogComment {
  id: string;
  item_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
}

const STATUS_PILL: Record<Status, string> = {
  proposed:    'bg-gray-100 text-gray-700 border-gray-300',
  approved:    'bg-blue-50 text-blue-700 border-blue-300',
  in_progress: 'bg-amber-50 text-amber-800 border-amber-300',
  done:        'bg-emerald-50 text-emerald-700 border-emerald-300',
  rejected:    'bg-rose-50 text-rose-700 border-rose-300',
};

const COMPLEXITY_PILL: Record<Complexity, string> = {
  low:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high:   'bg-rose-50 text-rose-700 border-rose-200',
};

const STATUS_FILTERS: Array<{ id: 'all' | Status; }> = [
  { id: 'all' }, { id: 'proposed' }, { id: 'approved' }, { id: 'in_progress' }, { id: 'done' }, { id: 'rejected' },
];

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};

const AdminBacklogView: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentsByItem, setCommentsByItem] = useState<Record<string, BacklogComment[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await apiClient.post('/webhook/admin/backlog', { action: 'list' });
      if (!r.ok) throw new Error(`${t('admin.backlog.errors.load')}: ${r.status}`);
      setItems(await r.json());
    } catch (e: any) {
      setError(e.message || t('admin.backlog.errors.unknown'));
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => filter === 'all' ? items : items.filter((i) => i.status === filter),
    [items, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const s of ['proposed', 'approved', 'in_progress', 'done', 'rejected'] as Status[]) {
      c[s] = items.filter((i) => i.status === s).length;
    }
    return c;
  }, [items]);

  const expand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!commentsByItem[id]) {
      try {
        const r = await apiClient.post('/webhook/admin/backlog', { action: 'get', id });
        if (r.ok) {
          const data = await r.json();
          setCommentsByItem((m) => ({ ...m, [id]: data.comments || [] }));
        }
      } catch { /* silent */ }
    }
  };

  const upsertItem = (item: BacklogItem) => {
    setItems((prev) => {
      const ix = prev.findIndex((p) => p.id === item.id);
      if (ix === -1) return [item, ...prev];
      const next = prev.slice();
      next[ix] = { ...next[ix], ...item };
      return next;
    });
  };

  const onCreated = (item: BacklogItem) => {
    upsertItem(item);
    setShowCreate(false);
    setExpandedId(item.id);
  };

  const onUpdated = (item: BacklogItem) => {
    upsertItem(item);
    setEditingId(null);
  };

  const removeItem = async (id: string) => {
    if (!confirm(t('admin.backlog.confirm_delete'))) return;
    try {
      const r = await apiClient.post('/webhook/admin/backlog', { action: 'delete', id });
      if (!r.ok) throw new Error(`${r.status}`);
      setItems((prev) => prev.filter((p) => p.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e: any) {
      alert(`${t('admin.backlog.errors.delete')}: ${e.message}`);
    }
  };

  const changeStatus = async (id: string, status: Status) => {
    try {
      const r = await apiClient.post('/webhook/admin/backlog', { action: 'update', id, status });
      if (!r.ok) throw new Error(`${r.status}`);
      onUpdated(await r.json());
    } catch (e: any) {
      alert(`${t('admin.backlog.errors.update')}: ${e.message}`);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="border-b border-gray-200 bg-white flex-shrink-0">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={clsx(
                  'flex-shrink-0 whitespace-nowrap px-3 py-1.5 text-sm font-medium rounded-full border transition-colors',
                  filter === f.id ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-gray-600 border-gray-200 hover:border-forest-300',
                )}
              >
                {t(`admin.backlog.filters.${f.id}`)} <span className="opacity-60">({counts[f.id] ?? 0})</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => load()}
              disabled={loading}
              title={t('admin.backlog.refresh')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-600 text-sm font-medium rounded-md border border-gray-200 hover:border-forest-300 hover:text-forest-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
              <span className="hidden sm:inline">{t('admin.backlog.refresh')}</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-forest-600 text-white text-sm font-medium rounded-md hover:bg-forest-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('admin.backlog.add')}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Loader className="w-4 h-4 animate-spin" />
            {t('admin.backlog.loading')}
          </div>
        )}
        {error && <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-sm">{error}</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-gray-500 text-sm text-center py-12">{t('admin.backlog.empty')}</div>
        )}

        {showCreate && (
          <ItemEditor
            mode="create"
            onCancel={() => setShowCreate(false)}
            onSaved={onCreated}
          />
        )}

        {filtered.map((item) => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {editingId === item.id ? (
              <ItemEditor
                mode="edit"
                initial={item}
                onCancel={() => setEditingId(null)}
                onSaved={onUpdated}
              />
            ) : (
              <>
                <button
                  onClick={() => expand(item.id)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                >
                  {expandedId === item.id
                    ? <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                    : <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-medium text-gray-900 truncate">{item.title}</h3>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full border', STATUS_PILL[item.status])}>
                        {t(`admin.backlog.status.${item.status}`)}
                      </span>
                      {item.complexity && (
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full border', COMPLEXITY_PILL[item.complexity])}>
                          {t(`admin.backlog.complexity.${item.complexity}`)}
                        </span>
                      )}
                      {(item.comments_count ?? 0) > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {item.comments_count}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap">
                      {item.effort && <span>⏱ {item.effort}</span>}
                      {item.costs && <span>💰 {item.costs}</span>}
                      <span>{formatDate(item.updated_at)}</span>
                    </div>
                  </div>
                </button>

                {expandedId === item.id && (
                  <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-4">
                    {item.analysis_md.trim() ? (
                      <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-pre:bg-gray-900 prose-pre:text-gray-100">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.analysis_md}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 italic">{t('admin.backlog.no_analysis')}</div>
                    )}

                    <div className="flex flex-wrap gap-2 items-center">
                      <label className="text-xs text-gray-500">{t('admin.backlog.change_status')}:</label>
                      <select
                        value={item.status}
                        onChange={(e) => changeStatus(item.id, e.target.value as Status)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        {(['proposed', 'approved', 'in_progress', 'done', 'rejected'] as Status[]).map((s) => (
                          <option key={s} value={s}>{t(`admin.backlog.status.${s}`)}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEditingId(item.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-300 rounded hover:bg-white text-gray-700"
                      >
                        <Pencil className="w-3 h-3" /> {t('admin.backlog.edit')}
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 border border-rose-300 text-rose-700 rounded hover:bg-rose-50 ml-auto"
                      >
                        <Trash2 className="w-3 h-3" /> {t('admin.backlog.delete')}
                      </button>
                    </div>

                    <CommentsBlock
                      itemId={item.id}
                      comments={commentsByItem[item.id] || []}
                      onAdded={(c) => setCommentsByItem((m) => ({ ...m, [item.id]: [...(m[item.id] || []), c] }))}
                      onRemoved={(cid) => setCommentsByItem((m) => ({ ...m, [item.id]: (m[item.id] || []).filter((c) => c.id !== cid) }))}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Item editor (create + edit) ----------------------------------------

const ItemEditor: React.FC<{
  mode: 'create' | 'edit';
  initial?: BacklogItem;
  onCancel: () => void;
  onSaved: (item: BacklogItem) => void;
}> = ({ mode, initial, onCancel, onSaved }) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [analysis, setAnalysis] = useState(initial?.analysis_md ?? '');
  const [effort, setEffort] = useState(initial?.effort ?? '');
  const [complexity, setComplexity] = useState<Complexity | ''>(initial?.complexity ?? '');
  const [costs, setCosts] = useState(initial?.costs ?? '');
  const [status, setStatus] = useState<Status>(initial?.status ?? 'proposed');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!title.trim()) { setErr(t('admin.backlog.errors.title_required')); return; }
    setSaving(true); setErr(null);
    try {
      const payload: any = {
        title: title.trim(),
        analysis_md: analysis,
        effort: effort.trim() || null,
        complexity: complexity || null,
        costs: costs.trim() || null,
        status,
      };
      const action = mode === 'create' ? 'create' : 'update';
      if (mode === 'edit') payload.id = initial!.id;
      const r = await apiClient.post('/webhook/admin/backlog', { action, ...payload });
      if (!r.ok) throw new Error(`${r.status}`);
      onSaved(await r.json());
    } catch (e: any) {
      setErr(e.message || t('admin.backlog.errors.save'));
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-forest-300 rounded-lg p-4 space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('admin.backlog.placeholders.title')}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
      />
      <textarea
        value={analysis}
        onChange={(e) => setAnalysis(e.target.value)}
        placeholder={t('admin.backlog.placeholders.analysis')}
        rows={10}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-forest-500"
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          type="text"
          value={effort}
          onChange={(e) => setEffort(e.target.value)}
          placeholder={t('admin.backlog.placeholders.effort')}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
        />
        <select
          value={complexity}
          onChange={(e) => setComplexity(e.target.value as any)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-forest-500"
        >
          <option value="">{t('admin.backlog.placeholders.complexity_none')}</option>
          <option value="low">{t('admin.backlog.complexity.low')}</option>
          <option value="medium">{t('admin.backlog.complexity.medium')}</option>
          <option value="high">{t('admin.backlog.complexity.high')}</option>
        </select>
        <input
          type="text"
          value={costs}
          onChange={(e) => setCosts(e.target.value)}
          placeholder={t('admin.backlog.placeholders.costs')}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
        />
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
        >
          {(['proposed', 'approved', 'in_progress', 'done', 'rejected'] as Status[]).map((s) => (
            <option key={s} value={s}>{t(`admin.backlog.status.${s}`)}</option>
          ))}
        </select>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            <X className="w-4 h-4" /> {t('admin.backlog.cancel')}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-forest-600 text-white rounded-md hover:bg-forest-700 disabled:opacity-60"
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('admin.backlog.save')}
          </button>
        </div>
      </div>
      {err && <div className="text-rose-700 text-sm">{err}</div>}
    </div>
  );
};

// --- Comments block -----------------------------------------------------

const CommentsBlock: React.FC<{
  itemId: string;
  comments: BacklogComment[];
  onAdded: (c: BacklogComment) => void;
  onRemoved: (commentId: string) => void;
}> = ({ itemId, comments, onAdded, onRemoved }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const post = async () => {
    if (!text.trim()) return;
    setPosting(true);
    try {
      const r = await apiClient.post('/webhook/admin/backlog', {
        action: 'comment',
        id: itemId,
        content: text.trim(),
      });
      if (r.ok) {
        onAdded(await r.json());
        setText('');
      }
    } finally { setPosting(false); }
  };

  const remove = async (cid: string) => {
    if (!confirm(t('admin.backlog.confirm_delete_comment'))) return;
    const r = await apiClient.post('/webhook/admin/backlog', { action: 'delete_comment', comment_id: cid });
    if (r.ok) onRemoved(cid);
  };

  return (
    <div className="border-t border-gray-200 pt-3">
      <div className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5" />
        {t('admin.backlog.discussion')}
      </div>
      <div className="space-y-2 mb-3">
        {comments.length === 0 && (
          <div className="text-xs text-gray-400 italic">{t('admin.backlog.no_comments')}</div>
        )}
        {comments.map((c) => (
          <div key={c.id} className="bg-white border border-gray-200 rounded-md px-3 py-2 text-sm group">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs text-gray-500">{c.author_id || '—'} · {formatDate(c.created_at)}</div>
              <button
                onClick={() => remove(c.id)}
                className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 transition-opacity"
                title={t('admin.backlog.delete_comment')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="text-gray-800 whitespace-pre-wrap mt-1">{c.content}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('admin.backlog.placeholders.comment')}
          rows={2}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-forest-500"
        />
        <button
          onClick={post}
          disabled={posting || !text.trim()}
          className="self-end px-3 py-2 text-sm bg-forest-600 text-white rounded-md hover:bg-forest-700 disabled:opacity-60"
        >
          {posting ? <Loader className="w-4 h-4 animate-spin" /> : t('admin.backlog.post_comment')}
        </button>
      </div>
    </div>
  );
};

export default AdminBacklogView;
