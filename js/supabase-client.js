// js/supabase-client.js (v2 clean)
// Crée window.mmgSupabase sans wrapper fetch / AbortController

(() => {
  "use strict";

  if (window.mmgSupabase || window.mmg_supabase) {
    console.log("[SB] client already exists");
    return;
  }

  const cfg = window.MMG_SUPABASE || {};
  const url = cfg.url || window.SUPABASE_URL;
  const anonKey = cfg.anonKey || window.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error("[SB] Missing config. Check js/supabase-config.js (url + anonKey)");
    return;
  }
  if (!window.supabase?.createClient) {
    console.error("[SB] supabase-js missing. Include CDN @supabase/supabase-js@2");
    return;
  }

  const sb = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  window.mmgSupabase = sb;
  window.mmg_supabase = sb;

  console.log("[SB] client ready", { keyPrefix: String(anonKey).slice(0, 12), url });
  document.dispatchEvent(new CustomEvent("sb:ready"));
})();
