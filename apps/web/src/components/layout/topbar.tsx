"use client";

import { User, Search, LogOut, Bell, Moon, Sun, ChevronDown } from "lucide-react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter } from "next/router";
import { useState, useEffect, useRef } from "react";

interface TopBarProps {
  userEmail?: string | null;
}

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/leads": "Leads",
  "/search/google-maps": "Search",
  "/pipeline": "Pipeline",
  "/sequences": "Sequences",
  "/settings": "Settings",
};

export function TopBar({ userEmail }: TopBarProps) {
  const router = useRouter();
  const userInitial = userEmail ? userEmail[0].toUpperCase() : "U";
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

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

  return (
    <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-border/60 bg-surface px-4 md:px-6 flex items-center justify-between shrink-0">
      {/* Left: Page Title (mobile) */}
      <h1 className="text-sm font-semibold text-text md:hidden truncate max-w-[200px]">
        {title}
      </h1>

      {/* Left: Search (desktop only) */}
      <div className="hidden md:flex items-center gap-2">
        <Link href="/search/google-maps" className="flex items-center gap-2 px-3 py-1.5 text-xs text-text-faint bg-surface-2 border border-border rounded-lg hover:text-text transition-colors">
          <Search className="w-3.5 h-3.5" />
          Search
          <kbd className="text-[10px] text-text-faint ml-1">⌘K</kbd>
        </Link>
      </div>

      {/* Right: Actions + Avatar */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="hidden md:flex rounded-full p-2 text-text-muted hover:text-text hover:bg-surface-2 transition-colors active:scale-95"
          title="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Bell */}
        <button className="hidden md:flex rounded-full p-2 text-text-muted hover:text-text hover:bg-surface-2 transition-colors relative active:scale-95" title="Notifications">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-blue rounded-full" />
        </button>

        {/* Avatar dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 hover:bg-surface-2 rounded-full px-2 py-1 transition-colors active:scale-95"
          >
            <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center">
              <span className="text-xs font-semibold text-blue">{userInitial}</span>
            </div>
            <ChevronDown className={`hidden md:block w-3.5 h-3.5 text-text-muted transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-lg border border-border/60 bg-surface shadow-xl py-1 z-50">
              <div className="px-4 py-2 border-b border-border/40">
                <p className="text-sm font-medium text-text truncate">{userEmail}</p>
              </div>
              <Link href="/settings" onClick={() => setDropdownOpen(false)} className="w-full px-4 py-2.5 text-sm text-text hover:bg-surface-2 transition-colors flex items-center gap-2">
                <User className="w-4 h-4" />
                Account
              </Link>
              <button onClick={handleSignOut} className="w-full px-4 py-2.5 text-sm text-red hover:bg-red/5 transition-colors flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
