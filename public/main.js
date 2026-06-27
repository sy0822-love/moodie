const STORAGE_KEY = "creamy_diary_entries_v1";
const SYNC_KEY_STORAGE = "creamy_diary_sync_key_v1";
const CATEGORIES = ["感情", "家庭", "工作", "學業", "其他"];
const CATEGORY_COLORS = {
  "感情": "#eaa2a0",
  "家庭": "#e9b27f",
  "工作": "#9cc4d7",
  "學業": "#cab3df",
  "其他": "#a9cfa8"
};
const CATEGORY_GRADIENTS = {
  "感情": ["#f8d5d1", "#eaa2a0"],
  "家庭": ["#ffe0b3", "#e9b27f"],
  "工作": ["#d5edf4", "#9cc4d7"],
  "學業": ["#e6d9f3", "#cab3df"],
  "其他": ["#dff0d8", "#a9cfa8"]
};

const KEYWORDS = {
  "感情": ["男友", "女友", "伴侶", "喜歡", "曖昧", "約會", "分手", "告白", "感情", "戀愛"],
  "家庭": ["媽媽", "爸爸", "家人", "父母", "孩子", "小孩", "家裡", "家庭", "婆婆", "兄弟", "姊妹"],
  "工作": ["工作", "上班", "同事", "主管", "客戶", "會議", "報告", "專案", "加班", "薪水", "面試"],
  "學業": ["作業", "考試", "老師", "同學", "學校", "論文", "成績", "課程", "讀書", "研究", "上課"],
  "其他": ["天氣", "身體", "健康", "睡", "朋友", "錢", "運動", "旅行", "交通", "排隊", "心情"]
};

const POSITIVE = ["開心", "快樂", "順利", "稱讚", "完成", "成功", "放鬆", "期待", "舒服", "感謝", "喜歡", "進步", "好棒", "被肯定", "安心", "笑"];
const NEGATIVE = ["難過", "焦慮", "壓力", "吵架", "失望", "生氣", "累", "疲憊", "煩", "害怕", "挫折", "失敗", "哭", "擔心", "委屈", "痛"];
const QUICK_TEXT = ["工作被肯定", "和家人聊天", "讀書有進度", "感情有摩擦", "睡眠不足", "散步後放鬆"];

let entries = loadEntries();
let currentTab = "write";
let insightRenderTimer = 0;
let latestPreviewAnalysis = entries[0]?.analysis || null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  todayLabel: $("#todayLabel"),
  diaryInput: $("#diaryInput"),
  wordCount: $("#wordCount"),
  quickChips: $("#quickChips"),
  saveBtn: $("#saveBtn"),
  voiceBtn: $("#voiceBtn"),
  sampleBtn: $("#sampleBtn"),
  previewScore: $("#previewScore"),
  previewStateLabel: $("#previewStateLabel"),
  previewTags: $("#previewTags"),
  previewAdvice: $("#previewAdvice"),
  livePreview: $("#livePreview"),
  aiStatus: $("#aiStatus"),
  rangeSelect: $("#rangeSelect"),
  heatmap: $("#heatmap"),
  timeline: $("#timeline"),
  searchInput: $("#searchInput"),
  filterSelect: $("#filterSelect"),
  syncKeyInput: $("#syncKeyInput"),
  syncNowBtn: $("#syncNowBtn"),
  syncStatus: $("#syncStatus"),
  exportBtn: $("#exportBtn"),
  importFile: $("#importFile"),
  clearBtn: $("#clearBtn"),
  checkAiBtn: $("#checkAiBtn"),
  themeToggle: $("#themeToggle")
};

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.map(normalizeEntry).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function getSyncKey() {
  return (elements.syncKeyInput?.value || localStorage.getItem(SYNC_KEY_STORAGE) || "").trim();
}

function setSyncStatus(message, tone = "muted") {
  if (!elements.syncStatus) return;
  elements.syncStatus.textContent = message;
  elements.syncStatus.dataset.tone = tone;
}

function normalizeEntry(item) {
  if (!item || !item.content || !item.analysis) return null;
  return {
    id: item.id || crypto.randomUUID(),
    createdAt: item.createdAt || new Date().toISOString(),
    content: String(item.content),
    analysis: normalizeAnalysis(item.analysis)
  };
}

function normalizeCategoryName(name, fallbackIndex = 0) {
  const text = String(name || "").trim();
  if (CATEGORIES.includes(text)) return text;
  if (/感情|戀愛|伴侶|關係|朋友|人際/.test(text)) return "感情";
  if (/家庭|家人|父母|親子/.test(text)) return "家庭";
  if (/工作|職場|同事|主管|壓力/.test(text)) return "工作";
  if (/學業|課業|考試|作業|學校/.test(text)) return "學業";
  return CATEGORIES[fallbackIndex % CATEGORIES.length];
}

