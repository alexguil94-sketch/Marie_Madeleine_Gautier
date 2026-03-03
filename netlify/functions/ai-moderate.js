// netlify/functions/ai-moderate.js
// Admin-only helper: calls OpenAI Moderation API for a given text.

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

const readBearer = (hdr) => {
  const v = String(hdr || "").trim();
  const m = v.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ? m[1].trim() : "";
};

const safeJson = async (req) => {
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return null;
  }
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

const isAdmin = async ({ supabaseUrl, supabaseAnonKey, accessToken }) => {
  if (!supabaseUrl || !supabaseAnonKey || !accessToken) return false;

  const rpcUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/is_admin`;
  const { ok, data } = await postJson(
    rpcUrl,
    {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${accessToken}`,
    },
    {}
  );

  if (!ok) return false;
  return data === true;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const openaiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!openaiKey) return json(501, { ok: false, error: "missing_openai_key" });

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();

  const accessToken = readBearer(event.headers?.authorization || event.headers?.Authorization);
  if (!accessToken) return json(401, { ok: false, error: "missing_auth" });

  const admin = await isAdmin({ supabaseUrl, supabaseAnonKey, accessToken });
  if (!admin) return json(403, { ok: false, error: "forbidden" });

  const body = await safeJson(event);
  if (!body) return json(400, { ok: false, error: "invalid_json" });

  const input = String(body.input || body.text || "").trim();
  if (!input) return json(400, { ok: false, error: "missing_input" });
  if (input.length > 4000) return json(400, { ok: false, error: "input_too_long" });

  const model = String(process.env.OPENAI_MODERATION_MODEL || "omni-moderation-latest").trim();

  const { ok, status, data, raw } = await postJson(
    "https://api.openai.com/v1/moderations",
    { authorization: `Bearer ${openaiKey}` },
    { model, input }
  );

  if (!ok) {
    return json(status || 500, {
      ok: false,
      error: "openai_error",
      detail: data?.error?.message || raw || "Unknown error",
    });
  }

  const result = Array.isArray(data?.results) ? data.results[0] : null;
  const flagged = !!result?.flagged;

  return json(200, {
    ok: true,
    model: data?.model || model,
    flagged,
    action: flagged ? "review" : "approve",
    categories: result?.categories || {},
    category_scores: result?.category_scores || {},
  });
};

