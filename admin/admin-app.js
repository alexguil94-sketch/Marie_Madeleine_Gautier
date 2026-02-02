// admin/admin-app.js (v2 safe)
// - Attend supabase prêt
// - Guard admin AVANT toute requête "Works"
// - Ignore proprement les AbortError (navigation / unload)

(() => {
  "use strict";

  if (window.__MMG_ADMIN_INIT__) return;
  window.__MMG_ADMIN_INIT__ = true;

  const qs = (s, r = document) => r.querySelector(s);

  const errText = (e) =>
    e?.message || e?.error_description || e?.hint || e?.details || String(e || "Erreur");

  const isAbort = (e) =>
    e?.name === "AbortError" || /aborted/i.test(String(e?.message || ""));

  const toast = (msg, type = "info") => {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:10px 12px;border-radius:12px;" +
      "background:" +
      (type === "ok"
        ? "#134e4a"
        : type === "warn"
        ? "#7c2d12"
        : type === "err"
        ? "#7f1d1d"
        : "#111827") +
      ";border:1px solid rgba(255,255,255,.12);color:#fff;z-index:99999;font:14px system-ui";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  };

  async function waitSB(ms = 5000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const sb = window.mmgSupabase || window.mmg_supabase;
      if (sb?.auth?.getSession && sb?.from) return sb;
      await new Promise((r) => setTimeout(r, 80));
    }
    return null;
  }

  function redirectLogin() {
    // si admin dans /admin/, login est à la racine
    const back = encodeURIComponent("/admin/admin.html");
    location.replace(`/login.html?redirect=${back}`);
  }

  function hard404() {
    document.documentElement.innerHTML = `
      <head><meta name="robots" content="noindex,nofollow"></head>
      <body style="font-family:system-ui;background:#0b0b0b;color:#fff;padding:40px">
        <h1 style="margin:0 0 12px">404</h1>
        <p style="opacity:.8;margin:0">Not found.</p>
      </body>`;
  }

  async function ensureAdmin(sb) {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;

    const user = data?.session?.user || null;
    if (!user) return { ok: false, reason: "not_logged" };

    const { data: prof, error: pErr } = await sb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) return { ok: false, reason: "profile_error", error: pErr };
    if (prof?.role !== "admin") return { ok: false, reason: "not_admin" };

    return { ok: true, user };
  }

  async function fetchWorks(sb) {
    const { data, error } = await sb
      .from("works")
      .select("id,title,year,category,description,cover_url,thumb_url,created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  function renderWorks(listEl, works) {
    if (!listEl) return;

    listEl.innerHTML = "";
    if (!works.length) {
      listEl.innerHTML = `<p class="muted">Aucune œuvre pour l’instant.</p>`;
      return;
    }

    works.forEach((w) => {
      const row = document.createElement("div");
      row.className = "admin-item";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.gap = "12px";

      const img = document.createElement("img");
      img.style.cssText =
        "width:64px;height:64px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.12)";
      img.src = w.thumb_url || w.cover_url || "";
      if (!img.src) img.style.background = "rgba(255,255,255,.06)";

      const txt = document.createElement("div");
      txt.innerHTML = `
        <div class="admin-item__meta">${w.year ?? ""} • ${w.category ?? ""}</div>
        <strong>${w.title || "(sans titre)"}</strong>
      `;

      left.appendChild(img);
      left.appendChild(txt);

      row.appendChild(left);
      listEl.appendChild(row);
    });
  }

  async function boot() {
    const sb = await waitSB();
    if (!sb) return hard404();

    console.log("[ADMIN] core ready", { url: (window.MMG_SUPABASE || {}).url || window.SUPABASE_URL });

    // 1) Guard AVANT le reste
    let res;
    try {
      res = await ensureAdmin(sb);
    } catch (e) {
      if (isAbort(e)) return; // navigation/unload
      console.error(e);
      toast(errText(e), "err");
      return hard404();
    }

    if (!res.ok) {
      if (res.reason === "not_logged") return redirectLogin();
      return hard404();
    }

    // 2) UI
    const dash = qs("#dash");
    const loginCard = qs("#loginCard");
    if (loginCard) loginCard.hidden = true;
    if (dash) dash.hidden = false;

    const adminUser = qs("#adminUser");
    if (adminUser) adminUser.textContent = res.user.email || "";

    const btnSignOut = qs("#btnSignOut") || qs("[data-logout]");
    btnSignOut?.addEventListener("click", async () => {
      await sb.auth.signOut();
      toast("Déconnecté.", "ok");
      redirectLogin();
    });

    // 3) Load works (après guard)
    try {
      const works = await fetchWorks(sb);
      renderWorks(qs("#worksList"), works);
    } catch (e) {
      if (isAbort(e)) return;
      console.error(e);
      toast(errText(e), "err");
    }
  }

  window.addEventListener("DOMContentLoaded", boot);
})();
