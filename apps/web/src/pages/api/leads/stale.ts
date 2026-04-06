import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  if (req.method === "GET") {
    const url = new URL("http://localhost:3001/leads/stale");
    url.search = new URLSearchParams(req.query as any).toString();
    const resp = await fetch(url.toString(), { headers: { Authorization: "Bearer " + token } });
    const json = await resp.json().catch(() => ({}));
    return res.status(resp.status).json(json);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
