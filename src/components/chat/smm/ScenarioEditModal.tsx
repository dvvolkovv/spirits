// src/components/chat/smm/ScenarioEditModal.tsx
import React, { useState } from 'react';
import { X, Plus, Trash2, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { ScenarioDetail, DialogTurn, BrollPrompt } from './smm-api';

type PremiumScene = NonNullable<ScenarioDetail['scenes']>[number];

interface Props {
  scenario: ScenarioDetail;
  onClose: () => void;
  onSaved: (updated: ScenarioDetail) => void;
}

export const ScenarioEditModal: React.FC<Props> = ({ scenario, onClose, onSaved }) => {
  const { t } = useTranslation();

  const MOODS: Array<{ value: ScenarioDetail['mood']; label: string; emoji: string }> = [
    { value: 'dramatic',  label: t('studio.mood_dramatic'),  emoji: '🎭' },
    { value: 'inspiring', label: t('studio.mood_inspiring'), emoji: '✨' },
    { value: 'calm',      label: t('studio.mood_calm'),     emoji: '🧘' },
    { value: 'uplifting', label: t('studio.mood_uplifting'), emoji: '🌟' },
    { value: 'tense',     label: t('studio.mood_tense'),   emoji: '⚡' },
    { value: 'neutral',   label: t('studio.mood_neutral'),   emoji: '◽' },
  ];

  const ROLES: Array<{ value: string; label: string }> = [
    { value: 'psy',          label: t('chat.assistant_role_psych') },
    { value: 'coach',        label: t('chat.assistant_role_coach') },
    { value: 'lawyer',       label: t('studio.role_lawyer') },
    { value: 'accountant',   label: t('studio.role_accountant') },
    { value: 'marketer',     label: t('studio.role_marketer') },
    { value: 'hr',           label: t('studio.role_hr') },
    { value: 'business',     label: t('studio.role_business') },
    { value: 'copywriter',   label: t('studio.role_copywriter') },
    { value: 'astrologer',   label: t('chat.assistant_role_astro') },
    { value: 'numerologist', label: t('studio.role_numerologist') },
    { value: 'humandesign',  label: t('chat.assistant_role_hd') },
    { value: 'gamepractic',  label: t('chat.assistant_role_gameplay') },
    { value: 'mindfulness',  label: t('studio.role_mindfulness') },
    { value: 'assistant',    label: t('studio.role_universal_assistant') },
  ];

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
    if (!title.trim()) { toast.error(t('studio.error_title_empty')); return; }
    if (dialog.length === 0) { toast.error(t('studio.error_no_turns')); return; }
    for (const turn of dialog) {
      if (!turn.text.trim()) { toast.error(t('studio.error_turn_text_empty')); return; }
      if (turn.tEnd <= turn.tStart) { toast.error(t('studio.error_tend_lte_tstart')); return; }
    }
    for (const b of broll) {
      if (!b.prompt.trim()) { toast.error(t('studio.error_broll_empty')); return; }
    }
    let klingCount = 0;
    let isFirstKling = true;
    for (const s of scenes) {
      if (s.type === 'kling') {
        // keyframe_prompt обязателен ТОЛЬКО для первой kling-сцены — остальные получают
        // keyframe автоматически из последнего кадра предыдущей сцены (chain).
        if (isFirstKling && !(s.keyframe_prompt ?? '').trim()) {
          toast.error(t('studio.error_first_kling_keyframe')); return;
        }
        if (!(s.motion_prompt ?? '').trim()) { toast.error(t('studio.error_kling_motion_required')); return; }
        klingCount++;
        isFirstKling = false;
      } else {
        if (!(s.image_prompt ?? '').trim()) { toast.error(t('studio.error_imagen_prompt_required')); return; }
        // imagen-сцена разрывает chain — следующая kling снова требует keyframe_prompt
        isFirstKling = true;
      }
    }
    if (klingCount > 6) { toast.error(t('studio.error_max_kling_scenes')); return; }
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
      toast.success(t('studio.scenario_edit_success'));
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
      toast.error(t('studio.scenario_edit_save_error', { error: e?.message ?? t('studio.error_fallback') }));
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
          <h3 className="text-base font-semibold">{t('studio.scenario_edit_title')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('studio.field_title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
            />
          </div>

          {/* Mood */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('studio.field_mood')}</label>
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
              <label className="text-xs font-medium text-gray-600">{t('studio.field_dialog')}</label>
              <button
                onClick={addTurn}
                className="text-xs text-forest-700 hover:text-forest-800 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> {t('studio.add_turn')}
              </button>
            </div>
            <div className="space-y-2">
              {dialog.map((turn, i) => (
                <div key={i} className="border border-gray-200 rounded p-2 space-y-1.5 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <select
                      value={turn.speaker}
                      onChange={(e) => updateTurn(i, { speaker: e.target.value as DialogTurn['speaker'] })}
                      className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
                    >
                      <option value="hero">{t('studio.dialog_speaker_hero_option')}</option>
                      <option value="assistant">{t('studio.dialog_speaker_assistant_option')}</option>
                    </select>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={turn.tStart}
                        onChange={(e) => updateTurn(i, { tStart: parseFloat(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <span>–</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={turn.tEnd}
                        onChange={(e) => updateTurn(i, { tEnd: parseFloat(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <span>{t('video.duration.suffix')}</span>
                    </div>
                    <button
                      onClick={() => removeTurn(i)}
                      className="ml-auto text-red-500 hover:text-red-700"
                      title={t('studio.delete_turn_title')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={turn.text}
                    onChange={(e) => updateTurn(i, { text: e.target.value })}
                    rows={2}
                    className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded resize-none bg-white"
                    placeholder={t('studio.turn_text_placeholder')}
                  />
                </div>
              ))}
              {dialog.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-3">{t('studio.no_turns_hint')}</p>
              )}
            </div>
          </div>

          {/* B-roll — только для классики. В premium-режиме весь визуал — kling-сцены. */}
          {!isPremium && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">{t('studio.field_broll')}</label>
              <button
                onClick={addBroll}
                className="text-xs text-forest-700 hover:text-forest-800 inline-flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> {t('studio.add_broll')}
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
                      <option value="ai_image">{t('studio.broll_type_ai_image')}</option>
                      <option value="stock_video">{t('studio.broll_type_stock_video')}</option>
                    </select>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <span>{t('studio.broll_at_prefix')}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={b.atSec}
                        onChange={(e) => updateBroll(i, { atSec: parseFloat(e.target.value) || 0 })}
                        className="w-16 px-1.5 py-1 border border-gray-300 rounded"
                      />
                      <span>{t('video.duration.suffix')}</span>
                    </div>
                    <button
                      onClick={() => removeBroll(i)}
                      className="ml-auto text-red-500 hover:text-red-700"
                      title={t('studio.delete_broll_title')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={b.prompt}
                    onChange={(e) => updateBroll(i, { prompt: e.target.value })}
                    className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded bg-white"
                    placeholder={t('studio.broll_prompt_placeholder')}
                  />
                </div>
              ))}
              {broll.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-3">{t('studio.no_broll_hint')}</p>
              )}
            </div>
          </div>
          )}

          {/* Premium scenes — only for premium scenarios */}
          {isPremium && (
            <div className="border-t border-purple-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-purple-700">
                  {t('studio.premium_scenes_label', { genre: scenario.premiumGenre })}
                </label>
                <button
                  onClick={addScene}
                  className="text-xs text-purple-700 hover:text-purple-800 inline-flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> {t('studio.add_scene')}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                {t('studio.premium_scenes_hint')}
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
                        <option value="kling">{t('studio.scene_type_kling')}</option>
                        <option value="imagen">{t('studio.scene_type_imagen')}</option>
                      </select>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <span>{t('studio.field_duration_label')}</span>
                        <select
                          value={s.duration === 10 ? 10 : 5}
                          onChange={(e) => updateScene(i, { duration: parseInt(e.target.value, 10) })}
                          className="text-xs px-1.5 py-1 border border-gray-300 rounded bg-white"
                        >
                          <option value={5}>{t('studio.duration_5s')}</option>
                          <option value={10}>{t('studio.duration_10s')}</option>
                        </select>
                      </div>
                      <button
                        onClick={() => removeScene(i)}
                        className="ml-auto text-red-500 hover:text-red-700"
                        title={t('studio.delete_scene_title')}
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
                            placeholder={t('studio.keyframe_prompt_placeholder')}
                          />
                        ) : (
                          <div className="text-xs text-gray-500 italic px-2 py-1 bg-purple-100 rounded">
                            {t('studio.keyframe_auto_hint')}
                          </div>
                        )}
                        <textarea
                          value={s.motion_prompt ?? ''}
                          onChange={(e) => updateScene(i, { motion_prompt: e.target.value })}
                          rows={2}
                          className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded resize-none bg-white"
                          placeholder={t('studio.motion_prompt_placeholder')}
                        />
                      </>
                    ) : (
                      <textarea
                        value={s.image_prompt ?? ''}
                        onChange={(e) => updateScene(i, { image_prompt: e.target.value })}
                        rows={2}
                        className="w-full text-sm px-2 py-1.5 border border-gray-300 rounded resize-none bg-white"
                        placeholder={t('studio.image_prompt_placeholder')}
                      />
                    )}
                  </div>
                  );
                })}
                {scenes.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-3">
                    {t('studio.no_scenes_hint')}
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
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-forest-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScenarioEditModal;
