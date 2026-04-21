// src/components/video/useVideoJobs.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { apiClient } from '../../services/apiClient';

export interface VideoJob {
  id: string;
  mode: string;
  model: string;
  quality: string;
  duration_sec: number;
  prompt: string | null;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  tokens_spent: number;
  created_at: string;
}

const FAST_INTERVAL = 5000;
const SLOW_INTERVAL = 60000;

export function useVideoJobs() {
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevStatusRef = useRef<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    try {
      const resp = await apiClient.get('/webhook/video/jobs?limit=100');
      const parsed = await resp.json();
      const list: VideoJob[] = (parsed as any)?.data?.jobs ?? (parsed as any)?.jobs ?? [];
      // Detect transitions from non-ready → ready and notify.
      for (const j of list) {
        const prev = prevStatusRef.current[j.id];
        if (prev && prev !== 'ready' && j.status === 'ready') {
          // Project has no toast library — log for now. VideoGallery will surface status visually.
          console.log('[video] ready:', j.id, j.video_url);
        }
        prevStatusRef.current[j.id] = j.status;
      }
      setJobs(list);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'pending' || j.status === 'processing');
    const interval = hasActive ? FAST_INTERVAL : SLOW_INTERVAL;
    const id = setInterval(fetchAll, interval);
    return () => clearInterval(id);
  }, [jobs, fetchAll]);

  const createJob = useCallback(async (body: Record<string, any>) => {
    const resp = await apiClient.post('/webhook/video/jobs', body);
    const parsed = await resp.json();
    await fetchAll();
    return (parsed as any)?.data ?? parsed;
  }, [fetchAll]);

  const deleteJob = useCallback(async (id: string) => {
    await apiClient.delete(`/webhook/video/jobs/${id}`);
    await fetchAll();
  }, [fetchAll]);

  return { jobs, loading, error, createJob, deleteJob, refetch: fetchAll };
}
