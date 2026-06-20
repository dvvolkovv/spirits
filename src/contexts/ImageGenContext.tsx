import React, { createContext, useContext, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiClient } from '../services/apiClient';
import {
  ImageGenSettings,
  ImageGenResponse,
  GeneratedImage,
  TOKEN_COST,
} from '../types/imageGen';

const DEFAULT_SETTINGS: ImageGenSettings = {
  model: 'google/gemini-3-pro-image-preview',
  size: '1024x1024',
  quality: 'standard',
  style: 'vivid',
  negativePrompt: '',
};

export type GenMode = 'image' | 'banner';
export interface BannerFields {
  title: string;
  subtitle: string;
  cta: string;
  position: 'top' | 'center' | 'bottom';
  theme: 'dark' | 'light';
  accent: string;
}

const DEFAULT_BANNER: BannerFields = {
  title: '', subtitle: '', cta: '', position: 'bottom', theme: 'dark', accent: '#2f8f4e',
};

interface ImageGenContextValue {
  prompt: string;
  setPrompt: (p: string) => void;
  settings: ImageGenSettings;
  setSettings: React.Dispatch<React.SetStateAction<ImageGenSettings>>;
  mode: GenMode;
  setMode: (m: GenMode) => void;
  banner: BannerFields;
  setBanner: React.Dispatch<React.SetStateAction<BannerFields>>;
  isGenerating: boolean;
  error: string | null;
  results: GeneratedImage[];
  history: any[];
  tokenCost: number;
  hasEnoughTokens: boolean;
  handleGenerate: () => void;
  handleGenerateBanner: () => void;
  handleEdit: (sourceImageUrl: string, editPrompt: string, quality?: 'std' | 'hd') => Promise<void>;
  handleCompose: (sourceImageUrls: string[], composePrompt: string, quality?: 'std' | 'hd') => Promise<void>;
  handleUpscale: (sourceImageUrl: string) => Promise<void>;
  handleUpload: (file: File) => Promise<string | null>;
  loadHistory: () => void;
  deleteImage: (id: number) => void;
}

const ImageGenContext = createContext<ImageGenContextValue | null>(null);

