import { cleanSyncKey, listStoredEntries, send, upsertStoredEntries } from "./shared.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return send(res, 405, { error: "Method not allowed." });
    }
    const syncKey = cleanSyncKey(req.body?.syncKey);
    if (!syncKey) {
      return send(res, 400, { error: "syncKey is required." });
    }
    await upsertStoredEntries(syncKey, Array.isArray(req.body?.entries) ? req.body.entries : []);
    return send(res, 200, { entries: await listStoredEntries(syncKey), database: "supabase" });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}
