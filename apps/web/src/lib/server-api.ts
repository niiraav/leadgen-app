// Server-side API URL for Next.js API routes (pages/api/*)
// Use NEXT_PUBLIC_API_URL for browser-side, API_URL for server-side proxy routes
export const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:3001";
