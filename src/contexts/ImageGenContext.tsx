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

interface ImageGenContextValue {
  prompt: string;
  setPrompt: (p: string) => void;
  settings: ImageGenSettings;
  setSettings: React.Dispatch<React.SetStateAction<ImageGenSettings>>;
  isGenerating: boolean;
  error: string | null;
  results: GeneratedImage[];
  history: any[];
  tokenCost: number;
  hasEnoughTokens: boolean;
  handleGenerate: () => void;
  loadHistory: () => void;
  deleteImage: (id: number) => void;
}

const ImageGenContext = createContext<ImageGenContextValue | null>(null);

export const ImageGenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateTokens } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<ImageGenSettings>(DEFAULT_SETTINGS);
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

  return (
    <ImageGenContext.Provider value={{
      prompt, setPrompt,
      settings, setSettings,
      isGenerating, error, results, history,
      tokenCost, hasEnoughTokens,
      handleGenerate, loadHistory, deleteImage,
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
