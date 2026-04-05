"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Inter } from "next/font/google";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/topbar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("leadgen-theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const isAppRoute =
    pathname === "/" ||
    pathname?.startsWith("/dashboard") ||
    pathname?.startsWith("/search") ||
    pathname?.startsWith("/leads") ||
    pathname?.startsWith("/pipeline") ||
    pathname?.startsWith("/sequences");

  return (
    <QueryClientProvider client={queryClient}>
      {mounted && (
        <div className="min-h-screen flex bg-bg">
          {isAppRoute && <Sidebar />}
          <div
            className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
              isAppRoute ? "ml-[16rem]" : ""
            }`}
          >
            {isAppRoute && <TopBar />}
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      )}
      {!mounted && <div className="min-h-screen bg-bg" />}
    </QueryClientProvider>
  );
}
