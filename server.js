import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

function loadEnvFile() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile();

const port = Number(process.env.PORT || 4173);
const geminiKey = process.env.GEMINI_API_KEY || "";
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseTable = process.env.SUPABASE_TABLE || "diary_entries";
const dataDir = process.env.DATA_DIR ? normalize(process.env.DATA_DIR) : join(root, "data");
const fileDbPath = join(dataDir, "diary-db.json");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function normalizeAiResult(data) {
  const allowed = ["感情", "家庭", "工作", "學業", "其他"];
  const happy = Array.isArray(data.happy) ? data.happy.filter((x) => allowed.includes(x)) : [];
  const unhappy = Array.isArray(data.unhappy) ? data.unhappy.filter((x) => allowed.includes(x)) : [];
  const scores = {};
  for (const category of allowed) {
    const value = Number(data.scores?.[category]);
    if (Number.isFinite(value)) scores[category] = Math.max(1, Math.min(5, value));
  }
  return {
    happy,
    unhappy,
    scores,
    recommendation: String(data.recommendation || "今天辛苦了，留一點溫柔給自己。").slice(0, 80),
    source: "gemini"
  };
}

function cleanSyncKey(syncKey) {
  return String(syncKey || "").trim().slice(0, 80);
}

function normalizeEntryPayload(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (!entry.id || !entry.content || !entry.analysis) return null;
  return {
    id: String(entry.id).slice(0, 120),
    createdAt: entry.createdAt || new Date().toISOString(),
    content: String(entry.content).slice(0, 5000),
    analysis: entry.analysis
  };
}

async function readFileDb() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(fileDbPath)) return { entries: [] };
  try {
    const data = JSON.parse(await readFile(fileDbPath, "utf8"));
    return { entries: Array.isArray(data.entries) ? data.entries : [] };
  } catch {
    return { entries: [] };
  }
}

async function writeFileDb(data) {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${fileDbPath}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, fileDbPath);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: supabaseServiceKey,
    authorization: `Bearer ${supabaseServiceKey}`,
    "content-type": "application/json",
    prefer: "return=representation",
    ...extra
  };
}

function usingSupabase() {
  return Boolean(supabaseUrl && supabaseServiceKey);
}

async function listStoredEntries(syncKey) {
  if (usingSupabase()) {
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}?sync_key=eq.${encodeURIComponent(syncKey)}&select=id,created_at,payload&order=created_at.desc`;
    const response = await fetch(url, { headers: supabaseHeaders({ prefer: "" }) });
    if (!response.ok) throw new Error(`Supabase list failed: ${response.status}`);
    const rows = await response.json();
    return rows.map((row) => row.payload).filter(Boolean);
  }

  const db = await readFileDb();
  return db.entries
    .filter((row) => row.syncKey === syncKey)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((row) => row.payload);
}

async function upsertStoredEntries(syncKey, entries) {
  const payloads = entries.map(normalizeEntryPayload).filter(Boolean);
  if (usingSupabase()) {
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
    if (!response.ok) throw new Error(`Supabase upsert failed: ${response.status}`);
    return payloads;
  }

  const db = await readFileDb();
  const others = db.entries.filter((row) => !(row.syncKey === syncKey && payloads.some((entry) => entry.id === row.entryId)));
  const merged = payloads.map((payload) => ({
    syncKey,
    entryId: payload.id,
    createdAt: payload.createdAt,
    payload
  }));
  db.entries = others.concat(merged);
  await writeFileDb(db);
  return payloads;
}

async function deleteStoredEntry(syncKey, entryId) {
  const id = String(entryId || "");
  if (!id) return;
  if (usingSupabase()) {
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}?id=eq.${encodeURIComponent(`${syncKey}:${id}`)}&sync_key=eq.${encodeURIComponent(syncKey)}`;
    const response = await fetch(url, { method: "DELETE", headers: supabaseHeaders({ prefer: "" }) });
    if (!response.ok) throw new Error(`Supabase delete failed: ${response.status}`);
    return;
  }

  const db = await readFileDb();
  db.entries = db.entries.filter((row) => !(row.syncKey === syncKey && row.entryId === id));
  await writeFileDb(db);
}

