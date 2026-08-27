import React from 'react';
import * as LucideIcons from 'lucide-react';

export interface ButtonConfig {
  text: string;
  action: string;
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  icon?: string;
}

/** Встреча из тега {{meeting_join:…}} в ленте чата. */
export interface MeetingCard {
  code: string;
  title: string;
}

export interface LinkConfig {
  text: string;
  url: string;
  external?: boolean;
}

const BUTTON_REGEX = /\{\{button:\s*([^|]+?)(?:\s*\|\s*action:\s*([^|]+?))?(?:\s*\|\s*variant:\s*([^|]+?))?(?:\s*\|\s*icon:\s*([^}]+?))?\}\}/g;
const LINK_REGEX = /\{\{link:\s*([^|]+?)\s*\|\s*url:\s*([^}]+?)\}\}/g;
// Голая ссылка на ролик разворачивается в инлайн-плеер.
// (?<!\() — НЕ трогаем URL внутри markdown [text](url). Без этой защиты
// адрес .mp4 внутри готовой ссылки подменялся маркером плеера, ссылка
// разваливалась, и от неё оставался голый текст «[Скачать ролик.mp4]» —
// пользователь видел подпись без ссылки и не мог скачать файл. У картинок
// такая защита стояла с самого начала, у видео её забыли.
const VIDEO_URL_REGEX = /(?<!\()https?:\/\/\S+?\.(?:mp4|webm)(?:\?\S*)?/gi;
// Авто-рендер сгенерированных картинок/баннеров: прямая ссылка на изображение
// (наш MinIO/статик) превращается в инлайн-<img>. Зеркалит VIDEO_URL_REGEX.
// (?<!\() — НЕ трогаем URL внутри markdown ![alt](url)/[text](url) (напр.
// метафорические карты приходят как ![...](url) и рендерятся через ReactMarkdown).
const IMAGE_URL_REGEX = /(?<!\()https?:\/\/\S+?\.(?:png|jpe?g|webp|gif)(?:\?\S*)?/gi;

// SMM Producer inline blocks (Plan 3b)
const SMM_SCENARIO_REGEX = /\{\{smm_scenario:id=([a-f0-9-]{36})\}\}/g;
const SMM_VIDEO_REGEX = /\{\{smm_video:id=([a-f0-9-]{36})\}\}/g;

// TTS-озвучка ответа ассистента: в текст пишется только clipId, чтобы плеер
// оживал из сохранённой истории чата (а не протухшая ссылка на mp3).
const AUDIO_CLIP_REGEX = /\{\{audio:id=([a-f0-9-]{36})\}\}/g;

// Карточка голосового звонка (Роман, voice-call feature): бэкенд кладёт в
// историю чата сообщение ассистента, где текст начинается с этого тега —
// дальше идёт человекочитаемое резюме звонка. Тег подменяется маркером,
// чтобы карточка ожила из сохранённой истории (как audio/smm-блоки выше).
const VOICE_CALL_REGEX = /\{\{voice_call:\s*id=([a-f0-9-]{36})\}\}/g;

// Карточка входа во встречу. Бэкенд, увидев в сообщении ссылку на комнату,
// кладёт в историю сообщение ассистента с этим тегом ВМЕСТО ответа модели.
// Как и у voice_call, тег подменяется маркером — тогда карточка оживает и при
// перезагрузке истории, а не только в момент отправки.
//
// Код ровно шесть знаков из нашего алфавита: другого мы не выдаём, и ловить
// произвольную строку значило бы рисовать карточку по мусору.
const MEETING_JOIN_REGEX = /\{\{meeting_join:\s*code=([2-9A-HJ-NP-Z]{6})\s+title=([^}]*?)\}\}/g;

// SMM Producer Plan 4d — social connect blocks
const SMM_SOCIAL_BUTTON_REGEX =
  /\{\{smm_social_connect_button:platform=([a-z]+),authorize_url=([^}]+)\}\}/g;
const SMM_SOCIAL_TELEGRAM_REGEX = /\{\{smm_social_connect_telegram\}\}/g;

