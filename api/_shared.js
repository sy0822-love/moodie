const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseTable = process.env.SUPABASE_TABLE || "diary_entries";
const geminiKey = process.env.GEMINI_API_KEY || "";

export function send(res, status, payload) {
  if (typeof res.status === "function") {
    return res.status(status).json(payload);
  }
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export function readQuery(req, key) {
  if (req.query && req.query[key]) {
    return Array.isArray(req.query[key]) ? req.query[key][0] : req.query[key];
  }
  const url = new URL(req.url || "/", "https://moodie.local");
  return url.searchParams.get(key);
}

export function cleanSyncKey(syncKey) {
  return String(syncKey || "").trim().slice(0, 80);
}

export function cleanEntryId(entryId) {
  return String(entryId || "").trim().slice(0, 120);
}

export function usingSupabase() {
  return Boolean(supabaseUrl && supabaseServiceKey);
}

export function hasGemini() {
  return Boolean(geminiKey);
}

function requireSupabase() {
  if (!usingSupabase()) {
    throw new Error("Supabase environment variables are required on Vercel.");
  }
}

function supabaseHeaders(extra = {}) {
  requireSupabase();
  return {
    apikey: supabaseServiceKey,
    authorization: `Bearer ${supabaseServiceKey}`,
    "content-type": "application/json",
    prefer: "return=representation",
    ...extra
  };
}

function normalizeEntryPayload(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (!entry.id || !entry.content || !entry.analysis) return null;
  return {
    id: cleanEntryId(entry.id),
    createdAt: entry.createdAt || new Date().toISOString(),
    content: String(entry.content).slice(0, 5000),
    analysis: entry.analysis
  };
}

async function readSupabaseError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text).message || text;
  } catch {
    return text;
  }
}

export async function listStoredEntries(syncKey) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}?sync_key=eq.${encodeURIComponent(syncKey)}&select=id,created_at,payload&order=created_at.desc`;
  const response = await fetch(url, { headers: supabaseHeaders({ prefer: "" }) });
  if (!response.ok) throw new Error(`Supabase list failed: ${response.status} ${await readSupabaseError(response)}`);
  const rows = await response.json();
  return rows.map((row) => row.payload).filter(Boolean);
}

export async function upsertStoredEntries(syncKey, entries) {
  const payloads = entries.map(normalizeEntryPayload).filter(Boolean);
  if (!payloads.length) return [];

  const rows = payloads.map((payload) => ({
    id: `${syncKey}:${payload.id}`,
    sync_key: syncKey,
    created_at: payload.createdAt,
    payload
  }));
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}?on_conflict=id`;
  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders({ prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error(`Supabase upsert failed: ${response.status} ${await readSupabaseError(response)}`);
  return payloads;
}

export async function deleteStoredEntry(syncKey, entryId) {
  const id = cleanEntryId(entryId);
  if (!id) return;
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}?id=eq.${encodeURIComponent(`${syncKey}:${id}`)}&sync_key=eq.${encodeURIComponent(syncKey)}`;
  const response = await fetch(url, { method: "DELETE", headers: supabaseHeaders({ prefer: "" }) });
  if (!response.ok) throw new Error(`Supabase delete failed: ${response.status} ${await readSupabaseError(response)}`);
}

export async function deleteStoredEntries(syncKey) {
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}?sync_key=eq.${encodeURIComponent(syncKey)}`;
  const response = await fetch(url, { method: "DELETE", headers: supabaseHeaders({ prefer: "" }) });
  if (!response.ok) throw new Error(`Supabase delete all failed: ${response.status} ${await readSupabaseError(response)}`);
}

function normalizeAiResult(data) {
  const scores = {};
  for (const [key, value] of Object.entries(data.scores || {})) {
    const score = Number(value);
    if (Number.isFinite(score)) scores[key] = Math.max(1, Math.min(5, score));
  }
  return {
    happy: Array.isArray(data.happy) ? data.happy.slice(0, 5) : [],
    unhappy: Array.isArray(data.unhappy) ? data.unhappy.slice(0, 5) : [],
    scores,
    recommendation: String(data.recommendation || "先照顧今天最需要被安放的感受。").slice(0, 80),
    source: "gemini"
  };
}

export async function analyzeWithGemini(content) {
  if (!geminiKey) {
    return { ok: false, reason: "GEMINI_API_KEY is not set." };
  }

  const prompt = `請分析這篇心情日記，回傳純 JSON，不要 markdown。規則：
1. happy 與 unhappy 放入你判斷出的情緒分類。
2. scores 是 1 到 5 分，1-2 代表紅色警訊，3 代表穩定，4-5 代表正向明亮。
3. recommendation 請給 30 字內溫柔具體建議。
格式：{"happy":[],"unhappy":[],"scores":{},"recommendation":""}
日記：${content}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  if (!response.ok) {
    return { ok: false, reason: `Gemini responded ${response.status}.` };
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return { ok: true, data: normalizeAiResult(JSON.parse(cleaned)) };
}
