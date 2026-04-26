"use client";

import { User, Search, LogOut, Bell, Moon, Sun, ChevronDown, CheckCheck } from "lucide-react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useRouter } from "next/router";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TopBarProps {
  userEmail?: string | null;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  lead_id: string | null;
  read: boolean;
  created_at: string;
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/leads": "Leads",
  "/search/google-maps": "Search",
  "/pipeline": "Pipeline",
  "/sequences": "Sequences",
  "/settings": "Settings",
};

const dropdownVariants = {
  hidden: { opacity: 0, y: -4, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
};

const bellShake = {
  x: [0, -3, 3, -2, 2, -1, 1, 0],
  transition: { duration: 0.5 },
};

export function TopBar({ userEmail }: TopBarProps) {
  const router = useRouter();
  const userInitial = userEmail ? userEmail[0].toUpperCase() : "U";
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [bellKey, setBellKey] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);
  }, []);

  // Poll notifications every 30s
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.notifications.list();
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // Silently ignore — may not be authenticated
    }
  }, []);

  useEffect(() => {
    if (!userEmail) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [userEmail, fetchNotifications]);

  // Trigger bell shake only when unread count increases FROM 0
  const prevUnreadRef = useRef(0);
  useEffect(() => {
    if (unreadCount > 0 && prevUnreadRef.current === 0) {
      setBellKey((k) => k + 1);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, notifOpen]);

  const title = PAGE_TITLES[router.pathname] || router.pathname.split("/").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "";

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setIsDark((d) => !d);
  };

  const handleSignOut = async () => {
    setDropdownOpen(false);
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const handleMarkRead = async (id: string) => {
    try {
      await api.notifications.markRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleNotifClick = (notif: Notification) => {
    if (!notif.read) handleMarkRead(notif.id);
    setNotifOpen(false);
    if (notif.lead_id) router.push(`/leads/${notif.lead_id}`);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-border bg-card px-4 md:px-6 flex items-center justify-between shrink-0">
      {/* Left: Page Title (mobile) */}
      <h1 className="text-sm font-semibold text-foreground md:hidden truncate max-w-[12.5rem]">
        {title}
      </h1>

      {/* Left: Search (desktop only) */}
      <div className="hidden md:flex items-center gap-2">
        <Link
          href="/search/google-maps"
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-secondary border border-border rounded-lg hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Search className="w-3.5 h-3.5" />
          Search
          <kbd className="text-micro text-muted-foreground ml-1">⌘K</kbd>
        </Link>
      </div>

      {/* Right: Actions + Avatar */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="hidden md:flex rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          title="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Bell + Notification Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setNotifOpen(!notifOpen);
              if (!notifOpen) fetchNotifications();
            }}
            className="hidden md:flex rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors relative focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title="Notifications"
            aria-expanded={notifOpen}
            aria-haspopup="menu"
          >
            <motion.div key={bellKey} animate={unreadCount > 0 ? bellShake : {}}>
              <Bell className="w-4 h-4" />
            </motion.div>
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-primary rounded-full text-micro font-bold text-primary-foreground flex items-center justify-center px-1">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 top-full mt-2 w-80 max-h-96 rounded-lg border border-border bg-card shadow-md z-50 flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-sm font-semibold text-foreground">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-micro-sm text-primary hover:underline flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={`w-full text-left px-4 py-3 border-b border-border hover:bg-secondary/60 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${!n.read ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          {!n.read && <span className="mt-1.5 w-2 h-2 bg-primary rounded-full shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${!n.read ? "font-medium text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                            {n.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>}
                            <p className="text-micro text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Avatar dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 hover:bg-secondary rounded-full px-2 py-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={userEmail ? `User menu for ${userEmail}` : "User menu"}
            aria-expanded={dropdownOpen}
            aria-haspopup="menu"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">{userInitial}</span>
            </div>
            <ChevronDown className={`hidden md:block w-3.5 h-3.5 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                variants={dropdownVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-border bg-card shadow-md py-1 z-50"
              >
                <div className="px-4 py-2 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate">{userEmail}</p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="w-full px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <User className="w-4 h-4" />
                  Account
                </Link>
                <button
                  onClick={handleSignOut}
                  className="w-full px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