function normalizeAnalysis(data) {
  const scores = {};
  Object.entries(data?.scores || {}).forEach(([key, raw], index) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    scores[normalizeCategoryName(key, index)] = clamp(value, 1, 5);
  });
  const happy = unique((data?.happy || []).map((x, index) => normalizeCategoryName(x, index)));
  const unhappy = unique((data?.unhappy || []).map((x, index) => normalizeCategoryName(x, index)));
  const avgScore = Object.values(scores).length
    ? average(Object.values(scores))
    : Number(data?.avgScore || 3);
  return {
    happy,
    unhappy,
    scores,
    avgScore: clamp(avgScore, 1, 5),
    recommendation: String(data?.recommendation || "今天辛苦了，讓自己慢一點也可以。"),
    source: data?.source || "local"
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(items) {
  return [...new Set(items)];
}

function average(numbers) {
  return numbers.reduce((sum, n) => sum + n, 0) / Math.max(1, numbers.length);
}

function countHits(text, words) {
  return words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
}

function localAnalyze(content) {
  const text = content.trim();
  const sentences = text.split(/[。！？!?；;\n]/).map((part) => part.trim()).filter(Boolean);
  const wholePositiveHits = countHits(text, POSITIVE);
  const wholeNegativeHits = countHits(text, NEGATIVE);
  const happy = [];
  const unhappy = [];
  const scores = {};

  for (const category of CATEGORIES) {
    const related = sentences.filter((sentence) => countHits(sentence, KEYWORDS[category]) > 0);
    if (!related.length && category !== "其他") continue;
    if (category === "其他" && !related.length && (happy.length || unhappy.length)) continue;

    const relatedText = related.length ? related.join("。") : text;
    const positiveHits = countHits(relatedText, POSITIVE);
    const negativeHits = countHits(relatedText, NEGATIVE);
    const categoryHits = countHits(relatedText, KEYWORDS[category]);
    const categoryTextFactor = Math.min(0.35, categoryHits * 0.08);
    const moodDelta = (positiveHits * 0.48) - (negativeHits * 0.52);
    const score = clamp(3 + moodDelta + categoryTextFactor, 1, 5);
    scores[category] = Number(score.toFixed(1));

    if (positiveHits > negativeHits && positiveHits > 0) happy.push(category);
    if (negativeHits > positiveHits && negativeHits > 0) unhappy.push(category);
    if (positiveHits === negativeHits && positiveHits > 0) {
      happy.push(category);
      unhappy.push(category);
    }
  }

  if (!Object.keys(scores).length) {
    scores["其他"] = wholePositiveHits || wholeNegativeHits ? clamp(3 + wholePositiveHits * 0.35 - wholeNegativeHits * 0.4, 1, 5) : 3;
    if (wholePositiveHits) happy.push("其他");
    if (wholeNegativeHits) unhappy.push("其他");
  }

  const avgScore = Number(average(Object.values(scores)).toFixed(1));
  return {
    happy: unique(happy),
    unhappy: unique(unhappy),
    scores,
    avgScore,
    recommendation: buildAdvice(avgScore, unique(happy), unique(unhappy)),
    source: "local"
  };
}

function buildAdvice(score, happy, unhappy) {
  if (score >= 4.2) return "今天有亮亮的地方，記得把這份甜收好。";
  if (score >= 3.3 && happy.length) return `${happy[0]}帶來一點光，今晚可以溫柔收尾。`;
  if (score <= 2.1) return "今天真的不輕鬆，先喝水、休息，再抱抱自己。";
  if (unhappy.length) return `${unhappy[0]}有點卡，先把步伐放慢就好。`;
  return "平淡的一天也值得被好好記下。";
}

async function analyzeDiary(content) {
  try {
    const response = await fetch("./api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (response.ok) {
      return normalizeAnalysis(await response.json());
    }
  } catch {
    // Static file mode or offline mode falls back to local analysis.
  }
  return localAnalyze(content);
}

async function checkAiStatus() {
  try {
    const response = await fetch("./api/status");
    const data = await response.json();
    elements.aiStatus.textContent = data.gemini ? "Gemini 自動分析" : "本地自動分類";
    if (data.sync && getSyncKey()) setSyncStatus(`同步已就緒，資料庫：${data.database === "supabase" ? "Supabase" : "伺服器檔案 DB"}。`);
    return data.gemini;
  } catch {
    elements.aiStatus.textContent = "本地自動分類";
    return false;
  }
}

function mergeEntries(localEntries, remoteEntries) {
  const map = new Map();
  for (const entry of localEntries.concat(remoteEntries)) {
    const normalized = normalizeEntry(entry);
    if (!normalized) continue;
    const existing = map.get(normalized.id);
    if (!existing || new Date(normalized.createdAt) > new Date(existing.createdAt)) {
      map.set(normalized.id, normalized);
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function syncEntries({ silent = false } = {}) {
  const syncKey = getSyncKey();
  if (!syncKey) {
    setSyncStatus("尚未設定同步代碼。手機和電腦要填同一組才會同步。");
    return false;
  }

  localStorage.setItem(SYNC_KEY_STORAGE, syncKey);
  if (!silent) setSyncStatus("同步中...");
  try {
    const response = await fetch("./api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ syncKey, entries })
    });
    if (!response.ok) throw new Error(`sync failed ${response.status}`);
    const data = await response.json();
    entries = mergeEntries(entries, data.entries || []);
    latestPreviewAnalysis = entries[0]?.analysis || latestPreviewAnalysis;
    saveEntries();
    renderAll();
    setSyncStatus(`已同步 ${entries.length} 篇，資料庫：${data.database === "supabase" ? "Supabase" : "伺服器檔案 DB"}。`, "ok");
    return true;
  } catch {
    setSyncStatus("同步失敗：目前先保存在這台裝置，稍後可再按同步。", "error");
    return false;
  }
}

function setTab(tab) {
  currentTab = tab;
  $$(".tab").forEach((button) => button.classList.toggle("is-active", button.dataset.tab === tab));
  $$(".panel").forEach((panel) => panel.classList.remove("is-active"));
  $(`#${tab}Panel`).classList.add("is-active");
  if (tab === "insights") scheduleInsightsRender();
  if (tab === "history") renderHistory();
}

function renderQuickChips() {
  elements.quickChips.innerHTML = "";
  for (const text of QUICK_TEXT) {
    const button = document.createElement("button");
    button.className = "chip";
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => {
      const prefix = elements.diaryInput.value.trim() ? "，" : "";
      elements.diaryInput.value += `${prefix}${text}`;
      updatePreview();
      elements.diaryInput.focus();
    });
    elements.quickChips.append(button);
  }
}

function updatePreview() {
  const content = elements.diaryInput.value;
  elements.wordCount.textContent = `${content.length} 字`;
  if (!content.trim() && latestPreviewAnalysis) {
    renderPreviewAnalysis(latestPreviewAnalysis, true);
    return;
  }
  const analysis = localAnalyze(content);
  renderPreviewAnalysis(analysis, Boolean(content.trim()));
}

function renderPreviewAnalysis(analysis, hasContent) {
  elements.previewScore.textContent = analysis.avgScore.toFixed(1);
  updatePreviewTone(analysis.avgScore, hasContent);
  renderTags(elements.previewTags, analysis);
  elements.previewAdvice.textContent = hasContent ? analysis.recommendation : "寫下一點內容後，這裡會先用本地模型預判分類。";
}

function scoreTone(score) {
  if (score < 3) return {
    className: "tone-alert",
    label: "紅色警訊",
    note: "1-2 分：目前壓力偏高，建議先休息、補水，必要時找可信任的人聊聊。"
  };
  if (score < 4) return {
    className: "tone-stable",
    label: "綠色穩定",
    note: "3 分：狀態大致平穩，可以留意小波動但不用急著責備自己。"
  };
  return {
    className: "tone-bright",
    label: "藍色明亮",
    note: "4-5 分：今天有明顯的好感受，可以記下是什麼讓你變亮。"
  };
}

function updatePreviewTone(score, hasContent) {
  const tone = scoreTone(score);
  elements.livePreview.classList.remove("tone-alert", "tone-stable", "tone-bright");
  elements.livePreview.classList.add(tone.className);
  elements.previewStateLabel.textContent = hasContent ? tone.label : "即時待命";
}

function renderTags(container, analysis) {
  container.innerHTML = "";
  for (const item of analysis.happy) container.append(makeTag(`開心 ${item}`, "good"));
  for (const item of analysis.unhappy) container.append(makeTag(`困擾 ${item}`, "bad"));
  if (!container.children.length) container.append(makeTag("尚未分類", ""));
}

function makeTag(text, tone) {
  const span = document.createElement("span");
  span.className = `tag ${tone}`.trim();
  span.textContent = text;
  return span;
}

function setButtonLabel(button, iconId, label) {
  button.innerHTML = `<svg aria-hidden="true"><use href="#${iconId}"></use></svg><span>${label}</span>`;
}

async function saveDiary() {
  const content = elements.diaryInput.value.trim();
  if (!content) {
    elements.diaryInput.focus();
    return;
  }
  elements.saveBtn.disabled = true;
  setButtonLabel(elements.saveBtn, "icon-save", "分析中...");
  const analysis = await analyzeDiary(content);
  entries.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    content,
    analysis
  });
  latestPreviewAnalysis = analysis;
  saveEntries();
  elements.diaryInput.value = "";
  elements.wordCount.textContent = "0 字";
  renderPreviewAnalysis(analysis, true);
  elements.saveBtn.disabled = false;
  setButtonLabel(elements.saveBtn, "icon-save", "儲存並自動分析");
  renderAll();
  setTab("insights");
  syncEntries({ silent: true });
}

