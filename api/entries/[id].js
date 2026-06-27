import { cleanSyncKey, deleteStoredEntry, readQuery, send } from "../_shared.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "DELETE") {
      return send(res, 405, { error: "Method not allowed." });
    }
    const syncKey = cleanSyncKey(readQuery(req, "syncKey"));
    const entryId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    if (!syncKey || !entryId) {
      return send(res, 400, { error: "syncKey and entry id are required." });
    }
    await deleteStoredEntry(syncKey, entryId);
    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}
