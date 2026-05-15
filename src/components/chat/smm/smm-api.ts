// src/components/chat/smm/smm-api.ts
import { apiClient } from '../../../services/apiClient';

export interface DialogTurn {
  speaker: 'hero' | 'assistant';
  text: string;
  tStart: number;
  tEnd: number;
}

export interface ScenarioDetail {
  id: string;
  campaignId: string;
  title: string;
  assistantRole: string;
  dialog: DialogTurn[];
  mood: 'dramatic' | 'inspiring' | 'calm' | 'uplifting' | 'tense' | 'neutral';
  ttsTier: 'economy' | 'premium';
  status: 'pending_review' | 'approved' | 'rejected' | 'regenerating';
  createdAt: string;
}

export interface VideoDetail {
  id: string;
  scenarioId: string;
  status: 'queued' | 'rendering' | 'ready' | 'failed' | 'approved' | 'rejected';
  mp4Url: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  errorMessage: string | null;
  tokensCharged: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApproveScenariosResult {
  approved: Array<{ scenarioId: string; videoId: string; jobId: string }>;
  failed: Array<{ scenarioId: string; reason: string; detail?: string }>;
}

// apiClient returns Promise<Response> (Variant A): r.ok / r.status / r.json()

export async function getScenario(id: string): Promise<ScenarioDetail> {
  const r = await apiClient.get(`/webhook/smm/scenarios/${id}`);
  if (!r.ok) throw new Error(`getScenario ${id}: ${r.status}`);
  return r.json();
}

export async function approveScenario(id: string): Promise<ApproveScenariosResult> {
  const r = await apiClient.post(`/webhook/smm/scenarios/${id}/approve`, undefined);
  if (!r.ok) throw new Error(`approveScenario ${id}: ${r.status}`);
  return r.json();
}

export async function regenerateScenario(id: string, feedback: string): Promise<{ ok: true }> {
  const r = await apiClient.post(`/webhook/smm/scenarios/${id}/regenerate`, { feedback });
  if (!r.ok) throw new Error(`regenerateScenario ${id}: ${r.status}`);
  return r.json();
}

export async function rejectScenario(id: string): Promise<{ ok: true }> {
  const r = await apiClient.delete(`/webhook/smm/scenarios/${id}`);
  if (!r.ok) throw new Error(`rejectScenario ${id}: ${r.status}`);
  return r.json();
}

export async function getVideo(id: string): Promise<VideoDetail> {
  const r = await apiClient.get(`/webhook/smm/videos/${id}`);
  if (!r.ok) throw new Error(`getVideo ${id}: ${r.status}`);
  return r.json();
}

export async function approveVideo(id: string): Promise<{ ok: true }> {
  const r = await apiClient.post(`/webhook/smm/videos/${id}/approve`, undefined);
  if (!r.ok) throw new Error(`approveVideo ${id}: ${r.status}`);
  return r.json();
}

export async function rejectVideo(id: string, reason?: string): Promise<{ ok: true }> {
  const r = await apiClient.post(`/webhook/smm/videos/${id}/reject`, { reason });
  if (!r.ok) throw new Error(`rejectVideo ${id}: ${r.status}`);
  return r.json();
}
