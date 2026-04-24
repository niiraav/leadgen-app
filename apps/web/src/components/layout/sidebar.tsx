"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Search,
  Users,
  Columns3,
  Mail,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Zap,
  Settings,
  CreditCard,
} from "lucide-react";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useReplyToast } from "@/components/replies/ReplyToastProvider";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Search", href: "/search/google-maps", icon: Search },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Pipeline", href: "/pipeline", icon: Columns3 },
  { label: "Sequences", href: "/sequences", icon: Mail },
  { label: "Replies", href: "/replies", icon: MessageSquare },
  { label: "Billing", href: "/billing", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const { unreadCount } = useReplyToast();

  // Inform page content of sidebar width via CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "72px" : "256px"
    );
  }, [collapsed]);

  const isActive = (href: string) => {
    if (router.pathname === href) return true;
    if (href !== "/dashboard" && router.pathname?.startsWith(href)) return true;
    return false;
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 hidden md:flex h-screen bg-surface border-r border-border/60 flex-col transition-all duration-300 z-40",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className="flex items-center h-16 px-4 border-b border-border/40">
        {collapsed ? (
          <div className="mx-auto">
            <Zap className="w-6 h-6 text-blue" />
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <Zap className="w-6 h-6 text-blue" />
            <span className="font-bold text-lg text-text tracking-tight">LeadGen</span>
          </div>
        )}
      </div>

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
              <motion.span
                animate={{
                  opacity: collapsed ? 0 : 1,
                  width: collapsed ? 0 : "auto",
                  marginLeft: collapsed ? 0 : 0,
                }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden whitespace-nowrap"
              >
                {item.label}
              </motion.span>
              {!collapsed && item.href === "/replies" && unreadCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                  {unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

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
