const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

const safeJson = async (event) => {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return null;
  }
};

const text = (value) => String(value ?? "").trim();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getIp = (headers = {}) => {
  const all = Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value]));
  const direct = text(all["x-nf-client-connection-ip"]);
  if (direct) return direct;
  return text(String(all["x-forwarded-for"] || "").split(",")[0]) || "unknown";
};

const RATE = new Map();
const CACHE = new Map();
const RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };
const CACHE_TTL_MS = 30 * 60 * 1000;
const SEARCH_UA = String(process.env.MMG_GALLERY_SEARCH_UA || "MMG-Gallery-Search/1.0").trim();
const SEARCH_EMAIL = text(process.env.MMG_GALLERY_SEARCH_EMAIL || "");

const rateLimit = (ip) => {
  const now = Date.now();
  const current = RATE.get(ip);
  if (!current || now >= current.resetAt) {
    RATE.set(ip, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }
  if (current.count >= RATE_LIMIT.limit) return false;
  current.count += 1;
  return true;
};

const requestHeaders = () => ({
  "user-agent": SEARCH_UA,
  accept: "application/json",
});

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...requestHeaders(),
      ...(options.headers || {}),
    },
  });

  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data, raw };
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function bboxFromGeocode(hit) {
  const bbox = Array.isArray(hit?.boundingbox) ? hit.boundingbox : [];
  if (bbox.length !== 4) return null;
  const south = Number.parseFloat(bbox[0]);
  const north = Number.parseFloat(bbox[1]);
  const west = Number.parseFloat(bbox[2]);
  const east = Number.parseFloat(bbox[3]);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  return { south, north, west, east };
}

function buildAddress(tags, fallbackCity, fallbackCountry) {
  const line1 = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const line2 = [tags["addr:postcode"], tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || fallbackCity]
    .filter(Boolean)
    .join(" ");
  const line3 = tags["addr:country"] || fallbackCountry;
  return [line1, line2, line3].filter(Boolean).join(", ");
}

function inferType(tags, requestedType) {
  const haystack = normalize(
    [
      tags.name,
      tags.description,
      tags["description:fr"],
      tags.artist_name,
      tags["subject:wikidata"],
      tags["tourism"],
      tags["shop"],
    ].join(" ")
  );

  if (requestedType && haystack.includes(normalize(requestedType))) return requestedType;
  if (/(sculpt|bronze|marble|stone)/.test(haystack)) return "sculpture";
  if (/(figuratif|figurative|painting|peinture)/.test(haystack)) return "figuratif";
  return requestedType || "contemporain";
}

function scoreResult(result, requestedType) {
  let score = 0;
  if (result.website) score += 2;
  if (result.email) score += 2;
  if (result.address) score += 1;
  if (requestedType && result.type === requestedType) score += 3;
  if (result.sourceTag === "tourism=gallery") score += 2;
  return score;
}

function dedupe(results) {
  const seen = new Set();
  const unique = [];

  for (const result of results) {
    const key = normalize(`${result.name}|${result.website}|${result.address}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(result);
  }

  return unique;
}

async function geocode(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", query);
  if (SEARCH_EMAIL) url.searchParams.set("email", SEARCH_EMAIL);

  const { ok, data, raw, status } = await fetchJson(url.toString());
  if (!ok || !Array.isArray(data) || !data.length) {
    throw new Error(raw || `Nominatim error (${status || "?"})`);
  }

  const hit = data[0];
  const bbox = bboxFromGeocode(hit);
  if (!bbox) throw new Error("Zone de recherche introuvable.");
  if ((bbox.north - bbox.south) * (bbox.east - bbox.west) > 6) {
    throw new Error("Zone trop large. Resserre la recherche a une ville ou un quartier.");
  }

  const city =
    text(hit?.address?.city) ||
    text(hit?.address?.town) ||
    text(hit?.address?.village) ||
    text(hit?.address?.state_district) ||
    text(hit?.display_name.split(",")[0]);

  const country = text(hit?.address?.country);

  return {
    bbox,
    city,
    country,
    label: text(hit?.display_name),
  };
}

async function searchArea({ query, requestedType, limit }) {
  const area = await geocode(query);
  const { south, west, north, east } = area.bbox;

  const overpassQuery = `
[out:json][timeout:25];
(
  nwr["tourism"="gallery"](${south},${west},${north},${east});
  nwr["shop"="art"](${south},${west},${north},${east});
);
out center tags;
  `.trim();

  const { ok, data, raw, status } = await fetchJson("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: new URLSearchParams({ data: overpassQuery }).toString(),
  });

  if (!ok || !Array.isArray(data?.elements)) {
    throw new Error(raw || `Overpass error (${status || "?"})`);
  }

  const results = data.elements
    .map((element) => {
      const tags = element?.tags || {};
      const name = text(tags.name);
      if (!name) return null;

      const website = text(tags.website || tags["contact:website"]);
      const email = text(tags.email || tags["contact:email"]);
      const sourceTag = tags.tourism === "gallery" ? "tourism=gallery" : tags.shop === "art" ? "shop=art" : "other";

      return {
        name,
        city: text(tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || area.city),
        country: text(tags["addr:country"] || area.country),
        address: buildAddress(tags, area.city, area.country),
        email,
        website,
        type: inferType(tags, requestedType),
        status: "a_contacter",
        contactDate: "",
        notes: `Recherche externe OSM (${sourceTag}) pour "${query}".`,
        sourceTag,
      };
    })
    .filter(Boolean);

  const unique = dedupe(results)
    .sort((left, right) => scoreResult(right, requestedType) - scoreResult(left, requestedType))
    .slice(0, limit);

  return {
    location: area.label,
    results: unique,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const ip = getIp(event.headers || {});
  if (!rateLimit(ip)) {
    return json(429, { ok: false, error: "rate_limited" });
  }

  const body = await safeJson(event);
  if (!body) return json(400, { ok: false, error: "invalid_json" });

  const query = text(body.query);
  const requestedType = text(body.type);
  const limit = clamp(Number.parseInt(body.limit || "20", 10) || 20, 1, 40);

  if (!query) {
    return json(400, { ok: false, error: "missing_query" });
  }

  const cacheKey = `${normalize(query)}|${normalize(requestedType)}|${limit}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(200, {
      ok: true,
      location: cached.location,
      results: cached.results,
      cached: true,
    });
  }

  try {
    const payload = await searchArea({ query, requestedType, limit });
    CACHE.set(cacheKey, {
      at: Date.now(),
      location: payload.location,
      results: payload.results,
    });

    return json(200, {
      ok: true,
      location: payload.location,
      results: payload.results,
      cached: false,
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: "gallery_search_failed",
      detail: text(error?.message || error || "search failed"),
    });
  }
};
