// js/supabase-client.js (v3) — SINGLETON
(() => {
  "use strict";

  if (window.__MMG_SB_INIT__) return;     // ✅ empêche double init
  window.__MMG_SB_INIT__ = true;

  const cfg = window.MMG_SUPABASE || {};
  const url = cfg.url || window.SUPABASE_URL;
  const anonKey = cfg.anonKey || window.SUPABASE_ANON_KEY;

  if (!url || !anonKey || !window.supabase?.createClient) {
    console.warn("[SB] missing url/anonKey or supabase.js not loaded");
    return;
  }

  // ✅ storageKey stable (même pour toutes les pages)
  const storageKey = "mmg-auth";

  // ✅ Si tu avais un fetch custom/timeout → on l’enlève (souvent source d’abort)
  window.mmgSupabase = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey,
      flowType: "pkce",
    },
  });

  console.log("[SB] client ready", { url, storageKey });
})();
