// src/components/chat/smm/CreatorBrandingModal.tsx
import React, { useRef, useState } from 'react';
import { X, Loader2, Save, Upload, Trash2, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  CreatorSettings,
  uploadCreatorLogo,
  clearCreatorLogo,
  updateCreatorBranding,
  uploadCreatorBackground,
  clearCreatorBackground,
} from './smm-api';

interface Props {
  campaignId: string;
  initial: CreatorSettings;
  onClose: () => void;
  onSaved: (updated: CreatorSettings) => void;
}

export const CreatorBrandingModal: React.FC<Props> = ({ campaignId, initial, onClose, onSaved }) => {
  const { t } = useTranslation();
  const [ctaHandle, setCtaHandle] = useState(initial.ctaHandle ?? '');
  const [ctaLabel, setCtaLabel] = useState(initial.ctaLabel ?? t('studio.cta_label_placeholder'));
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [slogan, setSlogan] = useState(initial.ctaSlogan ?? '');
  const [caption, setCaption] = useState(initial.publishCaption ?? '');
  const [bgColor, setBgColor] = useState(initial.bgColor ?? '');
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(initial.bgImageUrl);
  const [uploading, setUploading] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('studio.error_file_too_large'));
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error(t('studio.error_file_type'));
      return;
    }
    setUploading(true);
    try {
      const r = await uploadCreatorLogo(campaignId, file);
      setLogoUrl(r.logoUrl);
      toast.success(t('studio.logo_uploaded'));
    } catch (e: any) {
      toast.error(t('studio.upload_error', { error: e?.message ?? t('studio.error_fallback') }));
    } finally {
      setUploading(false);
    }
  };

  const handleClearLogo = async () => {
    if (!window.confirm(t('studio.confirm_clear_logo'))) return;
    try {
      await clearCreatorLogo(campaignId);
      setLogoUrl(null);
      toast.success(t('studio.logo_cleared'));
    } catch (e: any) {
      toast.error(t('studio.generic_error', { error: e?.message ?? t('studio.error_fallback') }));
    }
  };

  const handleBgFile = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      toast.error(t('studio.error_file_too_large'));
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error(t('studio.error_file_type'));
      return;
    }
    setBgUploading(true);
    try {
      const r = await uploadCreatorBackground(campaignId, file);
      setBgImageUrl(r.bgImageUrl);
      toast.success(t('studio.bg_uploaded'));
    } catch (e: any) {
      toast.error(t('studio.upload_error', { error: e?.message ?? t('studio.error_fallback') }));
    } finally {
      setBgUploading(false);
    }
  };

  const handleClearBg = async () => {
    try {
      await clearCreatorBackground(campaignId);
      setBgImageUrl(null);
      toast.success(t('studio.bg_cleared'));
    } catch (e: any) {
      toast.error(t('studio.generic_error', { error: e?.message ?? t('studio.error_fallback') }));
    }
  };

  const handleSave = async () => {
    if (!ctaHandle.trim()) {
      toast.error(t('studio.error_cta_handle_required'));
      return;
    }
    if (!ctaLabel.trim()) {
      toast.error(t('studio.error_cta_label_required'));
      return;
    }
    setSaving(true);
    try {
      const r = await updateCreatorBranding(campaignId, {
        ctaHandle: ctaHandle.trim(),
        ctaLabel: ctaLabel.trim(),
        ctaSlogan: slogan.trim() || null,
        publishCaption: caption.trim() || null,
        bgColor: bgColor.trim() || null,
      });
      toast.success(t('studio.saved'));
      onSaved(r.settings);
      onClose();
    } catch (e: any) {
      toast.error(t('studio.generic_error', { error: e?.message ?? t('studio.error_fallback') }));
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
          <h3 className="text-base font-semibold">{t('studio.branding_title')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* CTA — куда вести аудиторию (handle/url) и какой призыв */}
          <div className="border border-forest-100 bg-forest-50/50 rounded-lg p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('studio.cta_handle_label')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={ctaHandle}
                onChange={(e) => setCtaHandle(e.target.value.slice(0, 120))}
                placeholder={t('studio.cta_handle_placeholder')}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded bg-white focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {t('studio.cta_handle_hint')}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                {t('studio.cta_label_label')}
              </label>
              <input
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value.slice(0, 60))}
                placeholder={t('studio.cta_label_placeholder')}
                className="w-full text-sm px-3 py-2 border border-gray-300 rounded bg-white focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {t('studio.cta_label_hint')}
              </p>
            </div>
          </div>

          {/* Logo */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">{t('studio.logo_label')}</label>
            {logoUrl ? (
              <div className="flex items-center gap-3">
                <img src={logoUrl} alt="logo" className="w-20 h-20 rounded-lg object-contain bg-gray-50 border border-gray-200" />
                <div className="flex-1 space-y-1">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="block w-full text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {uploading ? t('studio.uploading') : t('studio.replace')}
                  </button>
                  <button
                    onClick={handleClearLogo}
                    className="block w-full text-xs px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="inline h-3 w-3 mr-1" />
                    {t('studio.remove')}
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
                <span>{uploading ? t('studio.uploading') : t('studio.logo_upload_cta')}</span>
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
              {t('studio.logo_hint')}
            </p>
          </div>

          {/* Slogan */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t('studio.slogan_label')}
            </label>
            <input
              type="text"
              value={slogan}
              onChange={(e) => setSlogan(e.target.value.slice(0, 120))}
              placeholder={t('studio.slogan_placeholder')}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('studio.slogan_hint')}
            </p>
          </div>

          {/* Default caption */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t('studio.default_caption_label')}
            </label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder={t('studio.default_caption_placeholder')}
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('studio.default_caption_hint')}
            </p>
          </div>

          {/* Background image */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">{t('studio.bg_image_label')}</label>
            {bgImageUrl ? (
              <div className="flex items-center gap-3">
                <img src={bgImageUrl} alt="bg" className="w-24 h-32 rounded-lg object-cover border border-gray-200" />
                <div className="flex-1 space-y-1">
                  <button
                    onClick={() => bgFileRef.current?.click()}
                    disabled={bgUploading}
                    className="block w-full text-xs px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {bgUploading ? t('studio.uploading') : t('studio.replace')}
                  </button>
                  <button
                    onClick={handleClearBg}
                    className="block w-full text-xs px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="inline h-3 w-3 mr-1" />
                    {t('studio.remove')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => bgFileRef.current?.click()}
                disabled={bgUploading}
                className="w-full flex items-center justify-center gap-2 py-6 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
              >
                {bgUploading
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : <Upload className="h-5 w-5" />}
                <span>{bgUploading ? t('studio.uploading') : t('studio.bg_upload_cta')}</span>
              </button>
            )}
            <input
              ref={bgFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleBgFile(f);
                if (bgFileRef.current) bgFileRef.current.value = '';
              }}
            />
            <p className="text-xs text-gray-400 mt-1">
              {t('studio.bg_image_hint')}
            </p>
          </div>

          {/* Background color (fallback when no image) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t('studio.bg_color_label')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(bgColor) ? bgColor : '#1a1a2e'}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-12 h-9 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value.slice(0, 200))}
                placeholder={t('studio.bg_color_placeholder')}
                className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-forest-500 focus:border-forest-500 outline-none font-mono"
              />
              {bgColor && (
                <button
                  onClick={() => setBgColor('')}
                  className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                  title={t('studio.clear_title')}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {bgColor && (
              <div
                className="mt-2 h-10 rounded border border-gray-200"
                style={{ background: bgColor }}
                title={t('studio.preview_title')}
              />
            )}
            <p className="text-xs text-gray-400 mt-1">
              {t('studio.bg_color_hint')}
            </p>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900">
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

export default CreatorBrandingModal;