function renderAll() {
  renderFilterOptions();
  renderHistory();
  if (currentTab === "insights") scheduleInsightsRender();
}

function renderFilterOptions() {
  const current = elements.filterSelect.value || "all";
  elements.filterSelect.innerHTML = '<option value="all">全部類別</option>';
  for (const category of CATEGORIES) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.filterSelect.append(option);
  }
  elements.filterSelect.value = current;
}

function renderHistory() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const filter = elements.filterSelect.value;
  const list = entries.filter((entry) => {
    const haystack = `${entry.content} ${entry.analysis.recommendation} ${entry.analysis.happy.join(" ")} ${entry.analysis.unhappy.join(" ")}`.toLowerCase();
    const categoryMatch = filter === "all" || entry.analysis.happy.includes(filter) || entry.analysis.unhappy.includes(filter) || entry.analysis.scores[filter];
    return categoryMatch && (!query || haystack.includes(query));
  });

  elements.timeline.innerHTML = "";
  if (!list.length) {
    elements.timeline.innerHTML = '<div class="empty">還沒有符合條件的日記。寫下一篇後，這裡會長出你的時間線。</div>';
    return;
  }

  const template = $("#entryTemplate");
  for (const entry of list) {
    const node = template.content.firstElementChild.cloneNode(true);
    const date = new Date(entry.createdAt);
    node.classList.add(scoreTone(entry.analysis.avgScore).className);
    node.querySelector(".entry-date").textContent = formatDateTime(date);
    node.querySelector(".entry-title").textContent = entry.analysis.source === "gemini" ? "Gemini 已分析" : "本地模型已分析";
    node.querySelector(".entry-score").textContent = entry.analysis.avgScore.toFixed(1);
    node.querySelector(".entry-content").textContent = entry.content;
    renderTags(node.querySelector(".entry-tags"), entry.analysis);
    node.querySelector(".entry-advice").textContent = entry.analysis.recommendation;
    node.querySelector(".delete-entry").addEventListener("click", () => deleteEntry(entry.id));
    elements.timeline.append(node);
  }
}

