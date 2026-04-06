import "@/globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { UndoProvider } from "@/components/ui/undo-banner";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { AppProps } from "next/app";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
});

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(pageProps.user?.email ?? null);

  // Fix #1: Check session on mount (prevents blank nav on login/refresh)
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    // Immediately check session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email && !isAuthPage()) {
        setUserEmail(session.user.email);
      }
    });
    // Listen for session changes
    supabase.auth.onAuthStateChange((_, session) => {
      if (session?.user?.email && !isAuthPage()) {
        setUserEmail(session.user.email);
      } else {
        setUserEmail(null);
      }
    });
  }, []);

  const isAuthPage = () => {
    return router.pathname.startsWith("/auth") || (pageProps as any).__authPage === true;
  };

  if (isAuthPage()) {
    return (
      <QueryClientProvider client={queryClient}>
        <UndoProvider>
          <Component {...pageProps} />
        </UndoProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <UndoProvider>
        <div className="min-h-screen flex bg-bg">
          {userEmail && <Sidebar />}
          <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${userEmail ? "md:ml-64" : ""}`}>
            {userEmail && <TopBar userEmail={userEmail} />}
            <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6 overflow-y-auto">
              <Component {...pageProps} />
            </main>
            {userEmail && <BottomNav />}
          </div>
        </div>
      </UndoProvider>
    </QueryClientProvider>
  );
}
