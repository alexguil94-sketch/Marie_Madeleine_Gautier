// js/supabase-client.js (v4)
(() => {
  "use strict";

  if (window.__MMG_SB_INIT__) return;
  window.__MMG_SB_INIT__ = true;

  const isAbort = (e) =>
    e?.name === "AbortError" || /signal is aborted/i.test(String(e?.message || e || ""));

  // supabase-js can surface AbortError as unhandled rejections (nav/unload/timeouts)
  // Avoid console noise + broken flows when the browser aborts pending requests.
  const swallowAbort = (ev) => {
    const r = ev?.reason || ev?.error || ev?.message;
    if (!isAbort(r)) return;
    try { ev.preventDefault?.(); } catch {}
    try { ev.stopImmediatePropagation?.(); } catch {}
  };

  window.addEventListener("unhandledrejection", swallowAbort, { capture: true });
  window.addEventListener("error", swallowAbort, { capture: true });
  window.onunhandledrejection = (ev) => {
    if (!isAbort(ev?.reason)) return;
    try { ev.preventDefault?.(); } catch {}
    return true;
  };

  // Global state to avoid "wait forever" when Supabase isn't available
  // Status: "loading" | "ready" | "unavailable" | "error"
  window.__MMG_SB_STATUS__ = "loading";

  const cfg = window.MMG_SUPABASE || {
    url: window.SUPABASE_URL,
    anonKey: window.SUPABASE_ANON_KEY,
    bucket: window.SUPABASE_BUCKET || "media",
  };

  if (!window.supabase || !cfg?.url || !cfg?.anonKey) {
    console.warn("[SB] missing supabase or config");
    window.__MMG_SB_STATUS__ = "unavailable";
    // Defer event so late listeners still catch it
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("sb:ready", { detail: null }));
    }, 0);
    return;
  }

  // Si déjà créé ailleurs, on réutilise
  if (window.mmgSupabase) {
    window.__MMG_SB_STATUS__ = "ready";
    document.dispatchEvent(new CustomEvent("sb:ready", { detail: window.mmgSupabase }));
    return;
  }

  let sb = null;
  try {
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (e) {
    console.warn("[SB] createClient error", e);
    window.__MMG_SB_STATUS__ = "error";
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("sb:ready", { detail: null }));
    }, 0);
    return;
  }

  window.mmgSupabase = sb;
  window.__MMG_SB_STATUS__ = "ready";

  // Reduce auth lock contention when multiple modules call getSession at once.
  try {
    const origGetSession = sb.auth.getSession.bind(sb.auth);
    let inflight = null;
    sb.auth.getSession = (...args) => {
      if (inflight) return inflight;
      inflight = origGetSession(...args).finally(() => (inflight = null));
      return inflight;
    };
  } catch {}

  console.log("[SB] client ready", {
    url: cfg.url,
    keyPrefix: String(cfg.anonKey).slice(0, 12),
    keyLength: String(cfg.anonKey).length,
  });

  document.dispatchEvent(new CustomEvent("sb:ready", { detail: sb }));
})();
