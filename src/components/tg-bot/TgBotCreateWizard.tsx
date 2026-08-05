import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowRight, ExternalLink, Check, Copy } from 'lucide-react';
import { tgBotApi, type AddressingMode, type VoiceReplyMode } from '../../services/tgBotApi';
import { RolePickerField } from './role-picker/RolePickerField';

type Step = 'identity' | 'config' | 'addgroup';

export const TgBotCreateWizard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('identity');

  const [identityDeepLink, setIdentityDeepLink] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<{ type: 'preset' | 'custom'; id: string } | null>(null);
  const [addressingMode, setAddressingMode] = useState<AddressingMode>('strict');
  const [voiceReplyMode, setVoiceReplyMode] = useState<VoiceReplyMode>('never');

  const [claimDeepLink, setClaimDeepLink] = useState<string | null>(null);

  useEffect(() => {
    tgBotApi.identityStatus().then(s => {
      if (s.bound) setStep('config');
    });
  }, []);

  const generateIdentityLink = async () => {
    try {
      const r = await tgBotApi.identityLink();
      setIdentityDeepLink(r.deepLink);
    } catch (e: any) { toast.error(e.message); }
  };

  const submitConfig = async () => {
    if (!displayName.trim() || !role) {
      toast.error(t('tgBot.wizard_fill_error'));
      return;
    }
    try {
      const r = await tgBotApi.create({
        displayName: displayName.trim(),
        presetAgentId: role.type === 'preset' ? role.id : undefined,
        customAgentId: role.type === 'custom' ? role.id : undefined,
        addressingMode,
        voiceReplyMode,
      });
      setClaimDeepLink(r.deepLink);
      setStep('addgroup');
    } catch (e: any) { toast.error(e.message); }
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success(t('chat.copied'));
  };

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('tgBot.wizard_title')}</h1>

      {step === 'identity' && (
        <div className="bg-white rounded-2xl p-5 border border-gray-200">
          <h2 className="font-semibold mb-2">{t('tgBot.step1_title')}</h2>
          <p className="text-sm text-gray-600 mb-4">
            {t('tgBot.step1_desc')}
          </p>
          {!identityDeepLink ? (
            <button
              onClick={generateIdentityLink}
              className="px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 text-white font-medium"
            >
              {t('tgBot.generate_link_button')}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <a
                href={identityDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 text-white font-medium"
              >
                <ExternalLink size={16} /> {t('tgBot.open_in_telegram')}
              </a>
              <button
                onClick={async () => {
                  const s = await tgBotApi.identityStatus();
                  if (s.bound) { setStep('config'); toast.success(t('tgBot.bound_success')); }
                  else toast.error(t('tgBot.not_bound_error'));
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium"
              >
                {t('tgBot.i_pressed_start')}
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'config' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('tgBot.name_in_group_label')}</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('tgBot.name_placeholder')}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                maxLength={80}
              />
              <span className="text-xs text-gray-500 mt-1 block">
                {t('tgBot.name_hint')}
              </span>
            </label>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold mb-3">{t('tgBot.role_label')}</h2>
            <RolePickerField value={role} onChange={setRole} />
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold mb-3">{t('tgBot.addressing_title')}</h2>
            {([
              ['strict', t('tgBot.mode_strict'), t('tgBot.addr_strict_desc')],
              ['smart', t('tgBot.mode_smart'), t('tgBot.addr_smart_desc')],
              ['always', t('tgBot.mode_always'), t('tgBot.addr_always_desc')],
            ] as const).map(([val, label, desc]) => (
              <label key={val} className="flex items-start gap-3 py-2 cursor-pointer">
                <input type="radio" name="addr" checked={addressingMode === val} onChange={() => setAddressingMode(val)} className="mt-1" />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-gray-600">{desc}</div>
                </div>
              </label>
            ))}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold mb-3">{t('tgBot.wizard_voice_title')}</h2>
            {([
              ['never', t('tgBot.voice_never_label'), t('tgBot.voice_never_desc')],
              ['mirror', t('tgBot.voice_mirror_label'), t('tgBot.voice_mirror_desc')],
              ['always', t('tgBot.mode_always'), t('tgBot.voice_always_desc')],
            ] as const).map(([val, label, desc]) => (
              <label key={val} className="flex items-start gap-3 py-2 cursor-pointer">
                <input type="radio" name="voice" checked={voiceReplyMode === val} onChange={() => setVoiceReplyMode(val)} className="mt-1" />
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-gray-600">{desc}</div>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={submitConfig}
            className="w-full py-3 rounded-lg bg-forest-600 hover:bg-forest-700 text-white font-medium flex items-center justify-center gap-2"
          >
            {t('tgBot.wizard_submit_button')} <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 'addgroup' && claimDeepLink && (
        <div className="bg-white rounded-2xl p-5 border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><Check size={16} /></div>
            <h2 className="font-semibold">{t('tgBot.step3_title')}</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            {t('tgBot.addgroup_hint')}
          </p>
          <div className="flex items-center gap-2 mb-4">
            <input type="text" value={claimDeepLink} readOnly className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono" />
            <button onClick={() => copy(claimDeepLink)} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50">
              <Copy size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={claimDeepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-forest-600 hover:bg-forest-700 text-white font-medium"
            >
              <ExternalLink size={16} /> {t('tgBot.open_in_telegram')}
            </a>
            <button
              onClick={() => navigate('/telegram-bots')}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium"
            >
              {t('common.done')}
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
