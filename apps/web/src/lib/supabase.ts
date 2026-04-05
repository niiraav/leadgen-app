import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ─── Browser client for client-side components ────────────────────────────────

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Server client for SSR (getServerSideProps) ──────────────────────────────

import type { IncomingMessage, ServerResponse } from "http";
import { parse, serialize } from "cookie";

export function createServerSupabaseClient(
  req: IncomingMessage,
  res: ServerResponse
) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          if (!req.headers.cookie) return undefined;
          const cookie = parse(req.headers.cookie);
          return cookie[name];
        },
        set(name: string, value: string, options: any) {
          res.setHeader(
            "Set-Cookie",
            serialize(name, value, {
              ...options,
              httpOnly: false,
              path: "/",
              maxAge: options.maxAge ?? 60 * 60 * 24, // 1 day
            })
          );
        },
        remove(name: string, options: any) {
          res.setHeader(
            "Set-Cookie",
            serialize(name, "", {
              ...options,
              maxAge: 0,
              path: "/",
            })
          );
        },
      },
    }
  );
}

// ─── Service role client (server-side only, for admin operations) ────────────

export const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
