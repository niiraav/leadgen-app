"use client";

import { useState } from "react";
import { Moon, Sun, Bell, User, Search, ChevronDown, LogOut } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useRouter } from "next/router";

interface TopBarProps {
  userEmail?: string | null;
}

export function TopBar({ userEmail }: TopBarProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "U";

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push("/auth/login");
    } catch (err) {
      router.push("/auth/login");
    }
  };

  return (
    <header className="h-16 border-b border-border/60 bg-surface px-6 flex items-center justify-between">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-4 py-2 text-sm bg-surface-2 border border-border rounded-lg text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20 w-64"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="rounded-full p-2 text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <button className="rounded-full p-2 text-text-muted hover:text-text hover:bg-surface-2 transition-colors relative">
          <Bell className="w-5 h-5" />
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 hover:bg-surface-2 rounded-full px-2 py-1 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-blue">{userInitial}</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border/60 bg-surface shadow-lg py-1 z-50">
              <div className="px-4 py-2 border-b border-border/40">
                <p className="text-sm font-medium text-text truncate">{userEmail}</p>
              </div>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  // Account page — can be wired later
                }}
                className="w-full px-4 py-2 text-sm text-text hover:bg-surface-2 transition-colors flex items-center gap-2"
              >
                <User className="w-4 h-4" />
                Account
              </button>
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2 text-sm text-red hover:bg-red/5 transition-colors flex items-center gap-2"
              >
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
