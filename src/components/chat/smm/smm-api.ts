// src/components/chat/smm/smm-api.ts
import { apiClient } from '../../../services/apiClient';

export interface DialogTurn {
  speaker: 'hero' | 'assistant';
  text: string;
  tStart: number;
  tEnd: number;
}

export interface BrollPrompt {
  atSec: number;
  type: 'ai_image' | 'stock_video';
  prompt: string;
}

export interface CreatorSettings {
  campaignId: string;
  ctaHandle: string;
  ctaLabel: string;
  voiceGender: 'male' | 'female';
  genre: 'dialog' | 'monologue' | 'fact_explanation';
  logoUrl: string | null;
  ctaSlogan: string | null;
  publishCaption: string | null;
}

export interface ScenarioDetail {
  id: string;
  campaignId: string;
  title: string;
  assistantRole: string;
  dialog: DialogTurn[];
  brollPrompts?: BrollPrompt[];
  mood: 'dramatic' | 'inspiring' | 'calm' | 'uplifting' | 'tense' | 'neutral';
  ttsTier: 'economy' | 'premium';
  status: 'pending_review' | 'approved' | 'rejected' | 'regenerating';
  createdAt: string;
  /** Latest rendered video for this scenario (null if not yet approved). */
  videoId?: string | null;
  /** True for admin/Linkeon-official campaign — branding UI hidden. */
  isLinkeonOfficial?: boolean;
  /** Creator-mode branding settings; null in Linkeon-official mode. */
  creatorSettings?: CreatorSettings | null;
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

export async function regenerateVideo(id: string): Promise<{ ok: true; videoId: string; jobId: string }> {
  const r = await apiClient.post(`/webhook/smm/videos/${id}/regenerate`, {});
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.message ?? `regenerateVideo ${id}: ${r.status}`);
  }
  return r.json();
}

// --- Creator branding (logo + slogan + default caption) -------------------

export async function uploadCreatorLogo(
  campaignId: string,
  file: File,
): Promise<{ ok: true; logoUrl: string; settings: CreatorSettings }> {
  const fd = new FormData();
  fd.append('file', file);
  // apiClient.post stringifies JSON — for multipart we use fetch directly.
  // Reuse JWT from localStorage just like apiClient.
  const token = localStorage.getItem('jwt_access_token');
  const r = await fetch(`${import.meta.env.VITE_BACKEND_URL ?? ''}/webhook/smm/campaigns/${campaignId}/logo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error ?? `uploadCreatorLogo: ${r.status}`);
  }
  return r.json();
}

export async function clearCreatorLogo(
  campaignId: string,
): Promise<{ ok: true; settings: CreatorSettings }> {
  const r = await apiClient.post(`/webhook/smm/campaigns/${campaignId}/logo/clear`, {});
  if (!r.ok) throw new Error(`clearCreatorLogo: ${r.status}`);
  return r.json();
}

export async function updateCreatorBranding(
  campaignId: string,
  body: { ctaSlogan?: string | null; publishCaption?: string | null },
): Promise<{ ok: true; settings: CreatorSettings }> {
  const r = await apiClient.patch(`/webhook/smm/campaigns/${campaignId}/branding`, body);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.message ?? `updateCreatorBranding: ${r.status}`);
  }
  return r.json();
}
