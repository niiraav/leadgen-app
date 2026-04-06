import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query as { id?: string };
  const { activity_id } = req.body as { activity_id?: string };

  // Archive the lead
  await fetch("http://localhost:3001/leads/" + id, {
    method: "PATCH",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "archived" }),
  });

  // Mark activity as resolved
  if (activity_id) {
    await fetch("http://localhost:3001/analytics/dead-leads/" + activity_id + "/resolve", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resolved: true }),
    }).catch(() => {}); // Don't fail if this endpoint doesn't exist yet
  }

  res.status(200).json({ message: "Lead archived" });
}
