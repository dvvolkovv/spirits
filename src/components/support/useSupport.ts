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
  messages: SupportMessage[];
}

const ACTIVE_STATUSES: SupportStatus[] = ['ai_handling', 'escalated', 'owner_handling'];

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
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [waitingForAi, setWaitingForAi] = useState(false);
  const [composingNew, setComposingNew] = useState(false);
  const waitDeadlineRef = useRef<number>(0);
  const lastMessageCountRef = useRef<number>(0);

  const fetchTickets = useCallback(async () => {
    try {
      const arr = await toJson<SupportTicket[]>(
        await apiClient.get('/webhook/support/tickets?limit=10'),
      );
      const list = Array.isArray(arr) ? arr : [];
      setTickets(list);
      const total = list.reduce((sum, t) => sum + t.messages.length, 0);
      // Clear "waiting for AI" when a non-user message arrives or deadline hit
      if (waitingForAi && total > lastMessageCountRef.current) {
        const last = list[list.length - 1];
        const lastMsg = last?.messages?.[last.messages.length - 1];
        if (lastMsg && (lastMsg.senderType !== 'user' || Date.now() > waitDeadlineRef.current)) {
          setWaitingForAi(false);
        }
      }
      lastMessageCountRef.current = total;
    } catch { /* silent */ }
  }, [waitingForAi]);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchTickets();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Polling
  useEffect(() => {
    const interval = waitingForAi ? 2000 : 6000;
    const id = setInterval(fetchTickets, interval);
    return () => clearInterval(id);
  }, [waitingForAi, fetchTickets]);

  // Latest ticket = last in list (chronologically newest)
  const latestTicket: SupportTicket | null = tickets.length > 0 ? tickets[tickets.length - 1] : null;
  const isLatestActive = latestTicket ? ACTIVE_STATUSES.includes(latestTicket.status) : false;

  // Reset composing flag once a new active ticket appears
  useEffect(() => {
    if (isLatestActive) setComposingNew(false);
  }, [latestTicket?.id, isLatestActive]);

  const startNewTicket = useCallback(() => setComposingNew(true), []);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      // Optimistic append: if latest is active, push to its messages array
      if (latestTicket && isLatestActive) {
        const optimistic: SupportMessage = {
          id: `local-${Date.now()}`,
          senderType: 'user',
          content: trimmed,
          createdAt: new Date().toISOString(),
        };
        setTickets((xs) => xs.map((t) =>
          t.id === latestTicket.id ? { ...t, messages: [...t.messages, optimistic] } : t,
        ));
      }
      await toJson<{ ticketId: string }>(
        await apiClient.post('/webhook/support/message', { content: trimmed }),
      );
      waitDeadlineRef.current = Date.now() + 30_000;
      setWaitingForAi(true);
      // Refetch to get authoritative state (and any new ticket created server-side)
      setTimeout(() => fetchTickets(), 1000);
    } finally {
      setSending(false);
    }
  }, [sending, latestTicket, isLatestActive, fetchTickets]);

  return {
    tickets,
    latestTicket,
    isLatestActive,
    composingNew,
    startNewTicket,
    loading,
    sending,
    waitingForAi,
    sendMessage,
  };
}
