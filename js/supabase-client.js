// js/supabase-client.js
(() => {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("[SB] Config missing", { url, hasKey: !!key });
    return;
  }

  if (!window.supabase?.createClient) {
    console.error("[SB] Supabase UMD not loaded. window.supabase =", window.supabase);
    return;
  }

  window.sb = window.supabase.createClient(url, key);
  console.log("[SB] client ready");
})();
