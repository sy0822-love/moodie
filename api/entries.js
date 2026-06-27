import { cleanSyncKey, deleteStoredEntries, listStoredEntries, readQuery, send } from "./shared.js";

export default async function handler(req, res) {
  try {
    const syncKey = cleanSyncKey(readQuery(req, "syncKey"));
    if (!syncKey) {
      return send(res, 400, { error: "syncKey is required." });
    }

    if (req.method === "GET") {
      return send(res, 200, { entries: await listStoredEntries(syncKey), database: "supabase" });
    }

    if (req.method === "DELETE") {
      await deleteStoredEntries(syncKey);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}
