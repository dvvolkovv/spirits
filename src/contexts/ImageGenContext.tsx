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
  tokenCost: number;
  hasEnoughTokens: boolean;
  handleGenerate: () => void;
}

const ImageGenContext = createContext<ImageGenContextValue | null>(null);

export const ImageGenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, updateTokens } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<ImageGenSettings>(DEFAULT_SETTINGS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedImage[]>([]);

  const tokenCost = TOKEN_COST[settings.quality];
  const hasEnoughTokens = (user?.tokens ?? 0) >= tokenCost;

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
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Ошибка ${response.status}`);
      }

      const data: ImageGenResponse = await response.json();
      const images = Array.isArray(data.images) ? data.images : [];
      if (images.length === 0) {
        throw new Error('Модель не вернула изображений. Попробуйте другую модель.');
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
      isGenerating, error, results,
      tokenCost, hasEnoughTokens,
      handleGenerate,
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
