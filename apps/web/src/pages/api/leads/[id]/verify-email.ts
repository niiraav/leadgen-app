import { API_URL } from "@/lib/server-api";
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query as { id?: string };
  const url = API_URL + "/leads/" + id + "/verify-email";
  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const json = await resp.json().catch(() => ({
    verified: false,
    email_status: "unknown",
    reason: "proxy_parse_error",
  }));
  res.status(resp.status).json(json);
}