async function deleteEntry(id) {
  if (!confirm("確定要刪除這篇日記嗎？")) return;
  entries = entries.filter((entry) => entry.id !== id);
  saveEntries();
  renderAll();
  const syncKey = getSyncKey();
  if (!syncKey) return;
  try {
    await fetch(`./api/entries/${encodeURIComponent(id)}?syncKey=${encodeURIComponent(syncKey)}`, { method: "DELETE" });
    setSyncStatus("已同步刪除。", "ok");
  } catch {
    setSyncStatus("本機已刪除，但雲端刪除同步失敗。", "error");
  }
}

function scheduleInsightsRender() {
  cancelAnimationFrame(insightRenderTimer);
  insightRenderTimer = requestAnimationFrame(() => {
    insightRenderTimer = requestAnimationFrame(renderInsights);
  });
}

function renderInsights() {
  if (currentTab !== "insights") return;
  drawTrendChart();
  drawSignalChart();
  drawStressChart();
  drawCategoryChart();
  drawBalanceChart();
  renderHeatmap();
}

function renderMetrics() {
  const total = entries.length;
  const avg = total ? average(entries.map((entry) => entry.analysis.avgScore)) : 0;
  const best = topCategory("happy") || "無";
  const heavy = topCategory("unhappy") || "無";
  const latest = entries[0]?.analysis.avgScore;
  const latestTone = latest ? scoreTone(latest).label : "尚無";
  const items = [
    ["日記篇數", total],
    ["平均心情", total ? avg.toFixed(1) : "-"],
    ["最常開心", best],
    ["常見困擾", heavy],
    ["最近狀態", latestTone]
  ];
  elements.metricCards.innerHTML = "";
  for (const [label, value] of items) {
    const card = document.createElement("article");
    card.className = "metric";
    card.innerHTML = `<span class="section-label">${label}</span><strong>${value}</strong>`;
    elements.metricCards.append(card);
  }
}

