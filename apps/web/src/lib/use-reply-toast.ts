"use client";
import { useEffect } from "react";
import { useRealtimeSocket } from "@/lib/socket";

export function useReplyToast(showToast: (title: string, subtitle?: string, href?: string) => void) {
  useRealtimeSocket((data) => {
    showToast(data.title, data.subtitle, data.ctaHref);
  });
}
