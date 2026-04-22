import { API_URL } from "@/lib/server-api";
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const resp = await fetch(API_URL + "/analytics/pipeline-health", {
    headers: { Authorization: "Bearer " + token },
  });
  const json = await resp.json().catch(() => ({}));
  res.status(resp.status).json(json);
}
