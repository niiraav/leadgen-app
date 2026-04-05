import "@/globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";
import { useState, useEffect } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { AppProps } from "next/app";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

export default function App({ Component, pageProps }: AppProps) {
  const [userEmail, setUserEmail] = useState<string | null>(pageProps.user?.email ?? null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase.auth.onAuthStateChange((_, session) => {
      setUserEmail(session?.user?.email ?? pageProps.user?.email ?? null);
    });
  }, [pageProps.user]);

  // Pages without auth layout
  const isAuthPage = Component.name === "LoginPage" || Component.name === "SignupPage";
  const pageType = pageProps.__authPage ? true : false;

  if (pageType) {
    return (
      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex bg-bg">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 ml-64 transition-all duration-300">
          <TopBar userEmail={userEmail} />
          <main className="flex-1 p-6">
            <Component {...pageProps} />
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
