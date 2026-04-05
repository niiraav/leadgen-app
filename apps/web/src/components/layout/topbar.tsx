"use client";

import { useState } from "react";
import { Moon, Sun, Bell, User, Search } from "lucide-react";
import { useUIStore } from "@/stores/ui";

export function TopBar() {
  const { sidebarCollapsed } = useUIStore();
  const [searchQuery, setSearchQuery] = useState("");

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
        <button className="rounded-full p-2 text-text-muted hover:text-text hover:bg-surface-2 transition-colors">
          <Bell className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-blue/10 flex items-center justify-center">
          <User className="w-4 h-4 text-blue" />
        </div>
      </div>
    </header>
  );
}
