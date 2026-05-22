// src/components/chat/smm/ScenarioEditModal.tsx
import React, { useState } from 'react';
import { X, Plus, Trash2, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '../../../services/apiClient';
import { ScenarioDetail, DialogTurn, BrollPrompt } from './smm-api';

type PremiumScene = NonNullable<ScenarioDetail['scenes']>[number];

interface Props {
  scenario: ScenarioDetail;
  onClose: () => void;
  onSaved: (updated: ScenarioDetail) => void;
}

const MOODS: Array<{ value: ScenarioDetail['mood']; label: string; emoji: string }> = [
  { value: 'dramatic',  label: 'Драматичное',  emoji: '🎭' },
  { value: 'inspiring', label: 'Вдохновляющее', emoji: '✨' },
  { value: 'calm',      label: 'Спокойное',     emoji: '🧘' },
  { value: 'uplifting', label: 'Жизнерадостное', emoji: '🌟' },
  { value: 'tense',     label: 'Напряжённое',   emoji: '⚡' },
  { value: 'neutral',   label: 'Нейтральное',   emoji: '◽' },
];

const ROLES: Array<{ value: string; label: string }> = [
  { value: 'psy',          label: 'Психолог' },
  { value: 'coach',        label: 'Коуч' },
  { value: 'lawyer',       label: 'Юрист' },
  { value: 'accountant',   label: 'Бухгалтер' },
  { value: 'marketer',     label: 'Маркетолог' },
  { value: 'hr',           label: 'HR-эксперт' },
  { value: 'business',     label: 'Бизнес-эксперт' },
  { value: 'copywriter',   label: 'Копирайтер' },
  { value: 'astrologer',   label: 'Астролог' },
  { value: 'numerologist', label: 'Нумеролог' },
  { value: 'humandesign',  label: 'Human Design' },
  { value: 'gamepractic',  label: 'Игропрактик' },
  { value: 'mindfulness',  label: 'Наставник осознанности' },
  { value: 'assistant',    label: 'Универсальный ассистент' },
];

export const ScenarioEditModal: React.FC<Props> = ({ scenario, onClose, onSaved }) => {
  const [title, setTitle] = useState(scenario.title);
  const [mood, setMood] = useState<ScenarioDetail['mood']>(scenario.mood);
  const [role, setRole] = useState(scenario.assistantRole);
  const [dialog, setDialog] = useState<DialogTurn[]>(() => scenario.dialog.map((t) => ({ ...t })));
  const [broll, setBroll] = useState<BrollPrompt[]>(() =>
    (scenario.brollPrompts ?? []).map((b) => ({ ...b })),
  );
  const [scenes, setScenes] = useState<PremiumScene[]>(() =>
    // Backward-compat: Юля сначала писала imagen-сцены с полем `prompt`,
    // потом перешла на `image_prompt`. Нормализуем при загрузке.
    (scenario.scenes ?? []).map((s) => {
      const sx = s as any;
      return {
        ...s,
        image_prompt: s.image_prompt ?? sx.prompt ?? undefined,
      };
    }),
  );
  const [saving, setSaving] = useState(false);
  const isPremium = !!scenario.premiumGenre;

  const updateTurn = (i: number, patch: Partial<DialogTurn>) => {
    setDialog((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };
  const addTurn = () => {
    const last = dialog[dialog.length - 1];
    const tStart = last ? last.tEnd + 1 : 2;
    setDialog([...dialog, {
      speaker: last?.speaker === 'hero' ? 'assistant' : 'hero',
      text: '',
      tStart,
      tEnd: tStart + 5,
    }]);
  };
  const removeTurn = (i: number) => setDialog(dialog.filter((_, idx) => idx !== i));

  const updateBroll = (i: number, patch: Partial<BrollPrompt>) => {
    setBroll((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  };
  const addBroll = () => {
    setBroll([...broll, { atSec: 0, type: 'ai_image', prompt: '' }]);
  };
  const removeBroll = (i: number) => setBroll(broll.filter((_, idx) => idx !== i));

  const updateScene = (i: number, patch: Partial<PremiumScene>) => {
    setScenes((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const addScene = () => {
    setScenes([...scenes, { type: 'kling', keyframe_prompt: '', motion_prompt: '', duration: 5 }]);
  };
  const removeScene = (i: number) => setScenes(scenes.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Заголовок не может быть пустым'); return; }
    if (dialog.length === 0) { toast.error('Нужна хотя бы одна реплика'); return; }
    for (const t of dialog) {
      if (!t.text.trim()) { toast.error('Все реплики должны быть с текстом'); return; }
      if (t.tEnd <= t.tStart) { toast.error('tEnd должен быть больше tStart'); return; }
    }
    for (const b of broll) {
      if (!b.prompt.trim()) { toast.error('B-roll промпт не может быть пустым'); return; }
    }
    let klingCount = 0;
    let isFirstKling = true;
    for (const s of scenes) {
      if (s.type === 'kling') {
        // keyframe_prompt обязателен ТОЛЬКО для первой kling-сцены — остальные получают
        // keyframe автоматически из последнего кадра предыдущей сцены (chain).
        if (isFirstKling && !(s.keyframe_prompt ?? '').trim()) {
          toast.error('Первая kling-сцена: keyframe_prompt обязателен'); return;
        }
        if (!(s.motion_prompt ?? '').trim()) { toast.error('Kling-сцена: motion_prompt обязателен'); return; }
        klingCount++;
        isFirstKling = false;
      } else {
        if (!(s.image_prompt ?? '').trim()) { toast.error('Imagen-сцена: image_prompt обязателен'); return; }
        // imagen-сцена разрывает chain — следующая kling снова требует keyframe_prompt
        isFirstKling = true;
      }
    }
    if (klingCount > 6) { toast.error('Не больше 6 kling-сцен на ролик'); return; }
    setSaving(true);
    try {
      const body: any = {
        title: title.trim(),
        mood,
        assistant_role: role,
        dialog: dialog.map((t) => ({
          speaker: t.speaker,
          text: t.text.trim(),
          tStart: t.tStart,
          tEnd: t.tEnd,
        })),
        broll_prompts: broll.map((b) => ({
          atSec: b.atSec,
          type: b.type,
          prompt: b.prompt.trim(),
        })),
      };
      if (isPremium) {
        body.scenes = scenes.map((s) => ({
          type: s.type,
          ...(s.type === 'kling'
            ? { keyframe_prompt: (s.keyframe_prompt ?? '').trim(), motion_prompt: (s.motion_prompt ?? '').trim() }
            : { image_prompt: (s.image_prompt ?? '').trim() }
          ),
          duration: s.duration ?? 5,
        }));
      }
      const r = await apiClient.patch(`/webhook/smm/scenarios/${scenario.id}`, body);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.message ?? `HTTP ${r.status}`);
      }
      toast.success('Сценарий обновлён');
      onSaved({
        ...scenario,
        title: body.title,
        mood: body.mood,
        assistantRole: body.assistant_role,
        dialog: body.dialog,
        brollPrompts: body.broll_prompts,
        ...(isPremium ? { scenes: body.scenes } : {}),
      });
      onClose();
    } catch (e: any) {
      toast.error(`Не удалось сохранить: ${e?.message ?? 'ошибка'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Редактирование сценария</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Заголовок</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
            />
          </div>

          {/* Mood */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Настроение</label>
            <select
              value={mood}
              onChange={(e) => setMood(e.target.value as ScenarioDetail['mood'])}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded bg-white"
            >
              {MOODS.map((m) => (
                <option key={m.value} value={m.value}>{m.emoji} {m.label}</option>
              ))}
            </select>
          </div>

          {/* Dialog */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Диалог</label>
              <button
                onClick={addTurn}
                className="text-xs text-forest-700 hover:text-forest-800 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Реплика
              </button>
            </div>
            <div className="space-y-2">
              {dialog.map((t, i) => (
                <div key={i} className="border border-gray-200 rounded p-2 space-y-1.5 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <select
                      value={t.speaker}
                      onChange={(e) => updateTurn(i, { speaker: e.target.value as DialogTurn['speaker'] })}
                      className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
                    >
                      <option value="hero">👤 Герой</option>
                      <option value="assistant">🤖 Ассистент</option>
                    </select>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={t.tStart}
                        onChange={(e) => updateTurn(i, { tStart: parseFloat(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <span>–</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={t.tEnd}
                        onChange={(e) => updateTurn(i, { tEnd: parseFloat(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <span>с</span>
                    </div>
                    <button
                      onClick={() => removeTurn(i)}
                      className="ml-auto text-red-500 hover:text-red-700"
                      title="Удалить реплику"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={t.text}
                    onChange={(e) => updateTurn(i, { text: e.target.value })}
                    rows={2}
                    className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded resize-none bg-white"
                    placeholder="Текст реплики"
                  />
                </div>
              ))}
              {dialog.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-3">Реплик нет — добавь хотя бы одну</p>
              )}
            </div>
          </div>

          {/* B-roll — только для классики. В premium-режиме весь визуал — kling-сцены. */}
          {!isPremium && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Визуальные вставки (B-roll)</label>
              <button
                onClick={addBroll}
                className="text-xs text-forest-700 hover:text-forest-800 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Вставка
              </button>
            </div>
            <div className="space-y-2">
              {broll.map((b, i) => (
                <div key={i} className="border border-gray-200 rounded p-2 space-y-1.5 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <select
                      value={b.type}
                      onChange={(e) => updateBroll(i, { type: e.target.value as BrollPrompt['type'] })}
                      className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
                    >
                      <option value="ai_image">🎨 AI-картинка</option>
                      <option value="stock_video">🎞️ Стоковое видео</option>
                    </select>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>в</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={b.atSec}
                        onChange={(e) => updateBroll(i, { atSec: parseFloat(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <span>с</span>
                    </div>
                    <button
                      onClick={() => removeBroll(i)}
                      className="ml-auto text-red-500 hover:text-red-700"
                      title="Удалить вставку"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={b.prompt}
                    onChange={(e) => updateBroll(i, { prompt: e.target.value })}
                    className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded bg-white"
                    placeholder="Промпт на английском для Imagen/Pexels"
                  />
                </div>
              ))}
              {broll.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-3">Вставок нет — фон будет только градиент</p>
              )}
            </div>
          </div>
          )}

          {/* Premium scenes — only for premium scenarios */}
          {isPremium && (
            <div className="border-t border-purple-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-purple-700">
                  🎬 Premium-сцены ({scenario.premiumGenre})
                </label>
                <button
                  onClick={addScene}
                  className="text-xs text-purple-700 hover:text-purple-800 inline-flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Сцена
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Каждая сцена = 5 сек kling-клипа. Сцены идут подряд и покрывают весь ролик.
                Последний кадр предыдущей сцены автоматически становится стартовым следующей —
                бесшовный переход. Для 30-сек ролика нужно 6 сцен, для 15-сек — 3.
              </p>
              <div className="space-y-2">
                {scenes.map((s, i) => {
                  // Первая kling-сцена (с момента начала или после imagen) требует keyframe_prompt.
                  // Все последующие kling в chain'е получают keyframe из last-frame предыдущей.
                  let isFirstKlingHere = s.type === 'kling';
                  for (let k = 0; k < i; k++) {
                    if (scenes[k].type === 'imagen') isFirstKlingHere = true;
                    else if (scenes[k].type === 'kling') isFirstKlingHere = false;
                  }
                  return (
                  <div key={i} className="border border-purple-200 rounded p-2 space-y-1.5 bg-purple-50">
                    <div className="flex items-center gap-2">
                      <select
                        value={s.type}
                        onChange={(e) => updateScene(i, { type: e.target.value as PremiumScene['type'] })}
                        className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
                      >
                        <option value="kling">✨ Kling (animated)</option>
                        <option value="imagen">🎨 Imagen (static)</option>
                      </select>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>длительность</span>
                        <select
                          value={s.duration === 10 ? 10 : 5}
                          onChange={(e) => updateScene(i, { duration: parseInt(e.target.value, 10) })}
                          className="text-xs px-1.5 py-1 border border-gray-300 rounded bg-white"
                        >
                          <option value={5}>5 с</option>
                          <option value={10}>10 с</option>
                        </select>
                      </div>
                      <button
                        onClick={() => removeScene(i)}
                        className="ml-auto text-red-500 hover:text-red-700"
                        title="Удалить сцену"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {s.type === 'kling' ? (
                      <>
                        {isFirstKlingHere ? (
                          <textarea
                            value={s.keyframe_prompt ?? ''}
                            onChange={(e) => updateScene(i, { keyframe_prompt: e.target.value })}
                            rows={2}
                            className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded resize-none bg-white"
                            placeholder="keyframe_prompt — СТАРТОВЫЙ кадр через nano-banana (только для первой kling-сцены)"
                          />
                        ) : (
                          <div className="text-xs text-gray-500 italic px-2 py-1 bg-purple-100 rounded">
                            ↳ keyframe = последний кадр предыдущей сцены (автоматически через ffmpeg)
                          </div>
                        )}
                        <textarea
                          value={s.motion_prompt ?? ''}
                          onChange={(e) => updateScene(i, { motion_prompt: e.target.value })}
                          rows={2}
                          className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded resize-none bg-white"
                          placeholder="motion_prompt — что происходит за 5 секунд (одно конкретное движение/превращение)"
                        />
                      </>
                    ) : (
                      <textarea
                        value={s.image_prompt ?? ''}
                        onChange={(e) => updateScene(i, { image_prompt: e.target.value })}
                        rows={2}
                        className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded resize-none bg-white"
                        placeholder="image_prompt для Imagen — статичный кадр"
                      />
                    )}
                  </div>
                  );
                })}
                {scenes.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-3">
                    Сцен нет — премиум-сценарий рендерится как классика
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScenarioEditModal;