export const parseCustomMarkdown = (content: string): {
  content: string;
  buttons: Map<string, ButtonConfig>;
  links: Map<string, LinkConfig>;
  videos: Map<string, string>;
  images: Map<string, string>;
  smmScenarios: Map<string, string>;
  smmVideos: Map<string, string>;
  audioClips: Map<string, string>;
  voiceCalls: Map<string, string>;
  meetings: Map<string, MeetingCard>;
  socialButtons: Map<string, { platform: string; authorizeUrl: string }>;
  socialTelegrams: Set<string>;
} => {
  const buttons = new Map<string, ButtonConfig>();
  const links = new Map<string, LinkConfig>();
  const videos = new Map<string, string>();
  const images = new Map<string, string>();
  const smmScenarios = new Map<string, string>();
  const smmVideos = new Map<string, string>();
  const audioClips = new Map<string, string>();
  const voiceCalls = new Map<string, string>();
  const meetings = new Map<string, MeetingCard>();
  const socialButtons = new Map<string, { platform: string; authorizeUrl: string }>();
  const socialTelegrams = new Set<string>();

  let parsedContent = content;

  parsedContent = parsedContent.replace(BUTTON_REGEX, (match, text, action, variant, icon) => {
    const buttonId = `btn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    buttons.set(buttonId, {
      text: text.trim(),
      action: action?.trim() || '',
      variant: (variant?.trim() as ButtonConfig['variant']) || 'primary',
      icon: icon?.trim()
    });
    return `__BUTTON_${buttonId}__`;
  });

  parsedContent = parsedContent.replace(LINK_REGEX, (match, text, url) => {
    const linkId = `link_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const isExternal = url.trim().startsWith('http://') || url.trim().startsWith('https://');
    links.set(linkId, {
      text: text.trim(),
      url: url.trim(),
      external: isExternal
    });
    return `__LINK_${linkId}__`;
  });

  parsedContent = parsedContent.replace(VIDEO_URL_REGEX, (match) => {
    const videoId = `video_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    videos.set(videoId, match);
    return `__VIDEO_${videoId}__`;
  });

  parsedContent = parsedContent.replace(IMAGE_URL_REGEX, (match) => {
    const imageId = `image_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    images.set(imageId, match);
    return `__IMAGE_${imageId}__`;
  });

  parsedContent = parsedContent.replace(SMM_SCENARIO_REGEX, (_match, scenarioId) => {
    const key = `smm_scenario_${scenarioId}`;
    smmScenarios.set(key, scenarioId);
    return `__SMM_SCENARIO_${key}__`;
  });

  parsedContent = parsedContent.replace(SMM_VIDEO_REGEX, (_match, videoId) => {
    const key = `smm_video_${videoId}`;
    smmVideos.set(key, videoId);
    return `__SMM_VIDEO_${key}__`;
  });

  parsedContent = parsedContent.replace(AUDIO_CLIP_REGEX, (_match, clipId) => {
    const key = `audio_${clipId}`;
    audioClips.set(key, clipId);
    return `__AUDIO_CLIP_${key}__`;
  });

  parsedContent = parsedContent.replace(VOICE_CALL_REGEX, (_match, callId) => {
    const key = `voicecall_${callId}`;
    voiceCalls.set(key, callId);
    return `__VOICECALL_${key}__`;
  });

  parsedContent = parsedContent.replace(MEETING_JOIN_REGEX, (_match, code, title) => {
    const key = `meeting_${code}`;
    meetings.set(key, { code, title: String(title || '').trim() || 'Встреча' });
    return `__MEETING_${key}__`;
  });

  parsedContent = parsedContent.replace(SMM_SOCIAL_BUTTON_REGEX, (_m, platform, authorizeUrl) => {
    const id = `socbtn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    socialButtons.set(id, { platform: platform.trim(), authorizeUrl: authorizeUrl.trim() });
    return `__SOCIAL_BUTTON_${id}__`;
  });

  parsedContent = parsedContent.replace(SMM_SOCIAL_TELEGRAM_REGEX, () => {
    const id = `soctg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    socialTelegrams.add(id);
    return `__SOCIAL_TELEGRAM_${id}__`;
  });

  return { content: parsedContent, buttons, links, videos, images, smmScenarios, smmVideos, audioClips, voiceCalls, meetings, socialButtons, socialTelegrams };
};

export const createVideoComponent = (src: string, key?: string): React.ReactNode => {
  return (
    <video
      key={key}
      src={src}
      controls
      className="my-2 max-w-full rounded-lg"
    />
  );
};

export const createImageComponent = (src: string, key?: string): React.ReactNode => {
  return (
    <a key={key} href={src} target="_blank" rel="noopener noreferrer" className="block my-2">
      <img src={src} alt="" loading="lazy" className="max-w-full sm:max-w-sm rounded-lg border border-gray-100" />
    </a>
  );
};

export const getButtonStyles = (variant: ButtonConfig['variant'] = 'primary'): string => {
  const baseStyles = 'inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-medium text-sm transition-all duration-200 my-1 mr-2';

  const variantStyles = {
    primary: 'bg-forest-600 hover:bg-forest-700 text-white shadow-sm hover:shadow',
    secondary: 'bg-white hover:bg-gray-50 text-forest-700 border border-forest-300 hover:border-forest-400',
    success: 'bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow'
  };

  return `${baseStyles} ${variantStyles[variant]}`;
};

