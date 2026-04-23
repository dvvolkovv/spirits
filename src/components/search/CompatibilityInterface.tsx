import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../contexts/AuthContext';
import { Heart, X, Plus, Users, Info } from 'lucide-react';
import { apiClient } from '../../services/apiClient';

const CompatibilityInterface: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [currentPhoneInput, setCurrentPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isContactPickerSupported, setIsContactPickerSupported] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const autoRunRef = useRef(false);

  useEffect(() => {
    if ('contacts' in navigator && 'ContactsManager' in window) {
      setIsContactPickerSupported(true);
    }
  }, []);

  // Preload target from query (?user=<phone>) and auto-run analysis once.
  useEffect(() => {
    const incoming = params.get('user');
    if (!incoming || autoRunRef.current) return;
    const normalized = incoming.replace(/\D/g, '');
    if (!normalized) return;
    autoRunRef.current = true;
    setPhoneNumbers((list) => (list.includes(normalized) ? list : [...list, normalized]));
    const p = new URLSearchParams(params);
    p.delete('user');
    setParams(p, { replace: true });
  }, [params, setParams]);

  // Kick off analysis when a preloaded phone arrives.
  useEffect(() => {
    if (autoRunRef.current && phoneNumbers.length > 0 && !isSearching && !analysisResult) {
      handleAnalyzeCompatibility();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneNumbers]);

  const normalizePhoneNumber = (phone: string): string => {
    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('8') && cleaned.length === 11) {
      cleaned = '7' + cleaned.slice(1);
    }

    if (cleaned.startsWith('7') && cleaned.length === 11) {
      return cleaned;
    }

    if (cleaned.length === 10) {
      return '7' + cleaned;
    }

    return cleaned;
  };

  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '');

    if (cleaned.length === 0) return '';

    let formatted = '+';

    if (cleaned.length <= 1) {
      formatted += cleaned;
    } else if (cleaned.length <= 4) {
      formatted += `${cleaned[0]} (${cleaned.slice(1)}`;
    } else if (cleaned.length <= 7) {
      formatted += `${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4)}`;
    } else if (cleaned.length <= 9) {
      formatted += `${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    } else {
      formatted += `${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`;
    }

    return formatted;
  };

  const validatePhoneNumber = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 11;
  };

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCurrentPhoneInput(formatPhoneNumber(value));
    setPhoneError('');
  };

  const addPhoneNumber = () => {
    if (!currentPhoneInput.trim()) return;

    if (!validatePhoneNumber(currentPhoneInput)) {
      setPhoneError(t('compatibility.error_invalid_11'));
      return;
    }

    if (phoneNumbers.includes(currentPhoneInput)) {
      setPhoneError(t('compatibility.error_already_added'));
      return;
    }

    setPhoneNumbers([...phoneNumbers, currentPhoneInput]);
    setCurrentPhoneInput('');
    setPhoneError('');
  };

  const removePhoneNumber = (index: number) => {
    setPhoneNumbers(phoneNumbers.filter((_, i) => i !== index));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPhoneNumber();
    }
  };

  const handleSelectFromContacts = async () => {
    if (!isContactPickerSupported) {
      setPhoneError(t('compatibility.error_picker_unsupported'));
      return;
    }

    try {
      setIsLoadingContacts(true);
      setPhoneError('');

      const contacts = await (navigator as any).contacts.select(['tel'], { multiple: true });

      if (!contacts || contacts.length === 0) {
        setPhoneError(t('compatibility.error_contacts_empty'));
        return;
      }

      const newPhoneNumbers: string[] = [];
      const duplicates: string[] = [];

      for (const contact of contacts) {
        if (contact.tel && contact.tel.length > 0) {
          for (const tel of contact.tel) {
            const normalized = normalizePhoneNumber(tel);

            if (normalized.length === 11) {
              const formatted = formatPhoneNumber(normalized);

              if (!phoneNumbers.includes(formatted) && !newPhoneNumbers.includes(formatted)) {
                newPhoneNumbers.push(formatted);
              } else {
                duplicates.push(formatted);
              }
            }
          }
        }
      }

      if (newPhoneNumbers.length > 0) {
        setPhoneNumbers([...phoneNumbers, ...newPhoneNumbers]);

        if (duplicates.length > 0) {
          setPhoneError(t('compatibility.error_added_with_duplicates', { added: newPhoneNumbers.length, duplicates: duplicates.length }));
        }
      } else {
        setPhoneError(t('compatibility.error_no_valid_phones'));
      }

    } catch (error: any) {
      console.error('Error selecting contacts:', error);

      if (error.name === 'AbortError') {
        setPhoneError(t('compatibility.error_picker_cancelled'));
      } else {
        setPhoneError(t('compatibility.error_picker_generic'));
      }
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleAnalyzeCompatibility = async () => {
    if (phoneNumbers.length === 0) return;

    setIsSearching(true);
    setAnalysisResult('');

    const phoneIds = phoneNumbers.map(phone => phone.replace(/\D/g, ''));

    try {
      const response = await apiClient.post('/webhook/analyze-compatibility', {
        users: phoneIds
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              if (data.type === 'item' && data.content) {
                accumulatedText += data.content;
                setAnalysisResult(accumulatedText);
              }
            } catch (e) { /* ignore */ }
          }
          break;
        }

        buffer += new TextDecoder().decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'item' && data.content) {
              accumulatedText += data.content;
              setAnalysisResult(accumulatedText);
            }
          } catch (e) {
            // Incomplete JSON — will be completed in next chunk
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

    } catch (error) {
      console.error('Error during compatibility analysis:', error);
      setAnalysisResult(t('compatibility.error_analysis'));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div data-testid="compatibility-root" className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <div className="bg-white shadow-sm px-4 py-4 border-b flex-shrink-0">
        <div className="flex items-center space-x-3">
          <Heart className="w-6 h-6 text-red-500" />
          <h1 className="text-xl font-bold text-gray-900">{t('compatibility.title')}</h1>
        </div>
        <p className="text-sm text-gray-600 mt-2">
          {t('compatibility.subtitle')}
        </p>
      </div>

      <div className="flex-1 p-4 pb-20 md:pb-4 space-y-6 overflow-y-auto">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {t('compatibility.add_phones')}
          </h2>
          <p className="text-xs text-gray-500 mb-4 bg-blue-50 rounded-lg px-3 py-2">
            {t('compatibility.add_phones_hint')}
          </p>

          {isContactPickerSupported && (
            <div className="mb-4">
              <button
                onClick={handleSelectFromContacts}
                disabled={isLoadingContacts}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center space-x-2"
              >
                {isLoadingContacts ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>{t('compatibility.picker_open')}</span>
                  </>
                ) : (
                  <>
                    <Users className="w-5 h-5" />
                    <span>{t('compatibility.pick_from_contacts')}</span>
                  </>
                )}
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex space-x-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={currentPhoneInput}
                  onChange={handlePhoneInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder="+7 (900) 123-45-67"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-all"
                  maxLength={18}
                  data-testid="compatibility-phone-input"
                />
                {phoneError && (
                  <p className="text-red-600 text-sm mt-1">{phoneError}</p>
                )}
              </div>
              <button
                onClick={addPhoneNumber}
                className="px-4 py-3 bg-forest-600 text-white rounded-lg hover:bg-forest-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">{t('compatibility.add')}</span>
              </button>
            </div>

            {phoneNumbers.length > 0 && (
              <div className="space-y-2 mt-4">
                <h3 className="text-sm font-medium text-gray-700">{t('compatibility.added_numbers')}</h3>
                {phoneNumbers.map((phone, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg"
                  >
                    <span className="text-gray-700">{phone}</span>
                    <button
                      onClick={() => removePhoneNumber(index)}
                      className="text-red-600 hover:text-red-800 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleAnalyzeCompatibility}
              disabled={phoneNumbers.length === 0 || isSearching}
              data-testid="compatibility-submit-btn"
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center space-x-2"
            >
              {isSearching ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t('compatibility.analyzing')}</span>
                </>
              ) : (
                <>
                  <Heart className="w-5 h-5" />
                  <span>{t('compatibility.analyze')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {analysisResult && (
          <div data-testid="compatibility-result" className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t('compatibility.result')}
            </h2>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{analysisResult}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompatibilityInterface;
