import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '../../services/apiClient';

// «Видео голосом оригинала» (96cba3f7): состояние клона голоса пользователя.
// Бэкенд: POST /webhook/voice-avatar/sample (multipart file+consent), GET
// /webhook/voice-avatar/status, DELETE /webhook/voice-avatar.

export interface VoiceDescriptor {
  gender?: string;
  approx_age_range?: string;
  pitch_register?: string;
  pace?: string;
  timbre?: string | string[];
  accent_or_language?: string;
  veo_voice_prompt?: string;
}

export type VoiceState = 'none' | 'pending' | 'ready' | 'failed';

export function useVoiceProfile() {
  const [status, setStatus] = useState<VoiceState>('none');
  const [hasVoice, setHasVoice] = useState(false);
  const [descriptor, setDescriptor] = useState<VoiceDescriptor | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | undefined>(undefined);

  const refetch = useCallback(async (): Promise<VoiceState> => {
    try {
      const r = await apiClient.get('/webhook/voice-avatar/status');
      const d = await r.json();
      const st: VoiceState = d?.status ?? 'none';
      setStatus(st);
      setHasVoice(!!d?.hasVoice);
      setDescriptor(d?.descriptor);
      setError(d?.error ?? null);
      return st;
    } catch (e: any) {
      setError(e?.message ?? 'status failed');
      return 'none';
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  // Пока идёт профилирование/клонирование — поллим каждые 5с.
  useEffect(() => {
    if (status === 'pending') {
      pollRef.current = window.setInterval(refetch, 5000);
      return () => window.clearInterval(pollRef.current);
    }
    return undefined;
  }, [status, refetch]);

  const uploadSample = useCallback(async (file: File, consent: boolean) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('consent', consent ? 'true' : 'false');
    const r = await apiClient.post('/webhook/voice-avatar/sample', fd);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error ?? d?.message ?? 'upload failed');
    await refetch();
  }, [refetch]);

  const deleteVoice = useCallback(async () => {
    await apiClient.delete('/webhook/voice-avatar');
    await refetch();
  }, [refetch]);

  return { status, hasVoice, descriptor, error, loading, uploadSample, deleteVoice, refetch };
}