export const getIconComponent = (iconName?: string): React.ReactNode => {
  if (!iconName) return null;

  const iconMap: Record<string, React.ComponentType<any>> = {
    coins: LucideIcons.Coins,
    user: LucideIcons.User,
    heart: LucideIcons.Heart,
    settings: LucideIcons.Settings,
    search: LucideIcons.Search,
    star: LucideIcons.Star,
    check: LucideIcons.Check,
    'x': LucideIcons.X,
    plus: LucideIcons.Plus,
    minus: LucideIcons.Minus,
    edit: LucideIcons.Edit,
    trash: LucideIcons.Trash2,
    download: LucideIcons.Download,
    upload: LucideIcons.Upload,
    home: LucideIcons.Home,
    menu: LucideIcons.Menu,
    'arrow-right': LucideIcons.ArrowRight,
    'arrow-left': LucideIcons.ArrowLeft,
    'external-link': LucideIcons.ExternalLink,
    link: LucideIcons.Link,
    mail: LucideIcons.Mail,
    phone: LucideIcons.Phone,
    calendar: LucideIcons.Calendar,
    clock: LucideIcons.Clock,
    map: LucideIcons.Map,
    'map-pin': LucideIcons.MapPin,
    bell: LucideIcons.Bell,
    info: LucideIcons.Info,
    'alert-circle': LucideIcons.AlertCircle,
    'check-circle': LucideIcons.CheckCircle,
    'x-circle': LucideIcons.XCircle,
    help: LucideIcons.HelpCircle,
    'shopping-cart': LucideIcons.ShoppingCart,
    gift: LucideIcons.Gift,
    trophy: LucideIcons.Trophy,
    target: LucideIcons.Target,
    compass: LucideIcons.Compass,
    bookmark: LucideIcons.Bookmark,
    flag: LucideIcons.Flag,
    tag: LucideIcons.Tag,
    file: LucideIcons.File,
    'file-text': LucideIcons.FileText,
    image: LucideIcons.Image,
    video: LucideIcons.Video,
    music: LucideIcons.Music,
    'message-square': LucideIcons.MessageSquare,
    'message-circle': LucideIcons.MessageCircle,
    send: LucideIcons.Send,
    share: LucideIcons.Share2,
    'thumbs-up': LucideIcons.ThumbsUp,
    'thumbs-down': LucideIcons.ThumbsDown,
    eye: LucideIcons.Eye,
    'eye-off': LucideIcons.EyeOff,
    lock: LucideIcons.Lock,
    unlock: LucideIcons.Unlock,
    key: LucideIcons.Key,
    shield: LucideIcons.Shield,
    zap: LucideIcons.Zap,
    trending: LucideIcons.TrendingUp,
    activity: LucideIcons.Activity,
    package: LucideIcons.Package,
    box: LucideIcons.Box,
    layers: LucideIcons.Layers,
    grid: LucideIcons.Grid,
    list: LucideIcons.List,
    filter: LucideIcons.Filter,
    refresh: LucideIcons.RefreshCw,
    repeat: LucideIcons.Repeat,
    shuffle: LucideIcons.Shuffle,
    maximize: LucideIcons.Maximize,
    minimize: LucideIcons.Minimize,
    'chevron-up': LucideIcons.ChevronUp,
    'chevron-down': LucideIcons.ChevronDown,
    'chevron-left': LucideIcons.ChevronLeft,
    'chevron-right': LucideIcons.ChevronRight,
    'more-horizontal': LucideIcons.MoreHorizontal,
    'more-vertical': LucideIcons.MoreVertical,
  };

  const IconComponent = iconMap[iconName.toLowerCase()];

  if (!IconComponent) {
    console.warn(`Icon "${iconName}" not found`);
    return null;
  }

  return <IconComponent className="w-4 h-4" />;
};

export const createButtonComponent = (
  config: ButtonConfig,
  onClick: (action: string) => void
): React.ReactNode => {
  return (
    <button
      onClick={() => onClick(config.action)}
      className={getButtonStyles(config.variant)}
    >
      {config.icon && getIconComponent(config.icon)}
      <span>{config.text}</span>
    </button>
  );
};

export const createLinkComponent = (
  config: LinkConfig,
  onNavigate?: (url: string) => void
): React.ReactNode => {
  return (
    <a
      href={config.url}
      onClick={(e) => {
        if (onNavigate) {
          e.preventDefault();
          onNavigate(config.url);
        }
      }}
      className="text-forest-600 hover:text-forest-700 underline"
    >
      {config.text}
    </a>
  );
};