async function deleteStoredEntries(syncKey) {
  if (usingSupabase()) {
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/${supabaseTable}?sync_key=eq.${encodeURIComponent(syncKey)}`;
    const response = await fetch(url, { method: "DELETE", headers: supabaseHeaders({ prefer: "" }) });
    if (!response.ok) throw new Error(`Supabase delete all failed: ${response.status}`);
    return;
  }

  const db = await readFileDb();
  db.entries = db.entries.filter((row) => row.syncKey !== syncKey);
  await writeFileDb(db);
}

async function analyzeWithGemini(content) {
  if (!geminiKey) {
    return { ok: false, reason: "GEMINI_API_KEY is not set." };
  }

  const prompt = `你是溫暖、穩定且謹慎的繁體中文心理日記分類助手。請只回傳 JSON，不要 markdown。
任務：
1. 從日記判斷開心類別 happy 與困擾類別 unhappy。
2. 類別只能使用 ["感情","家庭","工作","學業","其他"]，可以多選，沒有就空陣列。
3. 為提到的類別給 scores，分數 1.0 到 5.0，3.0 表示普通。
4. recommendation 需 30 字以內，溫暖但不做醫療診斷。
格式：
{"happy":[],"unhappy":[],"scores":{},"recommendation":""}
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

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/status") {
      send(res, 200, JSON.stringify({
        gemini: Boolean(geminiKey),
        database: usingSupabase() ? "supabase" : "file",
        sync: true
      }));
      return;
    }

    if (url.pathname === "/api/entries" && req.method === "GET") {
      const syncKey = cleanSyncKey(url.searchParams.get("syncKey"));
      if (!syncKey) {
        send(res, 400, JSON.stringify({ error: "syncKey is required." }));
        return;
      }
      send(res, 200, JSON.stringify({ entries: await listStoredEntries(syncKey), database: usingSupabase() ? "supabase" : "file" }));
      return;
    }

    if (url.pathname === "/api/sync" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const syncKey = cleanSyncKey(body.syncKey);
      if (!syncKey) {
        send(res, 400, JSON.stringify({ error: "syncKey is required." }));
        return;
      }
      await upsertStoredEntries(syncKey, Array.isArray(body.entries) ? body.entries : []);
      send(res, 200, JSON.stringify({ entries: await listStoredEntries(syncKey), database: usingSupabase() ? "supabase" : "file" }));
      return;
    }

    if (url.pathname === "/api/entries" && req.method === "DELETE") {
      const syncKey = cleanSyncKey(url.searchParams.get("syncKey"));
      if (!syncKey) {
        send(res, 400, JSON.stringify({ error: "syncKey is required." }));
        return;
      }
      await deleteStoredEntries(syncKey);
      send(res, 200, JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname.startsWith("/api/entries/") && req.method === "DELETE") {
      const syncKey = cleanSyncKey(url.searchParams.get("syncKey"));
      const entryId = decodeURIComponent(url.pathname.split("/").pop() || "");
      if (!syncKey || !entryId) {
        send(res, 400, JSON.stringify({ error: "syncKey and entry id are required." }));
        return;
      }
      await deleteStoredEntry(syncKey, entryId);
      send(res, 200, JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname === "/api/analyze" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      const content = String(body.content || "").slice(0, 2500);
      const result = await analyzeWithGemini(content);
      send(res, result.ok ? 200 : 503, JSON.stringify(result.ok ? result.data : result));
      return;
    }

    const requested = normalize(url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname));
    const filePath = join(root, requested);
    if (!filePath.startsWith(root) || !existsSync(filePath)) {
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }

    const ext = extname(filePath);
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mime[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(body);
  } catch (error) {
    send(res, 500, JSON.stringify({ error: error.message }));
  }
}).listen(port, () => {
  console.log(`Creamy Diary running at http://127.0.0.1:${port}`);
  console.log(geminiKey ? "Gemini proxy enabled." : "Gemini proxy disabled; local classifier will be used.");
});
