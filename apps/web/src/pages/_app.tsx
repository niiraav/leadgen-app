import "@/globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

export default function App({ Component, pageProps }: { Component: any; pageProps: any }) {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex bg-bg">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 ml-64 transition-all duration-300">
          <TopBar />
          <main className="flex-1 p-6">
            <Component {...pageProps} />
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
