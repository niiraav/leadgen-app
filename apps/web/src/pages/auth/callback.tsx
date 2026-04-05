// OAuth callback handler
import type { GetServerSideProps } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const supabase = createServerSupabaseClient(req, res);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    return { redirect: { destination: "/dashboard", permanent: false } };
  }

  // Auth error — redirect back to login with error message
  const url = new URL(req.url || "/", "http://localhost");
  const error = url.searchParams.get("error_description") || "Authentication failed";

  return { redirect: { destination: `/auth/login?error=${encodeURIComponent(error)}`, permanent: false } };
};

export default function CallbackPage() {
  return null;
}
