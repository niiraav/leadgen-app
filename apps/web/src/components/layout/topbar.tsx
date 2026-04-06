"use client";

import { User, Search, LogOut } from "lucide-react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter } from "next/router";

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

export function TopBar({ userEmail, pageTitle }: TopBarProps) {
  const router = useRouter();
  const userInitial = userEmail ? userEmail[0].toUpperCase() : "U";

  // Derive page title from route
  const title = PAGE_TITLES[router.pathname] || router.pathname.split("/").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "";

  const handleSignOut = async () => {
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

      {/* Right: Avatar */}
      <div className="flex items-center gap-3">
        <button onClick={handleSignOut} className="rounded-full p-0.5 text-text-muted hover:text-text hover:bg-surface-2 transition-colors active:scale-95">
          <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-blue">{userInitial}</span>
          </div>
        </button>
      </div>
    </header>
  );
}
