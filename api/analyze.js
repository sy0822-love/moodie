import { analyzeWithGemini, send } from "./_shared.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return send(res, 405, { error: "Method not allowed." });
    }
    const content = String(req.body?.content || "").slice(0, 2500);
    const result = await analyzeWithGemini(content);
    return send(res, result.ok ? 200 : 503, result.ok ? result.data : result);
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}
