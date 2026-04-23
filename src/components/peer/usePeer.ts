import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';

export interface ChatRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  introMessage: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  createdAt: string;
  respondedAt: string | null;
  peerUserId: string;
  peerName: string;
  peerAvatar: string | null;
}

export interface PeerConversation {
  id: string;
  peerUserId: string;
  peerName: string;
  peerAvatar: string | null;
  lastMessage: {
    content: string;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
  createdAt: string;
  lastMessageAt: string | null;
}

export interface PeerMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

export interface UnreadSummary {
  incomingRequests: number;
  unreadMessages: number;
}

export interface PeerState {
  conversationId: string | null;
  pendingRequest: {
    id: string;
    direction: 'outgoing' | 'incoming';
    introMessage: string;
    createdAt: string;
  } | null;
}

async function toJson<T = any>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let errText = '';
    try { errText = await resp.text(); } catch {}
    const e: any = new Error(errText || `HTTP ${resp.status}`);
    e.status = resp.status;
    try { e.body = JSON.parse(errText); } catch {}
    throw e;
  }
  return resp.json();
}

/** Polls requests + chats every 5s while mounted. */
export function usePeerInbox() {
  const [incoming, setIncoming] = useState<ChatRequest[]>([]);
  const [outgoing, setOutgoing] = useState<ChatRequest[]>([]);
  const [conversations, setConversations] = useState<PeerConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const [rIn, rOut, rConv] = await Promise.all([
        apiClient.get('/webhook/peer/requests/incoming').then(toJson),
        apiClient.get('/webhook/peer/requests/outgoing').then(toJson),
        apiClient.get('/webhook/peer/conversations').then(toJson),
      ]);
      setIncoming(Array.isArray(rIn) ? rIn : []);
      setOutgoing(Array.isArray(rOut) ? rOut : []);
      setConversations(Array.isArray(rConv) ? rConv : []);
    } catch {
      // silent — keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 5000);
    return () => clearInterval(id);
  }, [refetch]);

  const accept = useCallback(async (requestId: string): Promise<string | null> => {
    try {
      const r = await toJson<{ conversationId: string }>(
        await apiClient.post(`/webhook/peer/request/${requestId}/accept`),
      );
      await refetch();
      return r.conversationId ?? null;
    } catch {
      await refetch();
      return null;
    }
  }, [refetch]);

  const decline = useCallback(async (requestId: string) => {
    try { await apiClient.post(`/webhook/peer/request/${requestId}/decline`); } catch {}
    await refetch();
  }, [refetch]);

  const withdraw = useCallback(async (requestId: string) => {
    try { await apiClient.post(`/webhook/peer/request/${requestId}/withdraw`); } catch {}
    await refetch();
  }, [refetch]);

  return { incoming, outgoing, conversations, loading, refetch, accept, decline, withdraw };
}

/** Unread summary for nav badge. */
export function useUnreadSummary() {
  const [summary, setSummary] = useState<UnreadSummary>({ incomingRequests: 0, unreadMessages: 0 });

  const refetch = useCallback(async () => {
    try {
      const r = await toJson<UnreadSummary>(
        await apiClient.get('/webhook/peer/unread-summary'),
      );
      setSummary(r);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, 10_000);
    return () => clearInterval(id);
  }, [refetch]);

  return summary;
}

/** Polls messages for a specific conversation every 5s. */
export function usePeerConversation(conversationId: string | null) {
  const [conv, setConv] = useState<{ id: string; peerUserId: string; peerName: string; peerAvatar: string | null; createdAt: string; lastMessageAt: string | null } | null>(null);
  const [messages, setMessages] = useState<PeerMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const lastSeenRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    if (!conversationId) return;
    try {
      const [m, c] = await Promise.all([
        apiClient.get(`/webhook/peer/conversations/${conversationId}/messages?limit=100`).then(toJson),
        apiClient.get(`/webhook/peer/conversations/${conversationId}`).then(toJson),
      ]);
      setMessages(Array.isArray(m) ? m : []);
      setConv(c);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    refetch();
    const id = setInterval(refetch, 5000);
    return () => clearInterval(id);
  }, [conversationId, refetch]);

  const sendMessage = useCallback(async (content: string) => {
    if (!conversationId) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    const resp = await apiClient.post(
      `/webhook/peer/conversations/${conversationId}/message`,
      { content: trimmed },
    );
    const msg = await toJson<PeerMessage>(resp);
    setMessages((xs) => [...xs, msg]);
  }, [conversationId]);

  const markRead = useCallback(async () => {
    if (!conversationId) return;
    const unread = messages.find((m) => !m.readAt && m.senderId !== lastSeenRef.current);
    if (!unread) return;
    try { await apiClient.post(`/webhook/peer/conversations/${conversationId}/read`); } catch {}
  }, [conversationId, messages]);

  return { conv, messages, loading, refetch, sendMessage, markRead };
}

/** Relationship state with a target user (used in profile modal). */
export async function fetchPeerState(userId: string): Promise<PeerState | null> {
  try {
    const resp = await apiClient.get(`/webhook/peer/state/${encodeURIComponent(userId)}`);
    return toJson<PeerState>(resp);
  } catch { return null; }
}

export async function sendPeerRequest(
  toUserId: string,
  introMessage: string,
): Promise<{ id: string; status: string; conversationId?: string }> {
  const resp = await apiClient.post('/webhook/peer/request', { toUserId, introMessage });
  return toJson(resp);
}

export async function blockUser(userId: string): Promise<void> {
  try { await apiClient.post(`/webhook/peer/block/${encodeURIComponent(userId)}`); } catch {}
}

export async function unblockUser(userId: string): Promise<void> {
  try { await apiClient.delete(`/webhook/peer/block/${encodeURIComponent(userId)}`); } catch {}
}

export async function reportUser(
  targetUserId: string,
  reason: string,
  context?: { contextType?: 'request' | 'message' | 'profile'; contextId?: string },
): Promise<void> {
  try {
    await apiClient.post('/webhook/peer/report', {
      targetUserId, reason,
      contextType: context?.contextType, contextId: context?.contextId,
    });
  } catch {}
}