function renderInsightStories() {
  const total = entries.length;
  elements.insightStories.innerHTML = "";
  if (!total) {
    elements.insightStories.innerHTML = '<article class="story-card"><span class="section-label">Start</span><strong>還沒有資料</strong><p>寫下第一篇日記後，這裡會自動整理壓力來源、亮點與近期趨勢。</p></article>';
    return;
  }

  const recent = entries.slice(0, 7);
  const avgRecent = average(recent.map((entry) => entry.analysis.avgScore));
  const avgAll = average(entries.map((entry) => entry.analysis.avgScore));
  const stress = topCategory("unhappy") || "暫無";
  const bright = topCategory("happy") || "暫無";
  const lowCount = recent.filter((entry) => entry.analysis.avgScore < 3).length;
  const delta = avgRecent - avgAll;
  const trendText = Math.abs(delta) < 0.15 ? "和整體差不多" : delta > 0 ? `比整體高 ${delta.toFixed(1)}` : `比整體低 ${Math.abs(delta).toFixed(1)}`;
  const tone = scoreTone(avgRecent);
  const cards = [
    ["Status", tone.label, `近 ${recent.length} 篇平均 ${avgRecent.toFixed(1)} 分，${trendText}。`, tone.className === "tone-alert" ? "alert" : tone.className === "tone-bright" ? "blue" : "good"],
    ["Stress", stress, stress === "暫無" ? "目前沒有明顯困擾來源。" : `${stress} 是近期最常出現的困擾來源，可以優先觀察。`, "alert"],
    ["Bright Spot", bright, bright === "暫無" ? "還沒有累積到穩定亮點。" : `${bright} 經常帶來正向感受，值得多安排一點。`, "good"],
    ["Low Score", `${lowCount} 篇`, lowCount ? "近 7 篇中有低分紀錄，建議降低安排密度。" : "近況沒有明顯紅色警訊。", lowCount ? "alert" : "blue"]
  ];

  for (const [label, value, text, toneClass] of cards) {
    const card = document.createElement("article");
    card.className = `story-card ${toneClass}`;
    card.innerHTML = `<span class="section-label">${label}</span><strong>${value}</strong><p>${text}</p>`;
    elements.insightStories.append(card);
  }
}

function topCategory(type) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  for (const entry of entries) {
    for (const category of entry.analysis[type]) counts[category] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).find(([, count]) => count > 0)?.[0];
}

function categoryEventCounts(type) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  for (const entry of entries) {
    for (const category of entry.analysis[type]) counts[category] += 1;
  }
  return counts;
}

function getRangeEntries() {
  const days = Number(elements.rangeSelect.value || 7);
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);
  return entries.filter((entry) => new Date(entry.createdAt) >= since).reverse();
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const fallbackWidth = canvas.parentElement?.clientWidth || document.documentElement.clientWidth || 360;
  const cssWidth = Math.max(280, Math.floor(rect.width || fallbackWidth));
  canvas.width = Math.floor(cssWidth * ratio);
  canvas.height = Math.floor(Number(canvas.getAttribute("height")) * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return { ctx, width: canvas.width / ratio, height: canvas.height / ratio };
}

function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#fffdf9");
  bg.addColorStop(0.58, "#fff8ea");
  bg.addColorStop(1, "#f8eee6");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawEmpty(ctx, width, height, text) {
  clearCanvas(ctx, width, height);
  ctx.fillStyle = "#8d7b69";
  ctx.font = "700 14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);
}

function drawTrendChart() {
  const canvas = $("#trendChart");
  const { ctx, width, height } = setupCanvas(canvas);
  const data = getRangeEntries();
  if (!data.length) {
    $("#trendNote").textContent = "還沒有足夠資料。寫下日記後，這裡會追蹤心情是否往上或往下。";
    return drawEmpty(ctx, width, height, "寫下日記後會顯示折線趨勢");
  }
  clearCanvas(ctx, width, height);

  const pad = 34;
  ctx.strokeStyle = "rgba(214, 194, 172, .55)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#9b8777";
  ctx.font = "700 12px system-ui";
  for (let score = 1; score <= 5; score++) {
    const y = height - pad - ((score - 1) / 4) * (height - pad * 2);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
    ctx.fillText(String(score), 10, y + 4);
  }

  const points = data.map((entry, index) => ({
    x: pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2),
    y: height - pad - ((entry.analysis.avgScore - 1) / 4) * (height - pad * 2),
    score: entry.analysis.avgScore
  }));

  const area = ctx.createLinearGradient(0, pad, 0, height - pad);
  area.addColorStop(0, "rgba(233, 178, 127, .34)");
  area.addColorStop(1, "rgba(255, 248, 234, .08)");
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.lineTo(points[points.length - 1].x, height - pad);
  ctx.lineTo(points[0].x, height - pad);
  ctx.closePath();
  ctx.fillStyle = area;
  ctx.fill();

  const line = ctx.createLinearGradient(pad, 0, width - pad, 0);
  line.addColorStop(0, "#e9b27f");
  line.addColorStop(.55, "#eaa2a0");
  line.addColorStop(1, "#9cc4d7");
  ctx.strokeStyle = line;
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.stroke();

  for (const point of points) {
    ctx.shadowColor = "rgba(153, 107, 74, .18)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#fffdf8";
    ctx.strokeStyle = "#e9b27f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  const first = data[0].analysis.avgScore;
  const last = data[data.length - 1].analysis.avgScore;
  const delta = last - first;
  $("#trendNote").textContent = Math.abs(delta) < 0.2
    ? `近 ${data.length} 篇大致平穩，分數維持在 ${last.toFixed(1)} 附近。`
    : delta > 0
      ? `近 ${data.length} 篇有變亮趨勢，從 ${first.toFixed(1)} 升到 ${last.toFixed(1)}。`
      : `近 ${data.length} 篇有下滑訊號，從 ${first.toFixed(1)} 降到 ${last.toFixed(1)}。`;
}

