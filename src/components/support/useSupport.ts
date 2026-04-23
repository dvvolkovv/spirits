import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';

export type SupportSenderType = 'user' | 'ai' | 'owner' | 'system';
export type SupportStatus = 'ai_handling' | 'escalated' | 'owner_handling' | 'resolved' | 'closed';

export interface SupportMessage {
  id: string;
  senderType: SupportSenderType;
  content: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  status: SupportStatus;
  urgency: string | null;
  topic: string | null;
  createdAt: string;
  lastMessageAt: string | null;
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

export function useSupport() {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [waitingForAi, setWaitingForAi] = useState(false);
  const waitDeadlineRef = useRef<number>(0);

  const fetchTicket = useCallback(async () => {
    try {
      const t = await toJson<SupportTicket>(await apiClient.get('/webhook/support/ticket'));
      setTicket(t);
      return t;
    } catch {
      return null;
    }
  }, []);

  const fetchMessages = useCallback(async (ticketId: string) => {
    try {
      const arr = await toJson<SupportMessage[]>(
        await apiClient.get(`/webhook/support/ticket/${ticketId}/messages`),
      );
      setMessages(Array.isArray(arr) ? arr : []);
      // Clear "waiting for AI" once an AI/owner/system message arrives after user's last
      if (waitingForAi && Array.isArray(arr) && arr.length > 0) {
        const last = arr[arr.length - 1];
        if (last.senderType !== 'user' || Date.now() > waitDeadlineRef.current) {
          setWaitingForAi(false);
        }
      }
    } catch { /* silent */ }
  }, [waitingForAi]);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      const t = await fetchTicket();
      if (t) await fetchMessages(t.id);
      setLoading(false);
    })();
  }, [fetchTicket, fetchMessages]);

  // Polling — faster while waiting for AI
  useEffect(() => {
    if (!ticket) return;
    const interval = waitingForAi ? 2000 : 6000;
    const id = setInterval(() => fetchMessages(ticket.id), interval);
    return () => clearInterval(id);
  }, [ticket, waitingForAi, fetchMessages]);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const r = await toJson<{ ticketId: string }>(
        await apiClient.post('/webhook/support/message', { content: trimmed }),
      );
      if (!ticket) {
        const t = await fetchTicket();
        if (t) await fetchMessages(t.id);
      } else {
        // Optimistic append
        setMessages((xs) => [
          ...xs,
          { id: `local-${Date.now()}`, senderType: 'user', content: trimmed, createdAt: new Date().toISOString() },
        ]);
        waitDeadlineRef.current = Date.now() + 30_000;
        setWaitingForAi(true);
        // Fetch real state soon
        setTimeout(() => fetchMessages(r.ticketId), 1500);
      }
    } finally {
      setSending(false);
    }
  }, [sending, ticket, fetchTicket, fetchMessages]);

  return { ticket, messages, loading, sending, waitingForAi, sendMessage, refetch: () => ticket && fetchMessages(ticket.id) };
}
