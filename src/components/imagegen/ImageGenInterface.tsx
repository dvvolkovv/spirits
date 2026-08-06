import React, { useState, useRef } from 'react';
import {
  Image,
  Sparkles,
  Settings2,
  Download,
  ChevronDown,
  ChevronUp,
  Loader,
  AlertCircle,
  Coins,
  ZoomIn,
  X,
  Wand2,
  Layers,
  Maximize2,
  Check,
  Info,
  Copy,
  RotateCcw,
  Calendar,
  Upload,
  Film,
  Type,
  Share2,
} from 'lucide-react';
import { formatDate, formatDateTime, formatNumber } from '../../utils/formatters';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { useTranslation, Trans } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { shareWithReferral } from '../../services/shareReferral';
import { useImageGen } from '../../contexts/ImageGenContext';
import {
  IMAGE_MODELS,
  IMAGE_SIZES,
  ImageModel,
  ImageSize,
} from '../../types/imageGen';

const EDIT_COST = 5000;
const COMPOSE_COST = 5000;
const UPSCALE_COST = 10000;

const getPromptExamples = (t: (key: string) => string) => [
  { label: t('imagegen.example_portrait_label'), text: t('imagegen.example_portrait_text') },
  { label: t('imagegen.example_alps_label'), text: t('imagegen.example_alps_text') },
  { label: t('imagegen.example_cyberpunk_label'), text: t('imagegen.example_cyberpunk_text') },
  { label: t('imagegen.example_fox_label'), text: t('imagegen.example_fox_text') },
  { label: t('imagegen.example_ghibli_label'), text: t('imagegen.example_ghibli_text') },
  { label: t('imagegen.example_perfume_label'), text: t('imagegen.example_perfume_text') },
  { label: t('imagegen.example_elf_label'), text: t('imagegen.example_elf_text') },
  { label: t('imagegen.example_dessert_label'), text: t('imagegen.example_dessert_text') },
  { label: t('imagegen.example_astronaut_label'), text: t('imagegen.example_astronaut_text') },
  { label: t('imagegen.example_tokyo_label'), text: t('imagegen.example_tokyo_text') },
];

// Иконка-кнопка для action-панели на карточке картинки. Tailwind tooltip через
// group-hover (group/btn — именованный, чтобы не конфликтовать с group самой карточки).
const CardIconBtn: React.FC<{
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  danger?: boolean;
}> = ({ onClick, icon: Icon, label, danger }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={clsx(
      'relative group/btn p-1.5 rounded-full transition-colors',
      danger ? 'bg-red-500/90 hover:bg-red-600' : 'bg-white/90 hover:bg-white',
    )}
  >
    <Icon className={clsx('w-3.5 h-3.5', danger ? 'text-white' : 'text-forest-700')} />
    {/* Тултип кладём ПОД иконку (top-full), потому что иконки сидят у самого верха
        карточки, а у самой карточки overflow-hidden ради rounded-corners — поэтому
        тултип над иконкой (bottom-full) был бы обрезан. */}
    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 rounded bg-gray-900 text-white text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity z-20 shadow-lg">
      {label}
    </span>
  </button>
);

