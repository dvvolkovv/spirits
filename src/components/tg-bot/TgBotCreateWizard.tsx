import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, ExternalLink, Check, Copy } from 'lucide-react';
import { tgBotApi, type AddressingMode, type VoiceReplyMode } from '../../services/tgBotApi';
import { RolePickerField } from './role-picker/RolePickerField';

type Step = 'identity' | 'config' | 'addgroup';

export const TgBotCreateWizard: React.FC = () => {
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
      toast.error('Заполни имя и выбери роль');
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
    toast.success('Скопировано');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Создать Telegram-бота</h1>

      {step === 'identity' && (
        <div className="bg-white rounded-2xl p-5 border border-gray-200">
          <h2 className="font-semibold mb-2">Шаг 1: Привяжи свой Telegram</h2>
          <p className="text-sm text-gray-600 mb-4">
            Это нужно один раз. Бот узнает, что твой Telegram-аккаунт связан с Linkeon — чтобы /balance и /silent были доступны только тебе.
          </p>
          {!identityDeepLink ? (
            <button
              onClick={generateIdentityLink}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              Сгенерировать ссылку
            </button>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <a
                href={identityDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                <ExternalLink size={16} /> Открыть в Telegram
              </a>
              <button
                onClick={async () => {
                  const s = await tgBotApi.identityStatus();
                  if (s.bound) { setStep('config'); toast.success('Привязано'); }
                  else toast.error('Ещё не привязан. Нажми /start в Telegram.');
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium"
              >
                Я нажал /start
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'config' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Имя бота в группе</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Финансист"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                maxLength={80}
              />
              <span className="text-xs text-gray-500 mt-1 block">
                Бот будет реагировать, когда в сообщении встретится это имя (в strict-режиме)
              </span>
            </label>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold mb-3">Роль</h2>
            <RolePickerField value={role} onChange={setRole} />
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-200">
            <h2 className="font-semibold mb-3">Когда отвечает</h2>
            {([
              ['strict', 'По обращению', 'Только когда зовут @-mention, реплай на бота или произносят его имя'],
              ['smart', 'Умно', 'Сам решает, когда уместно вмешаться (rate-limit 60 сек)'],
              ['always', 'Всегда', 'На каждое сообщение в группе (rate-limit 3 сек)'],
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
            <h2 className="font-semibold mb-3">Голосовые ответы</h2>
            {([
              ['never', 'Никогда', 'Всегда текстом'],
              ['mirror', 'Зеркально', 'Голос на голос, текст на текст'],
              ['always', 'Всегда', 'Каждый ответ голосом'],
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
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center justify-center gap-2"
          >
            Создать и получить ссылку для группы <ArrowRight size={16} />
          </button>
        </div>
      )}

      {step === 'addgroup' && claimDeepLink && (
        <div className="bg-white rounded-2xl p-5 border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><Check size={16} /></div>
            <h2 className="font-semibold">Шаг 3: Добавь бота в группу</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Открой ссылку — Telegram предложит выбрать группу. После добавления бот сам активируется.
            Ссылка работает 15 минут.
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              <ExternalLink size={16} /> Открыть в Telegram
            </a>
            <button
              onClick={() => navigate('/telegram-bots')}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 font-medium"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
