import React from 'react';
import * as LucideIcons from 'lucide-react';

export interface ButtonConfig {
  text: string;
  action: string;
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
  icon?: string;
}

export interface LinkConfig {
  text: string;
  url: string;
  external?: boolean;
}

const BUTTON_REGEX = /\{\{button:\s*([^|]+?)(?:\s*\|\s*action:\s*([^|]+?))?(?:\s*\|\s*variant:\s*([^|]+?))?(?:\s*\|\s*icon:\s*([^}]+?))?\}\}/g;
const LINK_REGEX = /\{\{link:\s*([^|]+?)\s*\|\s*url:\s*([^}]+?)\}\}/g;

export const parseCustomMarkdown = (content: string): {
  content: string;
  buttons: Map<string, ButtonConfig>;
  links: Map<string, LinkConfig>;
} => {
  const buttons = new Map<string, ButtonConfig>();
  const links = new Map<string, LinkConfig>();

  let parsedContent = content;

  parsedContent = parsedContent.replace(BUTTON_REGEX, (match, text, action, variant, icon) => {
    const buttonId = `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    buttons.set(buttonId, {
      text: text.trim(),
      action: action?.trim() || '',
      variant: (variant?.trim() as ButtonConfig['variant']) || 'primary',
      icon: icon?.trim()
    });
    return `__BUTTON_${buttonId}__`;
  });

  parsedContent = parsedContent.replace(LINK_REGEX, (match, text, url) => {
    const linkId = `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isExternal = url.trim().startsWith('http://') || url.trim().startsWith('https://');
    links.set(linkId, {
      text: text.trim(),
      url: url.trim(),
      external: isExternal
    });
    return `__LINK_${linkId}__`;
  });

  return { content: parsedContent, buttons, links };
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
  if (config.external) {
    return (
      <a
        href={config.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-forest-600 hover:text-forest-700 underline inline-flex items-center space-x-1"
      >
        <span>{config.text}</span>
        <LucideIcons.ExternalLink className="w-3 h-3" />
      </a>
    );
  }

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