const ImageGenInterface: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    prompt, setPrompt,
    settings, setSettings,
    mode, setMode,
    banner, setBanner,
    isGenerating, error, results, history,
    tokenCost, hasEnoughTokens,
    handleGenerate, handleGenerateBanner, handleEdit, handleCompose, handleUpscale, handleUpload,
    loadHistory, deleteImage,
  } = useImageGen();

  const bannerHasText = !!(banner.title.trim() || banner.subtitle.trim() || banner.cta.trim());
  const setB = <K extends keyof typeof banner>(key: K, value: (typeof banner)[K]) =>
    setBanner(prev => ({ ...prev, [key]: value }));
  const canSubmit = mode === 'banner'
    ? prompt.trim() && bannerHasText && !isGenerating && hasEnoughTokens
    : prompt.trim() && !isGenerating && hasEnoughTokens;
  const submit = () => (mode === 'banner' ? handleGenerateBanner() : handleGenerate());

  const [showSettings, setShowSettings] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editModal, setEditModal] = useState<{ url: string } | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editQuality, setEditQuality] = useState<'std' | 'hd'>('std');
  const [composeModal, setComposeModal] = useState<{ firstUrl: string } | null>(null);
  const [composePickUrls, setComposePickUrls] = useState<string[]>([]);
  const [composePrompt, setComposePrompt] = useState('');
  const [composeQuality, setComposeQuality] = useState<'std' | 'hd'>('std');
  const [detailsItem, setDetailsItem] = useState<any | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseHistoryPrompt = (raw: string): { kind: 'generate' | 'edit' | 'compose' | 'upscale'; composeCount?: number; text: string } => {
    if (!raw) return { kind: 'generate', text: '' };
    const editMatch = raw.match(/^\[edit\]\s*(.*)$/s);
    if (editMatch) return { kind: 'edit', text: editMatch[1] };
    const composeMatch = raw.match(/^\[compose\s+(\d+)\]\s*(.*)$/s);
    if (composeMatch) return { kind: 'compose', composeCount: parseInt(composeMatch[1], 10), text: composeMatch[2] };
    const upscaleMatch = raw.match(/^Enhance this image to 4K/);
    if (upscaleMatch) return { kind: 'upscale', text: raw };
    return { kind: 'generate', text: raw };
  };

  const kindLabel: Record<string, { label: string; color: string }> = {
    generate: { label: t('imagegen.kind_generate'), color: 'bg-forest-100 text-forest-700' },
    edit: { label: t('imagegen.kind_edit'), color: 'bg-blue-100 text-blue-700' },
    compose: { label: t('imagegen.kind_compose'), color: 'bg-purple-100 text-purple-700' },
    upscale: { label: t('imagegen.kind_upscale'), color: 'bg-amber-100 text-amber-700' },
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(key);
      setTimeout(() => setCopyStatus(null), 1500);
    } catch {}
  };

  React.useEffect(() => { loadHistory(); }, []);

  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const handleDownload = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `image-${Date.now()}-${index}.png`;
    a.target = '_blank';
    a.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      submit();
    }
  };

  const openEdit = (url: string) => {
    setEditModal({ url });
    setEditPrompt('');
    setEditQuality('std');
  };

  const openCompose = (url: string) => {
    setComposeModal({ firstUrl: url });
    setComposePickUrls([]);
    setComposePrompt('');
    setComposeQuality('std');
  };

  const submitEdit = async () => {
    if (!editModal || !editPrompt.trim()) return;
    const modal = editModal;
    setEditModal(null);
    await handleEdit(modal.url, editPrompt.trim(), editQuality);
  };

  const submitCompose = async () => {
    if (!composeModal || composePickUrls.length === 0 || !composePrompt.trim()) return;
    const modal = composeModal;
    const urls = [modal.firstUrl, ...composePickUrls].slice(0, 3);
    setComposeModal(null);
    await handleCompose(urls, composePrompt.trim(), composeQuality);
  };

  const toggleComposePick = (url: string) => {
    setComposePickUrls(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : prev.length < 2 ? [...prev, url] : prev
    );
  };

  const PROMPT_EXAMPLES = getPromptExamples(t);

  const allPickable = [
    ...results.map(r => ({ url: r.url, prompt: '' })),
    ...history.map(h => ({ url: h.image_url, prompt: h.prompt })),
  ].filter((it, i, arr) => arr.findIndex(x => x.url === it.url) === i);

  return (
    <div className="flex flex-col h-full">
      {/* Edit modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-forest-600" />
                <h3 className="text-base font-semibold text-gray-900">{t('imagegen.edit_modal_title')}</h3>
              </div>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <img src={editModal.url} className="w-full rounded-lg mb-3 max-h-64 object-contain bg-gray-50" alt="Editing" />
            <textarea
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              placeholder={t('imagegen.edit_prompt_placeholder')}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300"
              autoFocus
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setEditQuality('std')}
                className={clsx('flex-1 py-2 rounded-lg text-xs font-medium border',
                  editQuality === 'std' ? 'border-forest-400 bg-forest-50 text-forest-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
              >
                {t('imagegen.quality_standard', { cost: formatNumber(EDIT_COST) })}
              </button>
              <button
                onClick={() => setEditQuality('hd')}
                className={clsx('flex-1 py-2 rounded-lg text-xs font-medium border',
                  editQuality === 'hd' ? 'border-forest-400 bg-forest-50 text-forest-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
              >
                {t('imagegen.quality_hd', { cost: formatNumber(UPSCALE_COST) })}
              </button>
            </div>
            <button
              onClick={submitEdit}
              disabled={!editPrompt.trim()}
              className={clsx('w-full mt-3 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2',
                editPrompt.trim() ? 'bg-forest-600 hover:bg-forest-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}
            >
              <Wand2 className="w-4 h-4" />
              {t('imagegen.apply_button')}
            </button>
          </div>
        </div>
      )}

      {/* Details modal */}
      {detailsItem && (() => {
        const parsed = parseHistoryPrompt(detailsItem.prompt || '');
        const meta = kindLabel[parsed.kind];
        const created = new Date(detailsItem.created_at);
        return (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setDetailsItem(null)}>
            <div className="bg-white rounded-2xl max-w-lg w-full p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-forest-600" />
                  <h3 className="text-base font-semibold text-gray-900">{t('imagegen.details_modal_title')}</h3>
                </div>
                <button onClick={() => setDetailsItem(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setLightboxImg(detailsItem.image_url)}
                className="group relative w-full mb-4 rounded-lg overflow-hidden bg-gray-50 block cursor-zoom-in"
                title={t('imagegen.click_to_zoom_title')}
              >
                <img src={detailsItem.image_url} className="w-full max-h-64 object-contain" alt="preview" />
                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 text-gray-800 text-xs font-medium shadow-lg">
                    <ZoomIn className="w-3.5 h-3.5" />
                    {t('imagegen.zoom_label')}
                  </span>
                </span>
              </button>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', meta.color)}>{meta.label}</span>
                  {parsed.kind === 'compose' && parsed.composeCount && (
                    <span className="text-xs text-gray-500">{t('imagegen.compose_count_label', { count: parsed.composeCount })}</span>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-500">{t('imagegen.prompt_label')}</p>
                    <button
                      onClick={() => copyToClipboard(parsed.text, 'prompt')}
                      className="text-xs text-forest-600 hover:text-forest-700 flex items-center gap-1"
                    >
                      {copyStatus === 'prompt' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copyStatus === 'prompt' ? t('chat.copied') : t('chat.copy')}
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-800 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {parsed.text || <span className="text-gray-400">{t('imagegen.no_text')}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      <Coins className="w-3 h-3" /> {t('imagegen.tokens_spent_label')}
                    </p>
                    <p className="text-sm text-gray-800 font-semibold">
                      {detailsItem.tokens_spent != null ? formatNumber(Number(detailsItem.tokens_spent)) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {t('imagegen.date_label')}
                    </p>
                    <p className="text-sm text-gray-800">
                      {formatDateTime(created, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-gray-500">{t('imagegen.image_link_label')}</p>
                    <button
                      onClick={() => copyToClipboard(detailsItem.image_url, 'url')}
                      className="text-xs text-forest-600 hover:text-forest-700 flex items-center gap-1"
                    >
                      {copyStatus === 'url' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copyStatus === 'url' ? t('chat.copied') : t('chat.copy')}
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-[11px] text-gray-600 break-all font-mono">
                    {detailsItem.image_url}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{t('imagegen.record_id_label')}</p>
                  <p className="text-xs text-gray-500 font-mono">#{detailsItem.id}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-5">
                <button
                  onClick={() => {
                    setPrompt(parsed.text);
                    setDetailsItem(null);
                    promptRef.current?.focus();
                    promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium flex items-center justify-center gap-2"
                  disabled={!parsed.text}
                >
                  <RotateCcw className="w-4 h-4" />
                  {t('imagegen.use_prompt_button')}
                </button>
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      mode: 'image2video',
                      sourceImageUrl: detailsItem.image_url,
                    });
                    setDetailsItem(null);
                    navigate(`/video?${params.toString()}`);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-forest-200 text-forest-700 hover:bg-forest-50 text-sm font-medium flex items-center justify-center gap-2"
                  title={t('imagegen.create_video_title')}
                >
                  <Film className="w-4 h-4" />
                  {t('imagegen.make_video_label')}
                </button>
                <button
                  onClick={() => handleDownload(detailsItem.image_url, detailsItem.id)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {t('chat.download')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Compose modal */}
      {composeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setComposeModal(null)}>
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-forest-600" />
                <h3 className="text-base font-semibold text-gray-900">{t('imagegen.compose_modal_title')}</h3>
              </div>
              <button onClick={() => setComposeModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">{t('imagegen.compose_instructions')}</p>
            <div className="grid grid-cols-4 gap-2 mb-3 max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-2">
              <div className="relative aspect-square rounded overflow-hidden border-2 border-forest-400">
                <img src={composeModal.firstUrl} className="w-full h-full object-cover" alt="first" />
                <span className="absolute top-1 left-1 text-[10px] bg-forest-600 text-white px-1.5 py-0.5 rounded">1</span>
              </div>
              {allPickable.filter(it => it.url !== composeModal.firstUrl).slice(0, 19).map((it, i) => {
                const picked = composePickUrls.includes(it.url);
                const disabled = !picked && composePickUrls.length >= 2;
                return (
                  <button
                    key={i}
                    onClick={() => toggleComposePick(it.url)}
                    disabled={disabled}
                    className={clsx('relative aspect-square rounded overflow-hidden border-2 transition-all',
                      picked ? 'border-forest-500 ring-2 ring-forest-300' : 'border-transparent hover:border-gray-300',
                      disabled && 'opacity-40 cursor-not-allowed')}
                  >
                    <img src={it.url} className="w-full h-full object-cover" alt="pick" />
                    {picked && (
                      <span className="absolute top-1 left-1 text-[10px] bg-forest-600 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" />
                        {composePickUrls.indexOf(it.url) + 2}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <textarea
              value={composePrompt}
              onChange={e => setComposePrompt(e.target.value)}
              placeholder={t('imagegen.compose_prompt_placeholder')}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300"
            />
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setComposeQuality('std')}
                className={clsx('flex-1 py-2 rounded-lg text-xs font-medium border',
                  composeQuality === 'std' ? 'border-forest-400 bg-forest-50 text-forest-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
              >
                {t('imagegen.quality_standard', { cost: formatNumber(COMPOSE_COST) })}
              </button>
              <button
                onClick={() => setComposeQuality('hd')}
                className={clsx('flex-1 py-2 rounded-lg text-xs font-medium border',
                  composeQuality === 'hd' ? 'border-forest-400 bg-forest-50 text-forest-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
              >
                {t('imagegen.quality_hd', { cost: formatNumber(UPSCALE_COST) })}
              </button>
            </div>
            <button
              onClick={submitCompose}
              disabled={composePickUrls.length === 0 || !composePrompt.trim()}
              className={clsx('w-full mt-3 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2',
                composePickUrls.length > 0 && composePrompt.trim() ? 'bg-forest-600 hover:bg-forest-700 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}
            >
              <Layers className="w-4 h-4" />
              {t('imagegen.compose_label')}
            </button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightboxImg(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxImg}
            alt="Generated"
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image className="w-5 h-5 text-forest-600" />
          <h1 className="text-base font-semibold text-gray-900">{t('imagegen.page_title')}</h1>
        </div>
        {user?.tokens !== undefined && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Coins className="w-4 h-4 text-forest-600" />
            <span className="font-medium">{formatNumber(user.tokens)}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Input area */}
        <div className="p-4 space-y-3 border-b border-gray-100">
          {/* Mode toggle: картинка / баннер с текстом */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('image')}
              className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors',
                mode === 'image' ? 'bg-white text-forest-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              <Image className="w-4 h-4" /> {t('imagegen.mode_image')}
            </button>
            <button
              type="button"
              onClick={() => setMode('banner')}
              className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors',
                mode === 'banner' ? 'bg-white text-forest-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              <Type className="w-4 h-4" /> {t('imagegen.mode_banner')}
            </button>
          </div>

          {mode === 'banner' && (
            <p className="text-xs text-gray-500 bg-forest-50 border border-forest-100 rounded-lg px-3 py-2">
              <Trans i18nKey="imagegen.banner_note" components={{ 1: <b /> }} />
            </p>
          )}

          {/* Prompt */}
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'banner'
              ? t('imagegen.banner_prompt_placeholder')
              : t('imagegen.image_prompt_placeholder')}
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300 focus:border-transparent"
          />

          {/* Banner text fields */}
          {mode === 'banner' && (
            <div className="space-y-2">
              <input
                type="text"
                value={banner.title}
                onChange={e => setB('title', e.target.value)}
                placeholder={t('imagegen.banner_title_placeholder')}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300"
              />
              <input
                type="text"
                value={banner.subtitle}
                onChange={e => setB('subtitle', e.target.value)}
                placeholder={t('imagegen.banner_subtitle_placeholder')}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300"
              />
              <input
                type="text"
                value={banner.cta}
                onChange={e => setB('cta', e.target.value)}
                placeholder={t('imagegen.banner_cta_placeholder')}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{t('imagegen.text_position_label')}</p>
                  <div className="flex gap-1">
                    {([['top', t('imagegen.position_top')], ['center', t('imagegen.position_center')], ['bottom', t('imagegen.position_bottom')]] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setB('position', val)}
                        className={clsx('flex-1 py-1.5 rounded-lg text-xs font-medium border',
                          banner.position === val ? 'border-forest-400 bg-forest-50 text-forest-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">{t('imagegen.theme_label')}</p>
                  <div className="flex gap-1 items-center">
                    {([['dark', t('imagegen.theme_dark')], ['light', t('imagegen.theme_light')]] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setB('theme', val)}
                        className={clsx('flex-1 py-1.5 rounded-lg text-xs font-medium border',
                          banner.theme === val ? 'border-forest-400 bg-forest-50 text-forest-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}
                      >
                        {lbl}
                      </button>
                    ))}
                    <input
                      type="color"
                      value={banner.accent}
                      onChange={e => setB('accent', e.target.value)}
                      title={t('imagegen.button_color_title')}
                      className="w-9 h-8 rounded-lg border border-gray-200 cursor-pointer bg-white p-0.5"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Prompt examples */}
          {mode === 'image' && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {t('imagegen.examples_hint')}
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              {PROMPT_EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setPrompt(ex.text);
                    promptRef.current?.focus();
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-forest-400 hover:bg-forest-50 hover:text-forest-700 transition-colors whitespace-nowrap"
                  title={ex.text}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-forest-600 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            <span>{t('settings.title')}</span>
            {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Settings panel */}
          {showSettings && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              {/* Size */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">{t('imagegen.size_label')}</p>
                <div className="flex gap-2">
                  {IMAGE_SIZES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => set('size', s.value as ImageSize)}
                      className={clsx(
                        'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-colors',
                        settings.size === s.value
                          ? 'border-forest-400 bg-forest-50 text-forest-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      )}
                    >
                      <div
                        className={clsx(
                          'border-2 rounded',
                          settings.size === s.value ? 'border-forest-400' : 'border-gray-400'
                        )}
                        style={{
                          width: s.w > s.h ? 24 : Math.round(24 * s.w / s.h),
                          height: s.h > s.w ? 24 : Math.round(24 * s.h / s.w),
                        }}
                      />
                      <span className="font-medium">{t(s.labelKey)}</span>
                      <span className="text-gray-400">{s.aspect}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Negative prompt */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">{t('imagegen.negative_prompt_label')}</p>
                <textarea
                  value={settings.negativePrompt}
                  onChange={e => set('negativePrompt', e.target.value)}
                  placeholder={t('imagegen.negative_prompt_placeholder')}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300 bg-white"
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Generate + Upload buttons */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFilePicked}
            className="hidden"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!canSubmit}
              className={clsx(
                'flex-1 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all',
                canSubmit
                  ? 'bg-forest-600 hover:bg-forest-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {isGenerating ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>{t('imagegen.generating_label')}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{mode === 'banner' ? t('imagegen.create_banner_button') : t('studio.generate_button')}</span>
                  <span className="text-xs opacity-70 ml-1">({formatNumber(tokenCost)})</span>
                </>
              )}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating}
              className={clsx(
                'px-4 py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 border transition-colors',
                isGenerating
                  ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                  : 'bg-white text-forest-700 border-forest-200 hover:bg-forest-50'
              )}
              title={t('imagegen.upload_own_image_title')}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">{t('common.upload')}</span>
            </button>
          </div>

          {!hasEnoughTokens && !isGenerating && (
            <p className="text-xs text-red-500 text-center">
              {t('imagegen.insufficient_tokens_message', { needed: formatNumber(tokenCost), available: formatNumber(user?.tokens ?? 0) })}
            </p>
          )}

          <p className="text-xs text-gray-400 text-center">{t('imagegen.ctrl_enter_hint')}</p>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="p-4">
            <h2 className="text-sm font-medium text-gray-700 mb-3">{t('imagegen.results_title')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map((img, idx) => (
                <div key={idx} className="group relative rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                  <img
                    src={img.url}
                    alt={`Generated ${idx + 1}`}
                    className="w-full object-cover cursor-zoom-in"
                    onClick={() => setLightboxImg(img.url)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex flex-wrap items-center justify-center gap-2 opacity-0 group-hover:opacity-100 p-3">
                    <button
                      onClick={() => setLightboxImg(img.url)}
                      className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
                      title={t('imagegen.zoom_label')}
                    >
                      <ZoomIn className="w-4 h-4 text-gray-800" />
                    </button>
                    <button
                      onClick={() => openEdit(img.url)}
                      className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
                      title={t('imagegen.edit_action_title', { cost: formatNumber(EDIT_COST) })}
                    >
                      <Wand2 className="w-4 h-4 text-forest-700" />
                    </button>
                    <button
                      onClick={() => openCompose(img.url)}
                      className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
                      title={t('imagegen.compose_action_title', { cost: formatNumber(COMPOSE_COST) })}
                    >
                      <Layers className="w-4 h-4 text-forest-700" />
                    </button>
                    <button
                      onClick={() => handleUpscale(img.url)}
                      className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
                      title={t('imagegen.upscale_action_title', { cost: formatNumber(UPSCALE_COST) })}
                    >
                      <Maximize2 className="w-4 h-4 text-forest-700" />
                    </button>
                    <button
                      onClick={() => handleDownload(img.url, idx)}
                      className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
                      title={t('chat.download')}
                    >
                      <Download className="w-4 h-4 text-gray-800" />
                    </button>
                    <button
                      onClick={() => shareWithReferral(t('imagegen.share_message'), 'image_share')}
                      className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
                      title={t('imagegen.share_label')}
                    >
                      <Share2 className="w-4 h-4 text-forest-700" />
                    </button>
                  </div>
                  {img.revisedPrompt && img.revisedPrompt !== prompt && (
                    <div className="px-3 py-2 bg-white border-t border-gray-100">
                      <p className="text-xs text-gray-400 line-clamp-2" title={img.revisedPrompt}>
                        {img.revisedPrompt}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !isGenerating && history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Image className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">{t('imagegen.empty_state_hint')}</p>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 mb-3">
              {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {t('imagegen.history_title', { count: history.length })}
            </button>
            {showHistory && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {history.map(h => (
                  <div key={h.id} className="relative group rounded-xl overflow-hidden border border-gray-100 shadow-sm bg-white">
                    <img src={h.image_url} alt={h.prompt} className="w-full aspect-square object-cover cursor-pointer" onClick={() => setLightboxImg(h.image_url)} loading="lazy" />
                    <div className="absolute inset-x-0 top-0 p-2 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 bg-gradient-to-b from-black/50 to-transparent transition-opacity">
                      <CardIconBtn onClick={() => setDetailsItem(h)} icon={Info} label={t('imagegen.details_label')} />
                      <CardIconBtn onClick={() => openEdit(h.image_url)} icon={Wand2} label={t('common.edit')} />
                      <CardIconBtn onClick={() => openCompose(h.image_url)} icon={Layers} label={t('imagegen.compose_label')} />
                      <CardIconBtn
                        onClick={() => {
                          const params = new URLSearchParams({ mode: 'image2video', sourceImageUrl: h.image_url });
                          navigate(`/video?${params.toString()}`);
                        }}
                        icon={Film}
                        label={t('imagegen.make_video_label')}
                      />
                      <CardIconBtn onClick={() => handleUpscale(h.image_url)} icon={Maximize2} label={t('imagegen.upscale_label')} />
                      <CardIconBtn onClick={() => deleteImage(h.id)} icon={X} label={t('common.delete')} danger />
                    </div>
                    <div className="p-2">
                      <p className="text-[10px] text-gray-500 line-clamp-2">{h.prompt}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{formatDate(h.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageGenInterface;
