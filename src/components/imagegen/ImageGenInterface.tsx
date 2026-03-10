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
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../services/apiClient';
import {
  ImageGenSettings,
  ImageGenResponse,
  GeneratedImage,
  IMAGE_MODELS,
  IMAGE_SIZES,
  TOKEN_COST,
  ImageModel,
  ImageSize,
  ImageQuality,
  ImageStyle,
} from '../../types/imageGen';

const DEFAULT_SETTINGS: ImageGenSettings = {
  model: 'black-forest-labs/flux-1.1-pro',
  size: '1024x1024',
  quality: 'standard',
  style: 'vivid',
  negativePrompt: '',
  n: 1,
};

const ImageGenInterface: React.FC = () => {
  const { user, updateTokens } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<ImageGenSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const isDalleModel = false; // OpenRouter uses chat/completions for all models now
  const tokenCost = TOKEN_COST[settings.quality] * settings.n;
  const hasEnoughTokens = (user?.tokens ?? 0) >= tokenCost;

  const set = <K extends keyof ImageGenSettings>(key: K, value: ImageGenSettings[K]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating || !hasEnoughTokens) return;
    setIsGenerating(true);
    setError(null);

    try {
      const response = await apiClient.post('/webhook/imagegen', {
        prompt: prompt.trim(),
        negative_prompt: settings.negativePrompt || undefined,
        model: settings.model,
        size: settings.size,
        quality: settings.quality,
        style: settings.style,
        n: isDalleModel ? 1 : settings.n,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка ${response.status}`);
      }

      const data: ImageGenResponse = await response.json();
      setResults(prev => [...data.images, ...prev]);
      if (data.tokensSpent) {
        updateTokens((user?.tokens ?? 0) - data.tokensSpent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сгенерировать изображение');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `image-${Date.now()}-${index}.png`;
    a.target = '_blank';
    a.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleGenerate();
    }
  };

  return (
    <div className="flex flex-col h-full">
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
          <h1 className="text-base font-semibold text-gray-900">Генерация изображений</h1>
        </div>
        {user?.tokens !== undefined && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Coins className="w-4 h-4 text-forest-600" />
            <span className="font-medium">{user.tokens.toLocaleString('ru-RU')}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Input area */}
        <div className="p-4 space-y-3 border-b border-gray-100">
          {/* Prompt */}
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Опишите изображение, которое хотите создать..."
            rows={3}
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-forest-300 focus:border-transparent"
          />

          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-forest-600 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            <span>Настройки</span>
            {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {/* Settings panel */}
          {showSettings && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              {/* Model */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Модель</p>
                <div className="flex flex-col gap-1.5">
                  {IMAGE_MODELS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => set('model', m.value as ImageModel)}
                      className={clsx(
                        'flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors text-left',
                        settings.model === m.value
                          ? 'border-forest-400 bg-forest-50 text-forest-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      )}
                    >
                      <span className="font-medium">{m.label}</span>
                      <span className="text-xs text-gray-400">{m.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Size */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Формат</p>
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
                      {/* Aspect ratio visual */}
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
                      <span className="font-medium">{s.label}</span>
                      <span className="text-gray-400">{s.aspect}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality (DALL-E only) */}
              {isDalleModel && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Качество</p>
                  <div className="flex gap-2">
                    {(['standard', 'hd'] as ImageQuality[]).map(q => (
                      <button
                        key={q}
                        onClick={() => set('quality', q)}
                        className={clsx(
                          'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                          settings.quality === q
                            ? 'border-forest-400 bg-forest-50 text-forest-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        )}
                      >
                        {q === 'standard' ? 'Стандарт' : 'HD'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Style (DALL-E only) */}
              {isDalleModel && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Стиль</p>
                  <div className="flex gap-2">
                    {(['vivid', 'natural'] as ImageStyle[]).map(s => (
                      <button
                        key={s}
                        onClick={() => set('style', s)}
                        className={clsx(
                          'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                          settings.style === s
                            ? 'border-forest-400 bg-forest-50 text-forest-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        )}
                      >
                        {s === 'vivid' ? 'Яркий' : 'Натуральный'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Count (non-DALL-E only, DALL-E 3 supports n=1 only) */}
              {!isDalleModel && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Количество</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map(n => (
                      <button
                        key={n}
                        onClick={() => set('n', n)}
                        className={clsx(
                          'w-10 h-10 rounded-lg border text-sm font-medium transition-colors',
                          settings.n === n
                            ? 'border-forest-400 bg-forest-50 text-forest-700'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Negative prompt */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">Негативный промпт</p>
                <textarea
                  value={settings.negativePrompt}
                  onChange={e => set('negativePrompt', e.target.value)}
                  placeholder="Что НЕ должно быть на изображении..."
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

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating || !hasEnoughTokens}
            className={clsx(
              'w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all',
              prompt.trim() && !isGenerating && hasEnoughTokens
                ? 'bg-forest-600 hover:bg-forest-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            {isGenerating ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Генерирую...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Сгенерировать</span>
                <span className="text-xs opacity-70 ml-1">({tokenCost.toLocaleString('ru-RU')} токенов)</span>
              </>
            )}
          </button>

          {!hasEnoughTokens && !isGenerating && (
            <p className="text-xs text-red-500 text-center">
              Недостаточно токенов. Нужно {tokenCost.toLocaleString('ru-RU')}, есть {(user?.tokens ?? 0).toLocaleString('ru-RU')}
            </p>
          )}

          <p className="text-xs text-gray-400 text-center">Ctrl+Enter для генерации</p>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="p-4">
            <h2 className="text-sm font-medium text-gray-700 mb-3">Результаты</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {results.map((img, idx) => (
                <div key={idx} className="group relative rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                  <img
                    src={img.url}
                    alt={`Generated ${idx + 1}`}
                    className="w-full object-cover cursor-zoom-in"
                    onClick={() => setLightboxImg(img.url)}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => setLightboxImg(img.url)}
                      className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
                      title="Увеличить"
                    >
                      <ZoomIn className="w-4 h-4 text-gray-800" />
                    </button>
                    <button
                      onClick={() => handleDownload(img.url, idx)}
                      className="p-2 bg-white/90 rounded-full hover:bg-white transition-colors"
                      title="Скачать"
                    >
                      <Download className="w-4 h-4 text-gray-800" />
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
        {results.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Image className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">Введите описание и нажмите «Сгенерировать»</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageGenInterface;
