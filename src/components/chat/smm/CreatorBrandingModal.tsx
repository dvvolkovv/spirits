// src/components/chat/smm/CreatorBrandingModal.tsx
import React, { useRef, useState } from 'react';
import { X, Loader2, Save, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  CreatorSettings,
  uploadCreatorLogo,
  clearCreatorLogo,
  updateCreatorBranding,
} from './smm-api';

interface Props {
  campaignId: string;
  initial: CreatorSettings;
  onClose: () => void;
  onSaved: (updated: CreatorSettings) => void;
}

export const CreatorBrandingModal: React.FC<Props> = ({ campaignId, initial, onClose, onSaved }) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [slogan, setSlogan] = useState(initial.ctaSlogan ?? '');
  const [caption, setCaption] = useState(initial.publishCaption ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Файл больше 2 MB');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Допустимы PNG, JPEG, WebP');
      return;
    }
    setUploading(true);
    try {
      const r = await uploadCreatorLogo(campaignId, file);
      setLogoUrl(r.logoUrl);
      toast.success('Логотип загружен');
    } catch (e: any) {
      toast.error(`Не удалось загрузить: ${e?.message ?? 'ошибка'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClearLogo = async () => {
    if (!window.confirm('Убрать логотип? CTA вернётся к стандартному Linkeon-брендингу.')) return;
    try {
      await clearCreatorLogo(campaignId);
      setLogoUrl(null);
      toast.success('Логотип убран');
    } catch (e: any) {
      toast.error(`Не удалось: ${e?.message ?? 'ошибка'}`);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await updateCreatorBranding(campaignId, {
        ctaSlogan: slogan.trim() || null,
        publishCaption: caption.trim() || null,
      });
      toast.success('Сохранено');
      onSaved(r.settings);
      onClose();
    } catch (e: any) {
      toast.error(`Не удалось: ${e?.message ?? 'ошибка'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Брендинг последнего кадра</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Logo */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Логотип</label>
            {logoUrl ? (
              <div className="flex items-center gap-3">
                <img src={logoUrl} alt="logo" className="w-20 h-20 rounded-lg object-contain bg-gray-50 border border-gray-200" />
                <div className="flex-1 space-y-1">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="block w-full text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {uploading ? 'Загружаем…' : 'Заменить'}
                  </button>
                  <button
                    onClick={handleClearLogo}
                    className="block w-full text-xs px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="inline h-3 w-3 mr-1" />
                    Убрать
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
              >
                {uploading
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <ImageIcon className="h-5 w-5" />}
                <span>{uploading ? 'Загружаем…' : 'Загрузить логотип (PNG/JPG, до 2 MB)'}</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
            <p className="text-xs text-gray-400 mt-1">
              Квадратное изображение, обычно крупный плотный логотип на прозрачном фоне.
            </p>
          </div>

          {/* Slogan */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Слоган в кадре (до 120 символов)
            </label>
            <input
              type="text"
              value={slogan}
              onChange={(e) => setSlogan(e.target.value.slice(0, 120))}
              placeholder="Например: Гид по Грузии · 7 лет в треккинге"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Появится в финальной плашке между логотипом и хэндлом.
            </p>
          </div>

          {/* Default caption */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Описание по умолчанию для публикации
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder="Дефолтный текст под видео в соцсетях. Можно с эмодзи и хэштегами."
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Будет подставлен в окно «Опубликовать», но всегда можно изменить перед публикацией.
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900">
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

export default CreatorBrandingModal;
