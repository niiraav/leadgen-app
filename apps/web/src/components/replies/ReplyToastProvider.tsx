import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRealtimeSocket, ReplyNotification } from "@/lib/socket";

interface ReplyToastContextValue {
  unreadCount: number;
  markRead: (leadId: string) => Promise<void>;
  markHandled: (leadId: string) => Promise<void>;
}

const ReplyToastContext = createContext<ReplyToastContextValue>({
  unreadCount: 0,
  markRead: async () => {},
  markHandled: async () => {},
});

export const useReplyToast = () => useContext(ReplyToastContext);

export function ReplyToastProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadCountRef = useRef(0);
  unreadCountRef.current = unreadCount;

  // Fetch initial unread count
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

  useRealtimeSocket({
    onReply: onReplyDetected,
    onRead: onReplyRead,
    onHandled: onReplyHandled,
  });

  const markRead = useCallback(async (leadId: string) => {
    try {
      await api.replies.read(leadId);
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // swallow
    }
  }, []);

  const markHandled = useCallback(async (leadId: string) => {
    try {
      await api.replies.handled(leadId, "archive");
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // swallow
    }
  }, []);

  return (
    <ReplyToastContext.Provider value={{ unreadCount, markRead, markHandled }}>
      {children}
    </ReplyToastContext.Provider>
  );
}
