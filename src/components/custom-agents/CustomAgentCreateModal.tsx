import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { customAgentsApi } from '../../services/customAgentsApi';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Step = 'describe' | 'preview' | 'saving';

export const CustomAgentCreateModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const [step, setStep] = useState<Step>('describe');
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (description.trim().length < 3) {
      toast.error('Опиши роль чуть подробнее');
      return;
    }
    setGenerating(true);
    try {
      const draft = await customAgentsApi.draft(description.trim());
      setName(draft.name);
      setSystemPrompt(draft.systemPrompt);
      setStep('preview');
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Не удалось сгенерировать');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || systemPrompt.trim().length < 20) {
      toast.error('Имя и промпт (мин 20 символов) обязательны');
      return;
    }
    setStep('saving');
    try {
      await customAgentsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim(),
      });
      toast.success('Агент создан');
      onCreated();
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Не удалось сохранить');
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Создать кастомного ассистента</h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">
          {step === 'describe' && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Опиши роль одной строкой</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Например: саркастичный кинокритик, который любит Тарантино"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={300}
                />
                <span className="text-xs text-gray-500 mt-1 block">
                  Claude сгенерирует имя и system prompt — ты сможешь отредактировать
                </span>
              </label>
              <button
                onClick={handleGenerate}
                disabled={generating || description.trim().length < 3}
                className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <><Loader2 size={16} className="animate-spin" /> Генерирую...</>
                ) : (
                  <><Sparkles size={16} /> Сгенерировать <ArrowRight size={14} /></>
                )}
              </button>
            </>
          )}

          {(step === 'preview' || step === 'saving') && (
            <>
              <label className="block mb-4">
                <span className="text-sm font-medium text-gray-700">Имя</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"
                  maxLength={80}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">System prompt</span>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={14}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                />
                <span className="text-xs text-gray-500 mt-1 block">
                  {systemPrompt.length} символов (мин 20)
                </span>
              </label>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={() => setStep('describe')}
                  disabled={step === 'saving'}
                  className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
                >
                  Назад
                </button>
                <button
                  onClick={handleSave}
                  disabled={step === 'saving'}
                  className="flex-1 py-3 rounded-xl bg-forest-600 hover:bg-forest-700 text-white font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {step === 'saving' ? 'Сохраняю...' : 'Сохранить'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
