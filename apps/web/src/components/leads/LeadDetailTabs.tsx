"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, Clock, MessageSquare, NotebookPen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LeadDetailTabsProps {
  emailTab: React.ReactNode;
  activityTab: React.ReactNode;
  repliesTab: React.ReactNode;
  notesTab: React.ReactNode;
  activityCount?: number;
  repliesCount?: number;
  defaultTab?: "email" | "activity" | "replies" | "notes";
}

const tabsConfig = [
  { id: "email" as const, label: "Email", icon: Sparkles },
  { id: "activity" as const, label: "Activity", icon: Clock },
  { id: "replies" as const, label: "Replies", icon: MessageSquare },
  { id: "notes" as const, label: "Notes", icon: NotebookPen },
];

export function LeadDetailTabs({
  emailTab,
  activityTab,
  repliesTab,
  notesTab,
  activityCount = 0,
  repliesCount = 0,
  defaultTab = "email",
}: LeadDetailTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const listRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  // Measure active tab position for sliding underline
  const measureActive = useCallback(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('[data-state="active"]') as HTMLElement | null;
    if (!active) return;
    const listRect = listRef.current.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    setUnderline({
      left: activeRect.left - listRect.left + listRef.current.scrollLeft,
      width: activeRect.width,
    });
  }, []);

  useEffect(() => {
    measureActive();
  }, [activeTab, measureActive]);

  useEffect(() => {
    if (!listRef.current) return;
    const ro = new ResizeObserver(measureActive);
    ro.observe(listRef.current);
    window.addEventListener("resize", measureActive);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureActive);
    };
  }, [measureActive]);

  const counts: Record<string, number> = {
    activity: activityCount,
    replies: repliesCount,
  };

  const panels: Record<string, React.ReactNode> = {
    email: emailTab,
    activity: activityTab,
    replies: repliesTab,
    notes: notesTab,
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
      <TabsList
        ref={listRef}
        className="relative w-full justify-start rounded-none bg-transparent p-0 px-4 pt-3 pb-1 border-b border-border/40 h-auto gap-1"
      >
        {tabsConfig.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.id];
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="relative inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-text-muted bg-transparent border border-transparent shadow-none transition-colors duration-200 data-[state=active]:text-text data-[state=active]:bg-transparent data-[state=active]:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:text-text"
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {count > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-surface-2 text-[10px] font-semibold text-text-muted border border-border/40">
                  {count}
                </span>
              )}
            </TabsTrigger>
          );
        })}
        {/* Sliding underline */}
        <motion.div
          className="absolute bottom-[-1px] h-[2px] bg-primary rounded-full pointer-events-none z-10"
          initial={false}
          animate={{ left: underline.left, width: underline.width }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          style={{ left: underline.left, width: underline.width }}
        />
      </TabsList>

      <div className="px-4 pt-4 pb-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {panels[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>
    </Tabs>
  );
}
