export type ImageModel =
  | 'openai/dall-e-3'
  | 'black-forest-labs/flux-1.1-pro'
  | 'stability/stable-diffusion-3-5-large';

export type ImageSize = '1024x1024' | '1792x1024' | '1024x1792';
export type ImageQuality = 'standard' | 'hd';
export type ImageStyle = 'vivid' | 'natural';

export interface ImageGenSettings {
  model: ImageModel;
  size: ImageSize;
  quality: ImageQuality;
  style: ImageStyle;
  negativePrompt: string;
  n: number;
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
  { value: 'openai/dall-e-3', label: 'DALL-E 3', description: 'OpenAI · высокое качество' },
  { value: 'black-forest-labs/flux-1.1-pro', label: 'Flux 1.1 Pro', description: 'Быстрый · детализированный' },
  { value: 'stability/stable-diffusion-3-5-large', label: 'SD 3.5', description: 'Stable Diffusion · гибкий' },
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
