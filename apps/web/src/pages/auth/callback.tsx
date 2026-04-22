// OAuth callback handler — exchanges PKCE code for session
import type { GetServerSideProps } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export const getServerSideProps: GetServerSideProps = async ({ req, res, query }) => {
  const supabase = createServerSupabaseClient(req, res);

  // Supabase Auth v2 (PKCE) returns a `code` query param that must be exchanged
  const code = query.code as string | undefined;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return { redirect: { destination: "/dashboard", permanent: false } };
    }
    // Exchange failed — fall through to error redirect
    return {
      redirect: {
        destination: `/auth/login?error=${encodeURIComponent(error.message)}`,
        permanent: false,
      },
    };
  }

  // No code present — check if we already have a session (rare, but possible)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    return { redirect: { destination: "/dashboard", permanent: false } };
  }

  // Auth error from provider
  const url = new URL(req.url || "/", "http://localhost");
  const error =
    (query.error_description as string) ||
    (query.error as string) ||
    "Authentication failed";

  return {
    redirect: {
      destination: `/auth/login?error=${encodeURIComponent(error)}`,
      permanent: false,
    },
  };
};

export default function CallbackPage() {
  return null;
}