export const ImageGenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateTokens } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<ImageGenSettings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<GenMode>('image');
  const [banner, setBanner] = useState<BannerFields>(DEFAULT_BANNER);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    try {
      const resp = await apiClient.get('/webhook/imagegen/history');
      if (resp.ok) setHistory(await resp.json());
    } catch {}
  };

  const deleteImage = async (id: number) => {
    try {
      await apiClient.delete(`/webhook/imagegen/history?id=${id}`);
      setHistory(prev => prev.filter(h => h.id !== id));
    } catch {}
  };

  const tokenCost = TOKEN_COST[settings.quality];
  const hasEnoughTokens = (user?.tokens ?? 0) >= tokenCost;

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating || !hasEnoughTokens) return;
    setIsGenerating(true);
    setError(null);

    try {
      // Map size to aspect_ratio for Kling API
      const sizeToAspect: Record<string, string> = { '1024x1024': '1:1', '1792x1024': '16:9', '1024x1792': '9:16' };
      const response = await apiClient.post('/webhook/imagegen', {
        prompt: prompt.trim(),
        quality: settings.quality,
        aspect_ratio: sizeToAspect[settings.size] || '1:1',
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка ${response.status}`);
      }

      const data: ImageGenResponse = await response.json();
      const images = Array.isArray(data.images) ? data.images : [];
      if (images.length === 0) {
        throw new Error('Не удалось сгенерировать изображение. Попробуйте ещё раз.');
      }
      setResults(prev => [...images, ...prev]);
      if (data.tokensSpent) {
        updateTokens((user?.tokens ?? 0) - data.tokensSpent);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сгенерировать изображение');
    } finally {
      setIsGenerating(false);
    }
  };

  const sizeToAspect: Record<string, string> = { '1024x1024': '1:1', '1792x1024': '16:9', '1024x1792': '9:16' };

  const handleGenerateBanner = async () => {
    const hasText = banner.title.trim() || banner.subtitle.trim() || banner.cta.trim();
    if (!prompt.trim() || !hasText || isGenerating || !hasEnoughTokens) return;
    setIsGenerating(true);
    setError(null);
    try {
      const response = await apiClient.post('/webhook/bannergen', {
        prompt: prompt.trim(),
        title: banner.title.trim(),
        subtitle: banner.subtitle.trim(),
        cta: banner.cta.trim(),
        position: banner.position,
        theme: banner.theme,
        accent: banner.accent,
        quality: settings.quality,
        aspect_ratio: sizeToAspect[settings.size] || '1:1',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка ${response.status}`);
      }
      const data: ImageGenResponse = await response.json();
      const images = Array.isArray(data.images) ? data.images : [];
      if (images.length === 0) throw new Error('Не удалось сгенерировать баннер. Попробуйте ещё раз.');
      setResults(prev => [...images, ...prev]);
      if (data.tokensSpent) updateTokens((user?.tokens ?? 0) - data.tokensSpent);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сгенерировать баннер');
    } finally {
      setIsGenerating(false);
    }
  };

  const runMutation = async (endpoint: string, payload: any, costFromQuality: 'std' | 'hd') => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);
    try {
      const resp = await apiClient.post(endpoint, payload);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка ${resp.status}`);
      }
      const data: ImageGenResponse = await resp.json();
      const images = Array.isArray(data.images) ? data.images : [];
      if (images.length === 0) throw new Error('Модель не вернула изображение');
      setResults(prev => [...images, ...prev]);
      if (data.tokensSpent) updateTokens((user?.tokens ?? 0) - data.tokensSpent);
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Операция не удалась');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = async (sourceImageUrl: string, editPrompt: string, quality: 'std' | 'hd' = 'std') => {
    if (!editPrompt.trim()) return;
    const cost = quality === 'hd' ? 10000 : 5000;
    if ((user?.tokens ?? 0) < cost) {
      setError(`Недостаточно токенов. Нужно ${cost.toLocaleString('ru-RU')}`);
      return;
    }
    await runMutation('/webhook/imageedit', { prompt: editPrompt.trim(), sourceImageUrl, quality }, quality);
  };

  const handleCompose = async (sourceImageUrls: string[], composePrompt: string, quality: 'std' | 'hd' = 'std') => {
    if (!composePrompt.trim()) return;
    if (sourceImageUrls.length < 2) {
      setError('Нужно минимум 2 картинки для композиции');
      return;
    }
    const cost = quality === 'hd' ? 10000 : 5000;
    if ((user?.tokens ?? 0) < cost) {
      setError(`Недостаточно токенов. Нужно ${cost.toLocaleString('ru-RU')}`);
      return;
    }
    await runMutation('/webhook/imagecompose', { prompt: composePrompt.trim(), sourceImageUrls, quality }, quality);
  };

  const handleUpload = async (file: File): Promise<string | null> => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setError('Поддерживаются только PNG, JPEG, WEBP');
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Максимальный размер файла — 10 МБ');
      return null;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await apiClient.post('/webhook/imageupload', form);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка ${resp.status}`);
      }
      const data = await resp.json();
      const url: string = data.url;
      if (url) {
        setResults(prev => [{ url } as any, ...prev]);
        loadHistory();
      }
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Загрузка не удалась');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpscale = async (sourceImageUrl: string) => {
    if ((user?.tokens ?? 0) < 10000) {
      setError('Недостаточно токенов. Апскейл стоит 10 000');
      return;
    }
    await runMutation('/webhook/imageupscale', { sourceImageUrl }, 'hd');
  };

  return (
    <ImageGenContext.Provider value={{
      prompt, setPrompt,
      settings, setSettings,
      mode, setMode,
      banner, setBanner,
      isGenerating, error, results, history,
      tokenCost, hasEnoughTokens,
      handleGenerate, handleGenerateBanner, handleEdit, handleCompose, handleUpscale, handleUpload,
      loadHistory, deleteImage,
    }}>
      {children}
    </ImageGenContext.Provider>
  );
};

export const useImageGen = () => {
  const ctx = useContext(ImageGenContext);
  if (!ctx) throw new Error('useImageGen must be used within ImageGenProvider');
  return ctx;
};
