"use client";
import { useEffect } from "react";
import { useRealtimeSocket } from "./socket";

export function useReplyToast(showToast: (title: string, subtitle?: string, href?: string) => void) {
  useRealtimeSocket({
    onReply: (data) => {
      showToast(data.title, data.subtitle, data.ctaHref);
    },
  });
}
