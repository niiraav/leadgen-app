import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRealtimeSocket, ReplyNotification } from "@/lib/socket";

interface ReplyToastContextValue {
  unreadCount: number;
  socketConnected: boolean;
  markRead: (leadId: string) => Promise<void>;
  markHandled: (leadId: string, action?: string) => Promise<void>;
}

const ReplyToastContext = createContext<ReplyToastContextValue>({
  unreadCount: 0,
  socketConnected: true,
  markRead: async () => {},
  markHandled: async () => {},
});

export const useReplyToast = () => useContext(ReplyToastContext);

export function ReplyToastProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const unreadCountRef = useRef(0);
  unreadCountRef.current = unreadCount;

  // Fetch initial unread count (fallback when socket is down)
  useEffect(() => {
    api.replies
      .unreadCount()
      .then((res) => setUnreadCount(res.unreadCount))
      .catch(() => {});
  }, []);

  const onReplyDetected = useCallback((data: ReplyNotification) => {
    setUnreadCount((prev) => prev + 1);
    toast.info(data.title, {
      description: `${data.subtitle || "New reply detected"} · Hot Score ${data.hotScore}`,
      action: {
        label: "View",
        onClick: () => {
          if (typeof window !== "undefined") {
            window.location.href = "/replies";
          }
        },
      },
      duration: 6000,
    });
  }, []);

  const onReplyRead = useCallback(() => {
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const onReplyHandled = useCallback(() => {
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const { connected } = useRealtimeSocket({
    onReply: onReplyDetected,
    onRead: onReplyRead,
    onHandled: onReplyHandled,
  });

  useEffect(() => {
    setSocketConnected(connected);
  }, [connected]);

  const markRead = useCallback(async (leadId: string) => {
    try {
      await api.replies.read(leadId);
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      toast.error('Failed to mark reply as read');
      throw new Error('Failed to mark reply as read');
    }
  }, []);

  const markHandled = useCallback(async (leadId: string, action = "archive") => {
    try {
      await api.replies.handled(leadId, action);
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      toast.error('Failed to update reply status');
      throw new Error('Failed to update reply status');
    }
  }, []);

  return (
    <ReplyToastContext.Provider value={{ unreadCount, socketConnected, markRead, markHandled }}>
      {children}
    </ReplyToastContext.Provider>
  );
}
