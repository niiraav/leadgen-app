import type { NextApiRequest, NextApiResponse } from "next";
import { createServerSupabaseClient } from "@/lib/supabase";

async function getAuthToken(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient(req, res);
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function proxyToBackend(method: string, req: NextApiRequest, res: NextApiResponse, path: string) {
  const token = await getAuthToken(req, res);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const url = `http://localhost:3001${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (!["GET", "HEAD"].includes(method)) {
    headers["Content-Type"] = "application/json";
  }

  const proxyRes = await fetch(url, {
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : JSON.stringify(req.body),
  });

  const data = await proxyRes.json().catch(() => ({}));
  res.status(proxyRes.status).json(data);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, action, ...rest } = req.query;
  let path = "/sequences";

  if (action === "resume" && id) {
    path = `/sequences/${id}/resume`;
  } else if (action === "pause" && id) {
    path = `/sequences/${id}/pause`;
  } else if (action === "enroll" && id) {
    path = `/sequences/${id}/enroll`;
  } else if (id) {
    path = `/sequences/${id}`;
  }

  await proxyToBackend(req.method || "GET", req, res, path);
}
