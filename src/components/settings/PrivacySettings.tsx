import { useCallback, useEffect, useRef, useState } from 'react';
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

interface PrivacySettings { automaticProfiling: boolean; discoverable: boolean }
type PrivacyKey = keyof PrivacySettings;

export default function PrivacySettings() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState<PrivacyKey | null>(null);
  const [saving, setSaving] = useState<Record<PrivacyKey, boolean>>({ automaticProfiling: false, discoverable: false });
  const inFlight = useRef(new Set<PrivacyKey>());
  const mounted = useRef(true);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const isLatest = () => mounted.current && loadGeneration.current === generation;
    setLoading(true); setLoadFailed(false);
    try {
      const response = await apiClient.get('/webhook/privacy-settings');
      if (!response.ok) throw new Error(String(response.status));
      const value = await response.json() as PrivacySettings;
      if (isLatest()) setSettings(value);
    } catch { if (isLatest()) { setSettings(null); setLoadFailed(true); } }
    finally { if (isLatest()) setLoading(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; loadGeneration.current += 1; };
  }, [load]);

  const change = async (key: PrivacyKey, next: boolean) => {
    if (!settings || inFlight.current.has(key)) return;
    const previous = settings[key];
    inFlight.current.add(key);
    setSaving((current) => ({ ...current, [key]: true }));
    setSaveFailed(null);
    setSettings((current) => current ? { ...current, [key]: next } : current);
    try {
      const response = await apiClient.post('/webhook/privacy-settings', { [key]: next });
      if (!response.ok) throw new Error(String(response.status));
      const saved = await response.json() as PrivacySettings;
      if (mounted.current) setSettings((current) => current ? { ...current, [key]: saved[key] } : current);
    } catch {
      if (mounted.current) {
        setSettings((current) => current ? { ...current, [key]: previous } : current);
        setSaveFailed(key);
      }
    } finally {
      inFlight.current.delete(key);
      if (mounted.current) setSaving((current) => ({ ...current, [key]: false }));
    }
  };

  const control = (key: PrivacyKey, label: string, description: string) => (
    <div className="py-3 border-t border-gray-100">
      <div className="flex items-start justify-between gap-4">
        <div><div className="text-sm font-medium text-gray-900">{label}</div><p className="text-xs text-gray-500 mt-1">{description}</p></div>
        <button type="button" role="switch" aria-checked={settings?.[key] ?? false} aria-label={label}
          disabled={loading || saving[key]} onClick={() => void change(key, !(settings?.[key] ?? false))}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${settings?.[key] ? 'bg-forest-600' : 'bg-gray-300'}`}>
          <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white transition-transform ${settings?.[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {saveFailed === key && <p className="text-xs text-red-600 mt-2">{t('settings.privacy_controls.save_error')}</p>}
    </div>
  );

  return <section className="bg-white border border-gray-200 rounded-xl p-4">
    <h2 className="text-lg font-semibold text-gray-900 flex items-center"><Shield className="w-5 h-5 mr-2 text-forest-600" />{t('settings.privacy_controls.title')}</h2>
    <p className="text-sm text-gray-500 mt-1">{t('settings.privacy_controls.subtitle')}</p>
    {loading && <p className="text-sm text-gray-500 mt-4">{t('settings.privacy_controls.loading')}</p>}
    {loadFailed && <div className="mt-4"><p className="text-sm text-red-600">{t('settings.privacy_controls.load_error')}</p><button type="button" className="mt-2 text-sm text-forest-700" onClick={() => void load()}>{t('settings.privacy_controls.retry')}</button></div>}
    {settings && <div className="mt-2">
      {control('automaticProfiling', t('settings.privacy_controls.automatic_profiling'), t('settings.privacy_controls.automatic_profiling_description'))}
      {control('discoverable', t('settings.privacy_controls.discoverable'), t('settings.privacy_controls.discoverable_description'))}
    </div>}
  </section>;
}
