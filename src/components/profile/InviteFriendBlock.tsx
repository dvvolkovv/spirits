import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gift, Copy, Check } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import { track } from '../../services/eventsClient';

/**
 * "Пригласи друга" — referral entry point in the profile (tasks a7dd3d63 /
 * bbb80368). Fetches the user's referral link from /referral/stats, which now
 * get-or-creates a self-serve slug, so every user always has a link to share.
 * Uses the existing referral program's parameters — this is just a visible
 * entry point, not a change to the program.
 */
const InviteFriendBlock: React.FC = () => {
  const navigate = useNavigate();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    apiClient
      .get('/webhook/referral/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.referral_link) setLink(d.referral_link); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).catch(() => {});
    track('referral_link_copied', { source: 'profile' });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!link) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
      <div className="flex items-center mb-3">
        <div className="w-10 h-10 bg-gradient-to-br from-warm-500 to-forest-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
          <Gift className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Пригласи друга</h2>
          <p className="text-sm text-gray-600">Поделись ссылкой — друзья присоединятся к Linkeon по ней</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
        <span className="text-sm text-gray-700 flex-1 break-all">{link}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 px-3 py-1.5 bg-forest-600 text-white text-sm font-medium rounded-md hover:bg-forest-700 transition-colors flex-shrink-0"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      <button
        onClick={() => navigate('/referral')}
        className="mt-3 text-sm text-forest-700 hover:underline"
      >
        Подробнее о реферальной программе →
      </button>
    </div>
  );
};

export default InviteFriendBlock;
