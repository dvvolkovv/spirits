export type ImageModel =
  | 'black-forest-labs/flux.2-pro'
  | 'google/gemini-3.1-flash-image-preview'
  | 'google/gemini-3-pro-image-preview'
  | 'openai/gpt-5-image-mini';

export type ImageSize = '1024x1024' | '1792x1024' | '1024x1792';
export type ImageQuality = 'standard' | 'hd';
export type ImageStyle = 'vivid' | 'natural';

export interface ImageGenSettings {
  model: ImageModel;
  size: ImageSize;
  quality: ImageQuality;
  style: ImageStyle;
  negativePrompt: string;
}

export interface GeneratedImage {
  url: string;
  revisedPrompt?: string;
}

export interface ImageGenResponse {
  images: GeneratedImage[];
  tokensSpent: number;
}

export const IMAGE_MODELS: { value: ImageModel; label: string; description: string }[] = [
  { value: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro', description: 'Google · топовый' },
  { value: 'black-forest-labs/flux.2-pro', label: 'Flux 2 Pro', description: 'Black Forest · детализированный' },
  { value: 'openai/gpt-5-image-mini', label: 'GPT-5 Image Mini', description: 'OpenAI · компактный' },
];

export const IMAGE_SIZES: { value: ImageSize; label: string; aspect: string; w: number; h: number }[] = [
  { value: '1024x1024', label: 'Квадрат', aspect: '1:1', w: 1, h: 1 },
  { value: '1792x1024', label: 'Широкий', aspect: '16:9', w: 16, h: 9 },
  { value: '1024x1792', label: 'Портрет', aspect: '9:16', w: 9, h: 16 },
];

// Стоимость в токенах за 1 изображение
export const TOKEN_COST: Record<ImageQuality, number> = {
  standard: 5000,
  hd: 10000,
};
