import "@/globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { UndoProvider } from "@/components/ui/undo-banner";
import { ProfileProvider } from "@/contexts/profile-context";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { AppProps } from "next/app";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isAuthPage = router.pathname.startsWith("/auth") || (pageProps as any).__authPage === true;
  
  const [sessionChecked, setSessionChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(
    pageProps.user?.email ?? null
  );

  useEffect(() => {
    let supabase: any;
    try {
      supabase = createBrowserSupabaseClient();
    } catch {
      // Supabase client init failed (missing/invalid key) — unblock UI for smoke test
      setSessionChecked(true);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      if (session?.user?.email) setUserEmail(session.user.email);
    }).catch(() => {
      // session fetch failed
    }).finally(() => {
      setSessionChecked(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session?.user?.email) setUserEmail(session.user.email);
      else if (_event === 'SIGNED_OUT' || _event === 'USER_DELETED') setUserEmail(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (isAuthPage) {
    return (
      <QueryClientProvider client={queryClient}>
        <UndoProvider>
          <ProfileProvider>
            <Component {...pageProps} />
          </ProfileProvider>
        </UndoProvider>
      </QueryClientProvider>
    );
  }

  // Show nothing while checking session on first visit after login
  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-blue/30 border-t-blue rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <UndoProvider>
        <ProfileProvider>
          <div className="min-h-screen flex bg-bg">
            {userEmail && <Sidebar />}
            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${userEmail ? "md:ml-[var(--sidebar-width,256px)]" : ""}`}>
              {userEmail && <TopBar userEmail={userEmail} />}
              <main className="flex-1 pb-24 md:pb-6 overflow-y-auto">
                <div className="p-4 md:p-6">
                  <Component {...pageProps} />
                </div>
              </main>
              {userEmail && <BottomNav />}
            </div>
          </div>
        </ProfileProvider>
      </UndoProvider>
    </QueryClientProvider>
  );
}
