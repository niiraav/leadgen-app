import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const resp = await fetch(`${API}/profile${req.url?.replace(/^\/api\/profile/, '') || ''}`, {
      method: req.method,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
    });
    const data = await resp.json().catch(() => ({}));
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: "Profile proxy failed", details: err.message });
  }
}
