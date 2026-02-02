// js/supabase-client.js (v3)
(() => {
  "use strict";

  if (window.__MMG_SB_INIT__) return;
  window.__MMG_SB_INIT__ = true;

  const cfg = window.MMG_SUPABASE || {
    url: window.SUPABASE_URL,
    anonKey: window.SUPABASE_ANON_KEY,
    bucket: window.SUPABASE_BUCKET || "media",
  };

  if (!window.supabase || !cfg?.url || !cfg?.anonKey) {
    console.warn("[SB] missing supabase or config");
    return;
  }

  // Si déjà créé ailleurs, on réutilise
  if (window.mmgSupabase) {
    document.dispatchEvent(new CustomEvent("sb:ready", { detail: window.mmgSupabase }));
    return;
  }

  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "mmg_auth_v1",
      storage: window.localStorage,
    },
  });

  window.mmgSupabase = sb;

  console.log("[SB] client ready", {
    url: cfg.url,
    keyPrefix: String(cfg.anonKey).slice(0, 12),
    keyLength: String(cfg.anonKey).length,
  });

  document.dispatchEvent(new CustomEvent("sb:ready", { detail: sb }));
})();
