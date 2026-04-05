"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Search,
  Users,
  Columns3,
  Mail,
  ChevronLeft,
  ChevronRight,
  Zap,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useState } from "react";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Search",
    href: "/search/google-maps",
    icon: Search,
  },
  {
    label: "Leads",
    href: "/leads",
    icon: Users,
  },
  {
    label: "Pipeline",
    href: "/pipeline",
    icon: Columns3,
  },
  {
    label: "Sequences",
    href: "/sequences",
    icon: Mail,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href !== "/dashboard" && pathname?.startsWith(href)) return true;
    return false;
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-surface border-r border-border/60 flex flex-col transition-all duration-300 z-40",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-border/40">
        {collapsed ? (
          <div className="mx-auto">
            <Zap className="w-6 h-6 text-blue" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <Zap className="w-6 h-6 text-blue" />
            <span className="font-bold text-lg text-text tracking-tight">
              LeadGen
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-surface-2 text-text shadow-sm"
                  : "text-text-muted hover:bg-surface-2/60 hover:text-text"
              )}
            >
              <Icon className={cn("w-[18px] h-[18px] shrink-0", active && "text-blue")} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-border/40">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-text-muted hover:text-text hover:bg-surface-2/60 transition-all"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
