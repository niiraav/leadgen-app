/**
 * Socket.io client for Findr.
 * Exports both a React hook (useRealtimeSocket) and imperative helpers
 * (connectSocket / disconnectSocket) for use outside components.
 */
import { useEffect, useRef, useState } from 'react';
// @ts-ignore — @types/socket.io-client conflicts with v4 built-in types
import { io } from 'socket.io-client';
import { createBrowserSupabaseClient } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ReplyNotification {
  type: 'reply_detected';
  title: string;
  subtitle?: string;
  hotScore: number;
  replyEventId: string;
  intent: string;
  cta?: string;
  ctaHref?: string;
}

type Socket = ReturnType<typeof io>;

let socketInstance: Socket | null = null;

function getSocket(token: string): Socket {
  if (socketInstance?.connected) return socketInstance;
  socketInstance = io(API_URL, { auth: { token } });
  return socketInstance;
}

// ─── React hook ─────────────────────────────────────────────────────────────

export function useRealtimeSocket(opts: {
  onReply?: (data: ReplyNotification) => void;
  onRead?: () => void;
  onHandled?: () => void;
} = {}) {
  const [connected, setConnected] = useState(false);
  const callbackRef = useRef(opts);
  callbackRef.current = opts;

  useEffect(() => {
    let cleanup = false;
    const supabase = createBrowserSupabaseClient();

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (cleanup || !session?.access_token) return;
      const token = session.access_token;
      const socket = getSocket(token);

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('reply:detected', (data: ReplyNotification) => {
        callbackRef.current.onReply?.(data);
      });
      socket.on('reply:read', () => {
        callbackRef.current.onRead?.();
      });
      socket.on('reply:handled', () => {
        callbackRef.current.onHandled?.();
      });

      return () => {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('reply:detected');
        socket.off('reply:read');
        socket.off('reply:handled');
      };
    });

    return () => {
      cleanup = true;
    };
  }, []);

  return { connected };
}

// ─── Imperative helpers ──────────────────────────────────────────────────────

/** Connect socket imperatively (useful in non-React contexts). */
export async function connectSocket(onReplyDetected: (payload: any) => void) {
  const supabase = createBrowserSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }

  socketInstance = io(API_URL, { auth: { token } });

  socketInstance.on('reply:detected', onReplyDetected);
  return socketInstance;
}

/** Disconnect and null out the socket instance. */
export function disconnectSocket() {
  socketInstance?.disconnect();
  socketInstance = null;
}
