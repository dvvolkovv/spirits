import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, Sparkles } from 'lucide-react';
import { apiClient } from '../../services/apiClient';
import {
  BUSINESS_FIELDS,
  BusinessFieldKey,
  BusinessProfile,
  emptyFields,
  filledFields,
  isCardEmpty,
} from './businessFields';

/**
 * Карточка бизнеса в профиле.
 *
 * Главный сценарий — не «заполнить восемь полей», а «поправить одно, которое
 * ассистент понял неверно». Поэтому правка на месте по одному полю, а пустые
 * поля спрятаны за «Дополнить»: восемь пустых слотов подряд читаются как
 * анкета, ради обхода которой и выбран автосбор.
 *
 * Контейнер и типографика — по образцу соседнего блока ProfileTasks
 * (`rounded-xl overflow-hidden` + шапка с бордером), а не общий
 * `rounded-lg shadow-sm p-6` остальных карточек страницы: эти два блока
 * стоят вплотную друг к другу в разметке, и разнобой между ними был бы
 * заметнее, чем несовпадение с более далёкими секциями профиля.
 */
const BusinessCard: React.FC = () => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<BusinessProfile>({});
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<BusinessFieldKey | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/webhook/business-profile');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setProfile(data.profile || {});
        setVisible(Boolean(data.visible));
      } catch {
        // Профиль должен открыться и без карточки — бэкенд-эндпоинт может
        // быть ещё не готов или временно недоступен.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async (key: BusinessFieldKey, value: string) => {
    setError(false);
    const trimmed = value.trim();
    try {
      const res = await apiClient.post('/webhook/business-profile', { fields: { [key]: trimmed } });
      if (!res.ok) throw new Error('save failed');
      const data = await res.json();
      setProfile(data.profile || {});
      // Функциональное обновление, а не голое setEditing(null): пока запрос
      // летел, пользователь мог успеть открыть на редактирование другое
      // поле — закрываем editing только если он всё ещё указывает на то
      // поле, которое мы только что сохранили, иначе украдём фокус у чужой
      // правки, начатой позже.
      setEditing(prev => (prev === key ? null : prev));
    } catch {
      setError(true);
    }
  };

  const closeEditing = (key: BusinessFieldKey) => {
    setEditing(prev => (prev === key ? null : prev));
  };

  if (!loaded || !visible) return null;

  const shown = expanded ? BUSINESS_FIELDS : filledFields(profile);
  const hidden = expanded ? [] : emptyFields(profile);

  // Значение может оказаться кодом вне текущего словаря опций (устаревшие
  // данные, мусор от модели) — тогда переводить нечего: показываем значение
  // как есть, а не сырой ключ вида businessCard.option.tax_mode.старый_код.
  const optionLabel = (key: BusinessFieldKey, value: string, options: string[]) =>
    options.includes(value) ? t(`businessCard.option.${key}.${value}`) : value;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100">
        <div className="text-sm font-medium text-gray-900 inline-flex items-center gap-1.5">
          <Briefcase className="w-4 h-4 text-forest-600" />
          {t('businessCard.title')}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{t('businessCard.subtitle')}</p>
      </div>

      <div className="px-4 py-3">
        {isCardEmpty(profile) && !expanded && (
          <p className="text-sm text-gray-400 text-center py-3">{t('businessCard.empty')}</p>
        )}

        {shown.length > 0 && (
          <dl className="space-y-3">
            {shown.map(f => {
              const field = profile[f.key];
              const isEditing = editing === f.key;
              return (
                <div key={f.key} className="flex flex-col gap-1">
                  <dt className="text-xs uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
                    {t(f.labelKey)}
                    {field?.source === 'assistant' && (
                      <span title={t('businessCard.filledByAssistant')}>
                        <Sparkles className="w-3 h-3 text-indigo-400" aria-label={t('businessCard.filledByAssistant')} />
                      </span>
                    )}
                  </dt>
                  <dd>
                    {isEditing ? (
                      f.options ? (
                        <select
                          autoFocus
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={draft}
                          onChange={e => { setDraft(e.target.value); save(f.key, e.target.value); }}
                          onBlur={() => closeEditing(f.key)}
                        >
                          <option value="">—</option>
                          {f.options.map(o => (
                            <option key={o} value={o}>{t(`businessCard.option.${f.key}.${o}`)}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          autoFocus
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={draft}
                          onChange={e => setDraft(e.target.value)}
                          onBlur={() => save(f.key, draft)}
                          onKeyDown={e => { if (e.key === 'Enter') save(f.key, draft); }}
                        />
                      )
                    ) : (
                      <button
                        type="button"
                        className="text-sm text-gray-900 text-left w-full hover:text-indigo-600"
                        onClick={() => { setEditing(f.key); setDraft(field?.value || ''); }}
                      >
                        {field?.value
                          ? (f.options ? optionLabel(f.key, field.value, f.options) : field.value)
                          : <span className="text-gray-300">—</span>}
                      </button>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}

        {error && <p className="text-sm text-red-500 mt-3">{t('businessCard.saveError')}</p>}

        {hidden.length > 0 && (
          <button
            type="button"
            className="mt-3 text-sm text-indigo-600 hover:text-indigo-700"
            onClick={() => setExpanded(true)}
          >
            {t('businessCard.addMore')}
          </button>
        )}
      </div>
    </div>
  );
};

export default BusinessCard;