function drawSignalChart() {
  const canvas = $("#signalChart");
  const { ctx, width, height } = setupCanvas(canvas);
  const data = getRangeEntries();
  if (!data.length) {
    $("#signalNote").textContent = "紅色是 1-2 分、綠色是 3 分、藍色是 4-5 分。";
    return drawEmpty(ctx, width, height, "尚無情緒區間資料");
  }
  clearCanvas(ctx, width, height);
  const buckets = [
    { label: "紅色警訊", count: data.filter((entry) => entry.analysis.avgScore < 3).length, color: "#eaa2a0", hint: "1-2" },
    { label: "綠色穩定", count: data.filter((entry) => entry.analysis.avgScore >= 3 && entry.analysis.avgScore < 4).length, color: "#a9cfa8", hint: "3" },
    { label: "藍色明亮", count: data.filter((entry) => entry.analysis.avgScore >= 4).length, color: "#9cc4d7", hint: "4-5" }
  ];
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const barWidth = Math.min(76, (width - 70) / 3);
  const base = height - 42;
  const usable = height - 86;
  ctx.textAlign = "center";
  ctx.font = "800 12px system-ui";
  buckets.forEach((bucket, index) => {
    const x = 42 + index * ((width - 84) / 2);
    const barHeight = Math.max(8, (bucket.count / maxCount) * usable);
    const gradient = ctx.createLinearGradient(0, base - barHeight, 0, base);
    gradient.addColorStop(0, bucket.color);
    gradient.addColorStop(1, "rgba(255,255,255,.72)");
    roundedRect(ctx, x - barWidth / 2, base - barHeight, barWidth, barHeight, 18);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.fillStyle = "#514236";
    ctx.font = "900 24px system-ui";
    ctx.fillText(String(bucket.count), x, base - barHeight - 10);
    ctx.font = "800 12px system-ui";
    ctx.fillStyle = "#8d7b69";
    ctx.fillText(bucket.label, x, base + 20);
    ctx.fillText(`${bucket.hint} 分`, x, base + 36);
  });
  const dominant = buckets.slice().sort((a, b) => b.count - a.count)[0];
  $("#signalNote").textContent = `${dominant.label}最多，共 ${dominant.count} 篇；紅色代表需要優先休息，藍色代表近期有明顯好感受。`;
}

function drawStressChart() {
  const canvas = $("#stressChart");
  const { ctx, width, height } = setupCanvas(canvas);
  if (!entries.length) {
    $("#stressNote").textContent = "累積紀錄後，這裡會排序最常造成困擾的類別。";
    return drawEmpty(ctx, width, height, "尚無困擾來源資料");
  }
  clearCanvas(ctx, width, height);
  const counts = categoryEventCounts("unhappy");
  const data = CATEGORIES.map((category) => ({ category, count: counts[category] })).sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...data.map((item) => item.count));
  const left = 62;
  const barHeight = 24;
  const gap = 15;
  ctx.font = "800 13px system-ui";
  data.forEach((item, index) => {
    const y = 26 + index * (barHeight + gap);
    ctx.fillStyle = "#8d7b69";
    ctx.fillText(item.category, 12, y + 17);
    roundedRect(ctx, left, y, width - left - 36, barHeight, 12);
    ctx.fillStyle = "rgba(236, 222, 205, .66)";
    ctx.fill();
    const fillWidth = ((width - left - 36) * item.count) / maxCount;
    roundedRect(ctx, left, y, fillWidth, barHeight, 12);
    ctx.fillStyle = item.count ? CATEGORY_COLORS[item.category] : "rgba(255,255,255,.2)";
    ctx.fill();
    ctx.fillStyle = "#514236";
    ctx.fillText(String(item.count), width - 24, y + 17);
  });
  const top = data.find((item) => item.count > 0);
  $("#stressNote").textContent = top
    ? `${top.category} 是目前最常見困擾來源，共出現 ${top.count} 次。`
    : "目前沒有明顯困擾來源，整體紀錄偏平穩。";
}

