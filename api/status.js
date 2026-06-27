import { hasGemini, send, usingSupabase } from "./shared.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, { error: "Method not allowed." });
  }
  return send(res, 200, {
    gemini: hasGemini(),
    database: usingSupabase() ? "supabase" : "missing-supabase-env",
    sync: usingSupabase()
  });
}
