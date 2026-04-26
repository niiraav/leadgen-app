import { Home, Users, Search, Columns3, MoreHorizontal, X, Settings, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import FocusTrap from "focus-trap-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useEscapeKey } from "@/hooks/useEscapeKey";

const mainTabs = [
  { label: "Dashboard", href: "/dashboard", icon: Home },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Search", href: "/search/google-maps", icon: Search },
  { label: "Pipeline", href: "/pipeline", icon: Columns3 },
  { label: "More", href: "#more", icon: MoreHorizontal },
];

const moreItems = [
  { label: "Sequences", href: "/sequences", icon: Columns3 },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Sign out", href: "#signout", icon: LogOut, action: true },
];

export function BottomNav() {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetRef, setSheetRef] = useState<HTMLDivElement | null>(null);

  const isActive = useCallback((href: string) => {
    if (!href || href.startsWith("#")) return false;
    if (router.pathname === href) return true;
    // Handle dynamic routes /leads/[id] -> /leads
    const routeParts = router.pathname.split("/");
    const hrefParts = href.split("/");
    if (routeParts[1] === hrefParts[1] && routeParts[1]) return true;
    return false;
  }, [router.pathname]);

  const handleSignOut = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push("/auth/login");
    } catch {
      console.error("Logout failed");
    }
  }, [router]);

  // Close drawer on backdrop click
  const onBackdropClick = useCallback((e: React.MouseEvent) => {
    if (sheetRef && !sheetRef.contains(e.target as Node)) setMoreOpen(false);
  }, [sheetRef]);

  useScrollLock(moreOpen);
  useEscapeKey(moreOpen, () => setMoreOpen(false));

  return (
    <>
      {/* Drawer Backdrop */}
      {moreOpen && (
        <div className="fixed inset-0 bg-overlay z-50 md:hidden backdrop-blur-sm" onClick={onBackdropClick} />
      )}

      {/* Drawer Sheet */}
      <div
        ref={setSheetRef}
        className={`fixed left-0 right-0 bottom-16 z-50 md:hidden bg-card border-t border-border rounded-t-lg transition-transform duration-300 ease-out`}
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        {moreOpen && (
          <FocusTrap>
            <div role="dialog" aria-modal="true" aria-label="More menu" className={`transform transition-transform duration-300 ${moreOpen ? "translate-y-0" : "translate-y-full"}`}>
              <div className="p-4 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-foreground">More</h2>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-1">
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        if (item.action) handleSignOut();
                        else {
                          setMoreOpen(false);
                          router.push(item.href);
                        }
                      }}
                      className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors min-h-11 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
            </div>
          </FocusTrap>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-card/95 backdrop-blur-md border-t border-border" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex items-center justify-around h-16">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            const isMore = tab.href === "#more";

            return (
              <button
                key={tab.href}
                onClick={() => {
                  if (isMore) setMoreOpen(true);
                  else router.push(tab.href);
                }}
                className={`flex flex-col items-center justify-center min-w-16 h-full transition-colors active:scale-90 duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className={`w-6 h-6 ${active ? "stroke-[2.5px]" : "stroke-2"}`} />
                <span className="text-micro font-medium mt-0.5">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
