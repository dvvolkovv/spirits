import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SmmPlatform, PLATFORM_LABELS } from '../../types/smm';

interface Props {
  platform: SmmPlatform;
  authorizeUrl: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  vk: 'bg-blue-600 hover:bg-blue-700',
  youtube: 'bg-red-600 hover:bg-red-700',
  tiktok: 'bg-black hover:bg-gray-800',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90',
  telegram: 'bg-sky-500 hover:bg-sky-600',
};

export const SocialConnectButton: React.FC<Props> = ({ platform, authorizeUrl }) => {
  const { t } = useTranslation();
  const label = PLATFORM_LABELS[platform] ?? platform;
  const colorClass = PLATFORM_COLORS[platform] ?? 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="my-3">
      <button
        onClick={() => { window.location.href = authorizeUrl; }}
        className={`${colorClass} text-white px-5 py-3 rounded-lg font-medium flex items-center gap-2 transition`}
      >
        <ExternalLink className="w-4 h-4" />
        {t('chat.social_connect_button', { platform: label })}
      </button>
      <p className="text-xs text-gray-500 mt-2">
        {t('chat.social_connect_hint', { platform: label })}
      </p>
    </div>
  );
};

export default SocialConnectButton;
