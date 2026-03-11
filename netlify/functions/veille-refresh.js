// netlify/functions/veille-refresh.js
// Trigger a fresh Veille scan on demand and return the generated JSON payload.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

const getIp = (headers = {}) => {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v]));
  const direct = String(h["x-nf-client-connection-ip"] || "").trim();
  if (direct) return direct;
  const forwarded = String(h["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwarded || "unknown";
};

const RATE = new Map();
const rateLimit = (ip, { limit, windowMs }) => {
  const now = Date.now();
  const cur = RATE.get(ip);
  if (!cur || now >= cur.resetAt) {
    RATE.set(ip, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (cur.count >= limit) return { ok: false, remaining: 0, resetAt: cur.resetAt };
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count, resetAt: cur.resetAt };
};

const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MMG-Veille/1.0";
const REQUEST_TIMEOUT_MS = Number(process.env.MMG_VEILLE_LIVE_HTTP_TIMEOUT_MS || 8000);
const MAX_LINKS_PER_SOURCE = Number(process.env.MMG_VEILLE_LIVE_MAX_LINKS || 80);
const LIMIT_ITEMS = Number(process.env.MMG_VEILLE_LIVE_LIMIT_ITEMS || 80);
const STRICT_FILTER = true;

const BLOCKLIST_SUBSTRINGS = [
  "login",
  "sign-in",
  "signin",
  "sign up",
  "signup",
  "register",
  "account",
  "privacy",
  "cookies",
  "terms",
  "mentions-legales",
  "legal",
  "gdpr",
  "contact",
  "about",
  "faq",
  "help",
  "support",
  "sitemap",
  "newsletter",
  "subscribe",
  "donate",
  "shop",
  "cart",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
];

const OPPORTUNITY_HINTS = [
  "open call",
  "call for",
  "opportunity",
  "opportunities",
  "rfq",
  "rfp",
  "rfc",
  "request for qualifications",
  "request for proposals",
  "commission",
  "public art",
  "artist fee",
  "honorarium",
  "budget",
  "apply",
  "application",
  "deadline",
  "submission",
  "submit",
  "residency",
  "residence",
  "exhibition",
  "symposium",
  "appel",
  "candidature",
  "date limite",
];

const BLOCKED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".mov", ".zip", ".pdf"];

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

const TLD_TO_REGION = {
  ".fr": "France",
  ".uk": "UK",
  ".gb": "UK",
  ".de": "Germany",
  ".nl": "Netherlands",
  ".be": "Belgium",
  ".ch": "Switzerland",
  ".it": "Italy",
  ".es": "Spain",
  ".pt": "Portugal",
  ".ie": "Ireland",
  ".se": "Sweden",
  ".no": "Norway",
  ".dk": "Denmark",
  ".fi": "Finland",
  ".pl": "Poland",
  ".at": "Austria",
  ".cz": "Czechia",
  ".ca": "Canada",
  ".us": "USA",
  ".au": "Australia",
  ".nz": "New Zealand",
};

const COUNTRY_WORDS = [
  "france",
  "usa",
  "united states",
  "canada",
  "australia",
  "uk",
  "united kingdom",
  "germany",
  "netherlands",
  "belgium",
  "switzerland",
  "italy",
  "spain",
  "portugal",
  "ireland",
  "europe",
  "international",
  "worldwide",
  "global",
];

const execFile = (command, args, { cwd, timeoutMs }) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        finish({
          ok: false,
          code: null,
          stdout,
          stderr: `${stderr}\nProcess timed out after ${timeoutMs}ms`.trim(),
        });
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      finish({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\n${String(error?.message || error || "spawn error")}`.trim(),
      });
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      finish({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });

const pythonLaunchers = [
  { command: "py", prefix: ["-3"] },
  { command: "python3", prefix: [] },
  { command: "python", prefix: [] },
];

const boolEnv = (name) => /^(1|true|yes|on)$/i.test(String(process.env[name] || "").trim());

async function resolvePython(cwd) {
  for (const launcher of pythonLaunchers) {
    const probe = await execFile(launcher.command, [...launcher.prefix, "--version"], {
      cwd,
      timeoutMs: 4000,
    });
    if (probe.ok) return launcher;
  }
  return null;
}

async function runPythonScan({ cwd, scriptPath, outPath }) {
  const launcher = await resolvePython(cwd);
  if (!launcher) {
    throw new Error("python_unavailable");
  }

  const args = [
    ...launcher.prefix,
    scriptPath,
    "--out",
    outPath,
    "--timeout",
    String(process.env.MMG_VEILLE_LIVE_TIMEOUT || 5),
    "--max-links",
    String(MAX_LINKS_PER_SOURCE),
    "--limit-items",
    String(LIMIT_ITEMS),
  ];

  const result = await execFile(launcher.command, args, {
    cwd,
    timeoutMs: Number(process.env.MMG_VEILLE_LIVE_PROCESS_TIMEOUT_MS || 45000),
  });

  if (!result.ok) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(detail || `scan_failed (${launcher.command})`);
  }

  const raw = fs.readFileSync(outPath, "utf8");
  const data = JSON.parse(raw || "{}");
  return {
    generatedAt: String(data?.generatedAt || ""),
    items: Array.isArray(data?.items) ? data.items : [],
    meta: {
      runner: "python",
      launcher: `${launcher.command} ${launcher.prefix.join(" ")}`.trim(),
    },
  };
}

const loadLines = (filePath) => {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch {
    return [];
  }
};

const normalizeText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const decodeHtml = (value) =>
  String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 0))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16) || 0))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const stripTags = (value) =>
  decodeHtml(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

const extractAttr = (attrs, name) => {
  const re = new RegExp(`${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(attrs || "").match(re);
  return decodeHtml(match?.[1] || match?.[2] || match?.[3] || "").trim();
};

const isoNow = () => new Date().toISOString().slice(0, 19);

const refineTitle = (title, context) => {
  let next = String(title || "").replace(/\s+/g, " ").trim();
  next = next.replace(/\s+Report this\?\s*$/i, "").trim();

  const lower = next.toLowerCase();
  const isGeneric = !next || lower === "lien" || lower === "link" || next.length < 2;
  const isPager = /^[<>«»]+$/.test(next) || /^\d{1,3}$/.test(next);

  if (isGeneric || isPager) {
    let ctx = String(context || "").replace(/\s+/g, " ").trim();
    ctx = ctx.split(/Report this\?/i)[0].trim();
    ctx = ctx.split(/\b(?:Deadline|Date limite)\b/i)[0].trim();
    ctx = ctx.replace(/^[\s\-|•]+|[\s\-|•]+$/g, "");
    if (ctx.length >= 3) next = ctx;
  }

  if (!next) return "Lien";
  if (next.length > 140) return `${next.slice(0, 140).trimEnd()}…`;
  return next;
};

const safeDomain = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": String(process.env.MMG_VEILLE_UA || DEFAULT_USER_AGENT) },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractLinksWithContext(sourceUrl, html, { maxLinks }) {
  const out = [];
  const re = /<a\b([^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*)>([\s\S]*?)<\/a>/gi;
  let match = null;

  while ((match = re.exec(html)) && out.length < maxLinks) {
    const rawHref = match[2] || match[3] || match[4] || "";
    if (!rawHref) continue;

    let absUrl = "";
    try {
      absUrl = new URL(rawHref, sourceUrl).toString();
    } catch {
      continue;
    }

    if (/^(mailto:|tel:|javascript:)/i.test(absUrl)) continue;

    const attrs = match[1] || "";
    const innerHtml = match[5] || "";
    let title = stripTags(innerHtml);

    if (!title) title = extractAttr(attrs, "aria-label") || extractAttr(attrs, "title");
    if (!title) {
      const imgTitle = innerHtml.match(/<img\b([^>]+)>/i);
      if (imgTitle) title = extractAttr(imgTitle[1], "alt");
    }

    const contextHtml = html.slice(Math.max(0, match.index - 140), Math.min(html.length, re.lastIndex + 460));
    const context = stripTags(contextHtml).slice(0, 520);
    title = refineTitle(title, context);

    let imageUrl = "";
    const imgMatch = innerHtml.match(/<img\b([^>]+)>/i) || contextHtml.match(/<img\b([^>]+)>/i);
    if (imgMatch) {
      const src =
        extractAttr(imgMatch[1], "src") ||
        extractAttr(imgMatch[1], "data-src") ||
        extractAttr(imgMatch[1], "data-lazy-src");
      if (src) {
        try {
          imageUrl = new URL(src, sourceUrl).toString();
        } catch {}
      }
    }

    out.push({ absUrl, title, context, imageUrl });
  }

  return out;
}

function looksLikeNoise(url, title, context) {
  const hay = normalizeText(`${url} ${title} ${context}`);
  if (String(url || "").trim().endsWith("#")) return true;

  try {
    const parsed = new URL(url);
    const lowerPath = parsed.pathname.toLowerCase();
    if (BLOCKED_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) return true;
    if (lowerPath.startsWith("/report") || lowerPath.includes("/report/")) return true;
  } catch {}

  return BLOCKLIST_SUBSTRINGS.some((bad) => hay.includes(bad));
}

function looksLikeOpportunity(url, title, context) {
  const hay = normalizeText(`${url} ${title} ${context}`);
  return OPPORTUNITY_HINTS.some((hint) => hay.includes(hint));
}

function keywordMatches(keywords, title, url, context) {
  const lowerTitle = normalizeText(title);
  let lowerUrl = normalizeText(url);
  try {
    const parsed = new URL(url);
    lowerUrl = normalizeText(`${parsed.pathname} ${parsed.search} ${parsed.hash}`);
  } catch {}
  const lowerContext = normalizeText(context);

  const out = [];
  const seen = new Set();
  for (const keyword of keywords) {
    const normalized = normalizeText(keyword);
    if (!normalized) continue;
    if (lowerTitle.includes(normalized) || lowerUrl.includes(normalized) || lowerContext.includes(normalized)) {
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(keyword);
    }
  }
  return out;
}

function computeScore(matched, title, url, context) {
  let score = 25 + matched.length * 10;
  const hay = normalizeText(`${title} ${url} ${context}`);
  const boosts = ["public art", "rfq", "rfp", "commission", "apply", "deadline", "budget", "honorarium"];
  score += boosts.reduce((sum, term) => (hay.includes(term) ? sum + 8 : sum), 0);
  return Math.max(0, Math.min(100, score));
}

function extractDeadlineIso(text) {
  const lower = normalizeText(text);

  let match = lower.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/);
  if (match) {
    return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
  }

  match = lower.match(/\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})\b/);
  if (match) {
    return `${match[3]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
  }

  match = lower.match(/\b(0?[1-9]|[12]\d|3[01])\s+([a-z]+)\s+(20\d{2})\b/);
  if (match && MONTHS[match[2]]) {
    return `${match[3]}-${String(MONTHS[match[2]]).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
  }

  match = lower.match(/\b([a-z]+)\s+(0?[1-9]|[12]\d|3[01])[, ]+\s*(20\d{2})\b/);
  if (match && MONTHS[match[1]]) {
    return `${match[3]}-${String(MONTHS[match[1]]).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
  }

  return "";
}

function detectCountryOrRegion(url, context) {
  const host = safeDomain(url);
  for (const [tld, region] of Object.entries(TLD_TO_REGION)) {
    if (host.endsWith(tld)) return region;
  }

  const lower = normalizeText(context);
  for (const word of COUNTRY_WORDS) {
    if (!lower.includes(word)) continue;
    if (word === "usa" || word === "united states") return "USA";
    if (word === "uk" || word === "united kingdom") return "UK";
    if (word === "international" || word === "worldwide" || word === "global") return "International";
    return word
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "—";
}

async function scanSourceJs(sourceUrl, keywords) {
  const detectedAt = isoNow();
  try {
    const html = await fetchHtml(sourceUrl);
    const links = extractLinksWithContext(sourceUrl, html, { maxLinks: MAX_LINKS_PER_SOURCE });
    const items = [];

    for (const { absUrl, title, context, imageUrl } of links) {
      if (STRICT_FILTER && looksLikeNoise(absUrl, title, context)) continue;
      if (STRICT_FILTER && !looksLikeOpportunity(absUrl, title, context)) continue;

      const matched = keywordMatches(keywords, title, absUrl, context);
      if (!matched.length) continue;

      const contextPack = `${title} ${context}`;
      items.push({
        source_url: sourceUrl,
        title,
        url: absUrl,
        matched_keywords: matched,
        score: computeScore(matched, title, absUrl, contextPack),
        country_or_region: detectCountryOrRegion(absUrl, contextPack),
        deadline: extractDeadlineIso(contextPack),
        detected_at: detectedAt,
        context,
        image_url: imageUrl,
      });
    }

    return items;
  } catch (error) {
    console.warn(`[veille-refresh] source failed: ${sourceUrl}`, String(error?.message || error || "error"));
    return [];
  }
}

async function runJsScan(cwd) {
  const sources = loadLines(path.join(cwd, "tools", "veille", "sources.txt"));
  const keywords = loadLines(path.join(cwd, "tools", "veille", "keywords.txt"));
  if (!sources.length || !keywords.length) {
    throw new Error("missing_scan_inputs");
  }

  const perSource = await Promise.all(sources.map((sourceUrl) => scanSourceJs(sourceUrl, keywords)));
  const seen = new Set();
  const merged = [];

  for (const list of perSource) {
    for (const item of list) {
      const key = String(item.url || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  merged.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    const ad = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
    const bd = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
  });

  return {
    generatedAt: isoNow(),
    items: merged.slice(0, LIMIT_ITEMS),
    meta: {
      runner: "js",
    },
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const ip = getIp(event.headers || {});
  const rl = rateLimit(ip, { limit: 12, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });

  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "tools", "veille", "scan.py");
  const outPath = path.join(
    os.tmpdir(),
    `mmg-veille-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );

  let payload = null;
  let pythonError = "";

  try {
    if (!boolEnv("MMG_VEILLE_FORCE_JS") && fs.existsSync(scriptPath)) {
      payload = await runPythonScan({ cwd, scriptPath, outPath });
    }
  } catch (error) {
    pythonError = String(error?.message || error || "python_scan_failed");
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {}
  }

  if (!payload) {
    try {
      payload = await runJsScan(cwd);
      if (pythonError) {
        payload.meta = {
          ...payload.meta,
          python_fallback: pythonError,
        };
      }
    } catch (error) {
      return json(500, {
        ok: false,
        error: "scan_failed",
        detail: pythonError || String(error?.message || error || "scan failed"),
      });
    }
  }

  return json(200, {
    ok: true,
    generatedAt: String(payload.generatedAt || ""),
    items: Array.isArray(payload.items) ? payload.items : [],
    meta: payload.meta || {},
  });
};
