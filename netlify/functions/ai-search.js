// netlify/functions/ai-search.js
// Public helper: semantic search over published works using OpenAI embeddings.

const fs = require("fs");
const path = require("path");

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

const safeJson = async (req) => {
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return null;
  }
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const getIp = (headers = {}) => {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v]));
  const direct = String(h["x-nf-client-connection-ip"] || "").trim();
  if (direct) return direct;
  const fwd = String(h["x-forwarded-for"] || "").split(",")[0]?.trim();
  return fwd || "unknown";
};

// Very small, best-effort in-memory rate limiter (per warm instance).
const RATE = new Map(); // ip -> { count, resetAt }
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

const postJson = async (url, headers, bodyObj) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(bodyObj ?? {}),
  });
  const txt = await res.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, raw: txt };
};

const getJson = async (url, headers) => {
  const res = await fetch(url, { headers: { ...headers } });
  const txt = await res.text();
  let data = null;
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, raw: txt };
};

const workToText = (w) => {
  const title = String(w?.title || "").trim();
  const year = w?.year ? String(w.year).trim() : "";
  const category = String(w?.category || "").trim();
  const description = String(w?.description || "").trim();

  const out = [];
  if (title) out.push(`Titre: ${title}`);
  if (year) out.push(`Année: ${year}`);
  if (category) out.push(`Catégorie: ${category}`);
  if (description) out.push(`Description: ${description}`);
  return out.join(" | ");
};

const norm = (vec) => {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  return Math.sqrt(sum) || 0;
};

const cosine = (a, b, normA, normB) => {
  const denom = (normA || 0) * (normB || 0);
  if (!denom) return 0;
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot / denom;
};

let CACHE = {
  at: 0,
  works: [],
  vectors: [],
  norms: [],
  model: "",
  source: "",
};

const TTL_MS = 10 * 60 * 1000;

async function loadWorksFromSupabase({ supabaseUrl, supabaseAnonKey }) {
  const base = supabaseUrl.replace(/\/+$/, "");
  const url =
    `${base}/rest/v1/works` +
    `?select=id,title,year,category,description,cover_url,thumb_url,images,sort,created_at,is_published` +
    `&is_published=eq.true` +
    `&order=sort.asc` +
    `&order=created_at.desc` +
    `&limit=500`;

  const { ok, data } = await getJson(url, {
    apikey: supabaseAnonKey,
    authorization: `Bearer ${supabaseAnonKey}`,
  });

  if (!ok || !Array.isArray(data)) return [];
  return data;
}

function loadWorksFromLocalFile() {
  try {
    const p = path.join(process.cwd(), "data", "works.json");
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((x, i) => ({
      id: x?.id || `demo-${i}`,
      title: x?.title || "",
      year: x?.year || "",
      category: x?.category || "",
      description: x?.description || "",
      cover_url: x?.src || x?.cover_url || "",
      thumb_url: x?.thumb || x?.thumb_url || "",
      images: Array.isArray(x?.images) ? x.images : [],
      sort: x?.sort ?? i,
      created_at: x?.created_at || "",
      is_published: true,
    }));
  } catch {
    return [];
  }
}

async function ensureCache({ openaiKey, embeddingsModel, supabaseUrl, supabaseAnonKey }) {
  const now = Date.now();
  if (CACHE.at && now - CACHE.at < TTL_MS && CACHE.vectors.length === CACHE.works.length) return CACHE;

  let works = [];
  let source = "local";
  if (supabaseUrl && supabaseAnonKey) {
    works = await loadWorksFromSupabase({ supabaseUrl, supabaseAnonKey });
    source = "supabase";
  }
  if (!works.length) works = loadWorksFromLocalFile();

  if (!works.length) {
    CACHE = { at: now, works: [], vectors: [], norms: [], model: embeddingsModel, source };
    return CACHE;
  }

  const texts = works.map(workToText);
  const { ok, status, data, raw } = await postJson(
    "https://api.openai.com/v1/embeddings",
    { authorization: `Bearer ${openaiKey}` },
    { model: embeddingsModel, input: texts, encoding_format: "float" }
  );

  if (!ok || !Array.isArray(data?.data)) {
    throw new Error(data?.error?.message || raw || `Embeddings error (${status || "?"})`);
  }

  const vectors = data.data
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((x) => x.embedding);

  const norms = vectors.map(norm);

  CACHE = {
    at: now,
    works,
    vectors,
    norms,
    model: data?.model || embeddingsModel,
    source,
  };

  return CACHE;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const openaiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!openaiKey) return json(501, { ok: false, error: "missing_openai_key" });

  const ip = getIp(event.headers || {});
  const rl = rateLimit(ip, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });

  const body = await safeJson(event);
  if (!body) return json(400, { ok: false, error: "invalid_json" });

  const query = String(body.q || body.query || "").trim();
  if (!query) return json(400, { ok: false, error: "missing_query" });
  if (query.length > 300) return json(400, { ok: false, error: "query_too_long" });

  const limit = clamp(parseInt(body.limit || 12, 10) || 12, 1, 24);

  const embeddingsModel = String(process.env.OPENAI_EMBEDDINGS_MODEL || "text-embedding-3-small").trim();
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();

  let cache;
  try {
    cache = await ensureCache({ openaiKey, embeddingsModel, supabaseUrl, supabaseAnonKey });
  } catch (e) {
    return json(500, { ok: false, error: "cache_error", detail: String(e?.message || e || "error") });
  }

  if (!cache.works.length) return json(200, { ok: true, results: [], meta: { source: cache.source } });

  const qEmb = await postJson(
    "https://api.openai.com/v1/embeddings",
    { authorization: `Bearer ${openaiKey}` },
    { model: embeddingsModel, input: query, encoding_format: "float" }
  );

  if (!qEmb.ok || !Array.isArray(qEmb.data?.data) || !qEmb.data.data[0]?.embedding) {
    return json(qEmb.status || 500, {
      ok: false,
      error: "openai_error",
      detail: qEmb.data?.error?.message || qEmb.raw || "Unknown error",
    });
  }

  const qVec = qEmb.data.data[0].embedding;
  const qNorm = norm(qVec);

  const scored = cache.works.map((w, idx) => ({
    w,
    score: cosine(cache.vectors[idx] || [], qVec, cache.norms[idx] || 0, qNorm),
  }));

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).map((x) => ({
    id: x.w.id,
    score: Number.isFinite(x.score) ? Number(x.score.toFixed(4)) : 0,
    title: x.w.title || "",
    year: x.w.year || "",
    category: x.w.category || "",
    description: x.w.description || "",
    cover_url: x.w.cover_url || "",
    thumb_url: x.w.thumb_url || "",
    images: Array.isArray(x.w.images) ? x.w.images : [],
  }));

  return json(200, {
    ok: true,
    results: top,
    meta: {
      model: qEmb.data?.model || embeddingsModel,
      source: cache.source,
      cached_at: cache.at ? new Date(cache.at).toISOString() : null,
    },
  });
};

