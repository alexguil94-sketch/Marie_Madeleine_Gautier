/* admin/js/supabase-client.js
   - Initialise Supabase proprement
   - Force le header apikey (évite les 401 "No API key found")
   - Expose window.SB (client + helpers)
*/

(() => {
  const cfg = window.MMG_SUPABASE || {
    url: window.SUPABASE_URL,
    anonKey: window.SUPABASE_ANON_KEY,
    bucket: window.SUPABASE_BUCKET || "media",
  };

  if (!cfg?.url || !cfg?.anonKey) {
    console.error("[SB] Missing SUPABASE config. Fill js/supabase-config.js");
    return;
  }

  if (!window.supabase?.createClient) {
    console.error("[SB] Supabase JS not loaded. Add CDN supabase-js before this file.");
    return;
  }

  // Custom fetch: always provide 'apikey', and only attach Authorization if it's a real bearer token.
  const customFetch = async (url, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set("apikey", cfg.anonKey);

    // If Authorization is already set, keep it. If it's missing, do nothing:
    // supabase-js will manage auth bearer token in most cases.
    init.headers = headers;

    return fetch(url, init);
  };

  const client = window.supabase.createClient(cfg.url, cfg.anonKey, {
    global: {
      fetch: customFetch,
      headers: { apikey: cfg.anonKey },
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });

  const getPublicUrl = (path) => {
    if (!path) return "";
    try {
      return client.storage.from(cfg.bucket).getPublicUrl(path).data.publicUrl || "";
    } catch {
      return "";
    }
  };

  const slugify = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);

  window.SB = {
    cfg,
    client,
    db: client,
    auth: client.auth,
    storage: client.storage,
    getPublicUrl,
    slugify,
  };

  console.log("[SB] admin client ready", {
    url: cfg.url,
    bucket: cfg.bucket,
    keyPrefix: String(cfg.anonKey).slice(0, 14),
    keyLength: String(cfg.anonKey).length,
  });
})();