function drawCategoryChart() {
  const canvas = $("#categoryChart");
  const { ctx, width, height } = setupCanvas(canvas);
  if (!entries.length) {
    $("#categoryNote").textContent = "累積日記後會顯示各類別平均分。";
    return drawEmpty(ctx, width, height, "分類平均會出現在這裡");
  }
  clearCanvas(ctx, width, height);

  const data = CATEGORIES.map((category) => {
    const values = entries.map((entry) => entry.analysis.scores[category]).filter(Number.isFinite);
    return { category, value: values.length ? average(values) : 0 };
  });
  const left = 62;
  const barHeight = 23;
  const gap = 15;
  ctx.font = "800 13px system-ui";

  data.forEach((item, index) => {
    const y = 28 + index * (barHeight + gap);
    ctx.fillStyle = "#8d7b69";
    ctx.fillText(item.category, 12, y + 17);
    roundedRect(ctx, left, y, width - left - 28, barHeight, 12);
    ctx.fillStyle = "rgba(236, 222, 205, .72)";
    ctx.fill();
    const fillWidth = ((width - left - 28) * item.value) / 5;
    const gradient = ctx.createLinearGradient(left, y, left + fillWidth, y);
    gradient.addColorStop(0, CATEGORY_GRADIENTS[item.category][0]);
    gradient.addColorStop(1, CATEGORY_GRADIENTS[item.category][1]);
    roundedRect(ctx, left, y, fillWidth, barHeight, 12);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.fillStyle = "#514236";
    ctx.fillText(item.value ? item.value.toFixed(1) : "-", width - 24, y + 17);
  });
  const scored = data.filter((item) => item.value);
  const lowest = scored.slice().sort((a, b) => a.value - b.value)[0];
  const highest = scored.slice().sort((a, b) => b.value - a.value)[0];
  $("#categoryNote").textContent = lowest && highest
    ? `${lowest.category} 平均最低 ${lowest.value.toFixed(1)}，${highest.category} 平均最高 ${highest.value.toFixed(1)}。`
    : "還沒有足夠類別資料可比較。";
}

function drawBalanceChart() {
  const canvas = $("#balanceChart");
  const { ctx, width, height } = setupCanvas(canvas);
  if (!entries.length) {
    $("#balanceNote").textContent = "開心、困擾、平淡事件會在這裡形成比例。";
    return drawEmpty(ctx, width, height, "開心與困擾比例會出現在這裡");
  }
  clearCanvas(ctx, width, height);

  const happyCount = entries.reduce((sum, entry) => sum + entry.analysis.happy.length, 0);
  const unhappyCount = entries.reduce((sum, entry) => sum + entry.analysis.unhappy.length, 0);
  const neutralCount = Math.max(0, entries.length - happyCount - unhappyCount);
  const data = [
    { label: "開心", value: happyCount, color: "#a9cfa8" },
    { label: "困擾", value: unhappyCount, color: "#eaa2a0" },
    { label: "平淡", value: neutralCount, color: "#ffe0a6" }
  ].filter((item) => item.value > 0);
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let angle = -Math.PI / 2;
  const radius = Math.min(width, height) * 0.32;
  const cx = width / 2;
  const cy = height / 2 - 10;

  ctx.lineWidth = Math.max(18, radius * .32);
  ctx.lineCap = "round";
  for (const item of data) {
    const next = angle + (item.value / total) * Math.PI * 2 - 0.03;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, angle, next);
    ctx.fillStyle = item.color;
    ctx.strokeStyle = item.color;
    ctx.stroke();
    angle = next + 0.08;
  }

  ctx.fillStyle = "#fffdf8";
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(234, 220, 202, .7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#514236";
  ctx.font = "900 24px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(String(total), cx, cy + 8);

  ctx.font = "800 12px system-ui";
  data.forEach((item, index) => {
    const x = 28 + index * 82;
    const y = height - 24;
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y - 10, 14, 14);
    ctx.fillStyle = "#8d7b69";
    ctx.textAlign = "left";
    ctx.fillText(`${item.label} ${item.value}`, x + 20, y + 2);
  });
  const happyRatio = Math.round((happyCount / Math.max(1, happyCount + unhappyCount + neutralCount)) * 100);
  $("#balanceNote").textContent = `正向事件約 ${happyRatio}%；若困擾比例升高，可以回頭看「困擾來源排序」。`;
}

