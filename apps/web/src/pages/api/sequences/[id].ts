import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query as { id?: string };
  const url = "http://localhost:3001/sequences/" + id;
  const headers: Record<string, string> = {
    Authorization: "Bearer " + token,
  };
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "DELETE") {
    headers["Content-Type"] = "application/json";
  }

  const body = (req.method === "GET" || req.method === "HEAD")
    ? undefined
    : JSON.stringify(req.body);

  const resp = await fetch(url, { method: req.method || "GET", headers, body });
  const json = await resp.json().catch(() => ({}));
  res.status(resp.status).json(json);
}
