import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ─── Browser client for client-side components ────────────────────────────────

// Singleton — avoids re-creating the client on every API call
let _browserClient: ReturnType<typeof createBrowserClient> | null = null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTk2MDAwMDAwMH0.placeholder';

export function createBrowserSupabaseClient() {
  if (!_browserClient) {
    _browserClient = createBrowserClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );
  }
  return _browserClient;
}

// ─── Server client for SSR (getServerSideProps) ──────────────────────────────

import type { IncomingMessage, ServerResponse } from "http";
import { parse, serialize } from "cookie";

export function createServerSupabaseClient(
  req: IncomingMessage,
  res: ServerResponse
) {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
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

let _supabaseAdmin: ReturnType<typeof createSupabaseClient> | null = null;

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createSupabaseClient(
      SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return _supabaseAdmin;
}