function renderHeatmap() {
  const labels = ["日", "一", "二", "三", "四", "五", "六"];
  const matrix = CATEGORIES.map((category) => labels.map((_, day) => {
    return entries.filter((entry) => {
      const date = new Date(entry.createdAt);
      const inCategory = entry.analysis.happy.includes(category) || entry.analysis.unhappy.includes(category) || entry.analysis.scores[category];
      return date.getDay() === day && inCategory;
    }).length;
  }));

  elements.heatmap.innerHTML = '<div class="heat-label"></div>' + labels.map((x) => `<div class="heat-label">${x}</div>`).join("");
  CATEGORIES.forEach((category, row) => {
    const label = document.createElement("div");
    label.className = "heat-label";
    label.textContent = category;
    elements.heatmap.append(label);
    matrix[row].forEach((count) => {
      const cell = document.createElement("div");
      cell.className = "heat-cell";
      cell.textContent = count || "";
      const alpha = Math.min(0.92, 0.16 + count * 0.18);
      cell.style.background = count ? hexToRgba(CATEGORY_COLORS[category], alpha) : "#f5eadb";
      elements.heatmap.append(cell);
    });
  });
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function exportData() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), entries }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `creamy-diary-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  const imported = Array.isArray(data) ? data : data.entries;
  if (!Array.isArray(imported)) throw new Error("Invalid diary backup");
  entries = imported.map(normalizeEntry).filter(Boolean).concat(entries);
  entries = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
  latestPreviewAnalysis = entries[0]?.analysis || null;
  saveEntries();
  renderAll();
  syncEntries({ silent: true });
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("這個瀏覽器目前不支援語音輸入，可以改用 Chrome 或 Safari 試試。");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "zh-TW";
  recognition.interimResults = false;
  elements.voiceBtn.disabled = true;
  setButtonLabel(elements.voiceBtn, "icon-mic", "聆聽中...");
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    elements.diaryInput.value += `${elements.diaryInput.value.trim() ? "\n" : ""}${transcript}`;
    updatePreview();
  };
  recognition.onend = () => {
    elements.voiceBtn.disabled = false;
    setButtonLabel(elements.voiceBtn, "icon-mic", "語音輸入");
  };
  recognition.onerror = recognition.onend;
  recognition.start();
}

function bindEvents() {
  $$(".tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  elements.diaryInput.addEventListener("input", updatePreview);
  elements.saveBtn.addEventListener("click", saveDiary);
  elements.voiceBtn.addEventListener("click", startVoiceInput);
  elements.sampleBtn.addEventListener("click", () => {
    elements.diaryInput.value = "今天早上工作會議很順利，主管稱讚我的報告很清楚。下午有點累，晚上跟家人講電話時因為小事吵架，心裡有點委屈。不過睡前散步十分鐘後，心情慢慢穩下來。";
    updatePreview();
  });
  elements.rangeSelect.addEventListener("change", scheduleInsightsRender);
  elements.searchInput.addEventListener("input", renderHistory);
  elements.filterSelect.addEventListener("change", renderHistory);
  elements.exportBtn.addEventListener("click", exportData);
  elements.importFile.addEventListener("change", async (event) => {
    try {
      await importData(event.target.files[0]);
      event.target.value = "";
    } catch {
      alert("匯入失敗，請確認檔案格式。");
    }
  });
  elements.syncKeyInput.addEventListener("input", () => {
    const syncKey = getSyncKey();
    if (syncKey) {
      localStorage.setItem(SYNC_KEY_STORAGE, syncKey);
      setSyncStatus("同步代碼已儲存，按「同步資料」即可跨裝置同步。");
    } else {
      localStorage.removeItem(SYNC_KEY_STORAGE);
      setSyncStatus("尚未設定同步代碼。");
    }
  });
  elements.syncNowBtn.addEventListener("click", () => syncEntries());
  elements.clearBtn.addEventListener("click", async () => {
    if (!confirm("確定清除全部日記？這個動作無法復原。")) return;
    const syncKey = getSyncKey();
    entries = [];
    latestPreviewAnalysis = null;
    saveEntries();
    updatePreview();
    renderAll();
    if (!syncKey) return;
    try {
      await fetch(`./api/entries?syncKey=${encodeURIComponent(syncKey)}`, { method: "DELETE" });
      setSyncStatus("本機與同步資料都已清除。", "ok");
    } catch {
      setSyncStatus("本機已清除，但同步資料清除失敗。", "error");
    }
  });
  elements.checkAiBtn.addEventListener("click", async () => {
    const enabled = await checkAiStatus();
    alert(enabled ? "Gemini 代理已啟用，儲存時會自動使用 AI 分析。" : "目前使用本地自動分類；設定 GEMINI_API_KEY 後會自動升級。");
  });
  elements.themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("cozy");
  });
  window.addEventListener("resize", () => {
    if (currentTab === "insights") scheduleInsightsRender();
  });
}

function initServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function init() {
  elements.syncKeyInput.value = localStorage.getItem(SYNC_KEY_STORAGE) || "";
  elements.todayLabel.textContent = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date());
  renderQuickChips();
  bindEvents();
  updatePreview();
  renderAll();
  checkAiStatus();
  syncEntries({ silent: true });
  initServiceWorker();
}

init();
