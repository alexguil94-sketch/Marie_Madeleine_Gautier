/* admin/js/admin-core.js
   Core helpers + Supabase client.
   Requires:
   - window.MMG_SUPABASE = { url, anonKey, bucket }
   - supabase-js v2 loaded (window.supabase.createClient)
*/

(() => {
  const Admin = (window.Admin = window.Admin || {});

  Admin.cfg = (() => {
    const c = window.MMG_SUPABASE || {};
    const url = c.url || window.SUPABASE_URL;
    const anonKey = c.anonKey || window.SUPABASE_ANON_KEY;
    const bucket = c.bucket || window.SUPABASE_BUCKET || "media";
    return { url, anonKey, bucket };
  })();

  Admin.assertConfigured = () => {
    const { url, anonKey } = Admin.cfg;
    if (!url || !anonKey) {
      throw new Error(
        "Supabase non configuré. Vérifie js/supabase-config.js (url + anonKey)."
      );
    }
    if (!window.supabase?.createClient) {
      throw new Error(
        "supabase-js manquant. Ajoute <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'></script> avant tes scripts admin."
      );
    }
  };

  Admin.initClient = () => {
    Admin.assertConfigured();
    // Si tu as déjà un client global (ex: window.mmgSupabase), on le réutilise
    const existing = window.mmgSupabase || window.mmg_supabase || window.supabaseClient;
    if (existing?.auth && existing?.from) {
      Admin.sb = existing;
      return Admin.sb;
    }

    const { url, anonKey } = Admin.cfg;

    Admin.sb = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    return Admin.sb;
  };

  Admin.sb = Admin.initClient();

  // DOM helpers
  Admin.qs = (sel, root = document) => root.querySelector(sel);
  Admin.qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  Admin.toast = (msg, type = "info") => {
    // ultra-simple toast fallback
    // type: info | ok | warn | err
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "16px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.zIndex = "99999";
    el.style.font = "14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    el.style.boxShadow = "0 6px 18px rgba(0,0,0,.25)";
    el.style.background =
      type === "ok"
        ? "#134e4a"
        : type === "warn"
        ? "#7c2d12"
        : type === "err"
        ? "#7f1d1d"
        : "#111827";
    el.style.color = "#fff";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  };

  Admin.errText = (e) => {
    if (!e) return "Erreur inconnue";
    if (typeof e === "string") return e;
    return e?.message || e?.error_description || JSON.stringify(e);
  };

  Admin.publicUrl = (path) => {
    if (!path) return "";
    const { bucket } = Admin.cfg;
    const { data } = Admin.sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  };

  // Optional audit (si tu crées la table audit_log)
  Admin.audit = async (action, entity, entityId, meta = {}) => {
    try {
      await Admin.sb.from("audit_log").insert({
        action,
        entity,
        entity_id: String(entityId ?? ""),
        meta,
      });
    } catch {
      // ignore si la table n’existe pas
    }
  };

  console.log("[ADMIN] core ready", {
    url: Admin.cfg.url,
    bucket: Admin.cfg.bucket,
  });
})();
