"use client";

import { useUIStore } from "@/stores/ui";
import { Moon, Sun, Bell, User } from "lucide-react";

export function TopBar() {
  const { theme, toggleTheme } = useUIStore();

  return (
    <header className="sticky top-0 z-30 h-16 bg-surface/80 backdrop-blur-lg border-b border-border/60 flex items-center justify-between px-6">
      <div className="flex items-center gap-3" />
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-full p-2 text-text-muted hover:text-text hover:bg-surface-2 transition-all"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-[18px] h-[18px]" />
          ) : (
            <Moon className="w-[18px] h-[18px]" />
          )}
        </button>

        {/* Notifications */}
        <button
          className="rounded-full p-2 text-text-muted hover:text-text hover:bg-surface-2 transition-all relative"
          aria-label="Notifications"
        >
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue rounded-full border-2 border-surface" />
        </button>

        {/* User Avatar */}
        <button
          className="rounded-full w-8 h-8 bg-surface-2 border border-border flex items-center justify-center text-text-muted hover:text-text transition-colors"
          aria-label="User profile"
        >
          <User className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
