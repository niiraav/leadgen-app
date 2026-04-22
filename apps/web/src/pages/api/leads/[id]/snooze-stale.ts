import { API_URL } from "@/lib/server-api";
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query as { id?: string };
  const url = API_URL + "/leads/" + id + "/snooze-stale";
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  const json = await resp.json().catch(() => ({}));
  res.status(resp.status).json(json);
}
