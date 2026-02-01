/* admin/admin-app.js
   Bundle: core + auth + works + init (ordre garanti)
*/

(() => {
  // -----------------
  // CORE
  // -----------------
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
      throw new Error("Supabase non configuré. Vérifie js/supabase-config.js (url + anonKey).");
    }
    if (!window.supabase?.createClient) {
      throw new Error("supabase-js manquant. Ajoute le CDN @supabase/supabase-js@2 avant admin-app.js");
    }
  };

  Admin.initClient = () => {
    Admin.assertConfigured();
    const existing = window.mmgSupabase || window.mmg_supabase || window.supabaseClient;
    if (existing?.auth && existing?.from) return (Admin.sb = existing);

    Admin.sb = window.supabase.createClient(Admin.cfg.url, Admin.cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return Admin.sb;
  };

  Admin.sb = Admin.initClient();

  Admin.qs = (sel, root = document) => root.querySelector(sel);

  Admin.toast = (msg, type = "info") => {
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
      type === "ok" ? "#134e4a" : type === "warn" ? "#7c2d12" : type === "err" ? "#7f1d1d" : "#111827";
    el.style.color = "#fff";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  };

  Admin.errText = (e) => (e?.message || e?.error_description || String(e || "Erreur inconnue"));

  Admin.publicUrl = (path) => {
    if (!path) return "";
    const { data } = Admin.sb.storage.from(Admin.cfg.bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  };

  console.log("[ADMIN] core ready", { url: Admin.cfg.url, bucket: Admin.cfg.bucket });

  // -----------------
  // AUTH
  // -----------------
  Admin.getUser = async () => {
    const { data, error } = await Admin.sb.auth.getUser();
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  };

  Admin.getMyRole = async (userId) => {
    const { data, error } = await Admin.sb.from("profiles").select("role").eq("id", userId).maybeSingle();
    return { role: data?.role || null, error };
  };

  Admin.ensureAdmin = async () => {
    const { user, error: uErr } = await Admin.getUser();
    if (uErr || !user) return { ok: false, reason: "not_logged" };

    const { role, error: rErr } = await Admin.getMyRole(user.id);
    if (rErr) return { ok: false, reason: "role_error", error: rErr };
    if (role !== "admin") return { ok: false, reason: "not_admin" };

    return { ok: true, user, role };
  };

  Admin.redirectToLogin = () => {
    const redirect = encodeURIComponent("/admin/");
    location.href = `/login.html?redirect=${redirect}`;
  };

  Admin.bindLogout = () => {
    const btn = Admin.qs("#btnSignOut") || Admin.qs("[data-logout]");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      await Admin.sb.auth.signOut();
      Admin.toast("Déconnecté.", "ok");
      Admin.redirectToLogin();
    });
  };

  // -----------------
  // WORKS (compatible avec TON HTML)
  // -----------------
  const sb = Admin.sb;
  const bucket = Admin.cfg.bucket;

  const form = Admin.qs("#workForm");
  const list = Admin.qs("#worksList"); // IMPORTANT
  const msg = Admin.qs("#workMsg");

  const inputFiles = Admin.qs("#workImages");
  const drop = Admin.qs("#workDrop");
  const preview = Admin.qs("#workPreview");
  const dropMeta = Admin.qs("#workDropMeta");

  let files = [];

  const setMsg = (t = "") => { if (msg) msg.textContent = t; };

  const extOf = (name) => ((name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg");

  const renderPreviews = () => {
    if (!preview) return;
    preview.innerHTML = "";
    if (dropMeta) dropMeta.textContent = files.length ? `${files.length} fichier(s) sélectionné(s)` : "";

    files.forEach((f, idx) => {
      const card = document.createElement("div");
      card.className = "dz-thumb";

      const img = document.createElement("img");
      img.alt = f.name;
      img.src = URL.createObjectURL(f);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.addEventListener("click", () => {
        files.splice(idx, 1);
        renderPreviews();
      });

      card.appendChild(img);
      card.appendChild(btn);
      preview.appendChild(card);
    });
  };

  const setFiles = (incoming) => {
    const arr = Array.from(incoming || []);
    files = [...files, ...arr].slice(0, 10);
    renderPreviews();
  };

  if (drop && inputFiles) {
    drop.addEventListener("click", () => inputFiles.click());
    inputFiles.addEventListener("change", () => {
      setFiles(inputFiles.files);
      inputFiles.value = "";
    });

    ["dragenter", "dragover"].forEach((ev) => {
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach((ev) => {
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-over"); });
    });
    drop.addEventListener("drop", (e) => {
      if (e.dataTransfer?.files?.length) setFiles(e.dataTransfer.files);
    });
  }

  const uploadOne = async (path, file) => {
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (error) throw error;
  };

  const fetchWorks = async () => {
    const { data, error } = await sb
      .from("works")
      .select("id,title,year,category,description,status,sort_order,image_path,updated_at")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  };

  const renderList = (works) => {
    if (!list) return;
    list.innerHTML = "";
    if (!works.length) {
      list.innerHTML = `<p class="muted">Aucune œuvre pour l’instant.</p>`;
      return;
    }
    works.forEach((w) => {
      const row = document.createElement("div");
      row.className = "admin-item";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.gap = "12px";

      const thumb = document.createElement("img");
      thumb.style.width = "64px";
      thumb.style.height = "64px";
      thumb.style.objectFit = "cover";
      thumb.style.borderRadius = "14px";
      thumb.style.border = "1px solid rgba(255,255,255,.12)";
      thumb.src = w.image_path ? Admin.publicUrl(w.image_path) : "";

      const txt = document.createElement("div");
      txt.innerHTML = `<div class="admin-item__meta">${w.status || "—"} • ${w.year ?? ""}</div><strong>${w.title}</strong>`;

      left.appendChild(thumb);
      left.appendChild(txt);

      const actions = document.createElement("div");
      actions.className = "admin-actions";

      const b = document.createElement("button");
      b.className = "btn";
      b.type = "button";
      b.textContent = w.status === "published" ? "Dépublier" : "Publier";
      b.onclick = async () => {
        const next = w.status === "published" ? "draft" : "published";
        const { error } = await sb.from("works").update({ status: next }).eq("id", w.id);
        if (error) return Admin.toast(Admin.errText(error), "err");
        Admin.toast("Statut mis à jour", "ok");
        refresh();
      };

      actions.appendChild(b);
      row.appendChild(left);
      row.appendChild(actions);
      list.appendChild(row);
    });
  };

  const refresh = async () => {
    try { renderList(await fetchWorks()); }
    catch (e) { console.error(e); Admin.toast(Admin.errText(e), "err"); }
  };

  // submit
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMsg("");

      const fd = new FormData(form);
      const title = String(fd.get("title") || "").trim();
      const yearRaw = String(fd.get("year") || "").trim();
      const category = String(fd.get("category") || "").trim();
      const description = String(fd.get("description") || "").trim();
      const published = !!fd.get("published");

      if (!title) return Admin.toast("Titre obligatoire.", "warn");

      try {
        const { data: w, error: e1 } = await sb
          .from("works")
          .insert({
            title,
            year: yearRaw ? Number(yearRaw) : null,
            category: category || null,
            description: description || null,
            status: published ? "published" : "draft",
          })
          .select("*")
          .single();
        if (e1) throw e1;

        if (files.length) {
          const cover = files[0];
          const coverPath = `works/${w.id}/cover.${extOf(cover.name)}`;
          await uploadOne(coverPath, cover);

          // update cover
          const { error: e2 } = await sb.from("works").update({ image_path: coverPath, image_alt: title }).eq("id", w.id);
          if (e2) console.warn("update image_path failed:", e2);
        }

        files = [];
        renderPreviews();
        form.reset();
        Admin.toast("Œuvre enregistrée ✅", "ok");
        refresh();
      } catch (err) {
        console.error(err);
        Admin.toast(Admin.errText(err), "err");
        setMsg(Admin.errText(err));
      }
    });
  }

  // -----------------
  // INIT (guard + start)
  // -----------------
  (async () => {
    const res = await Admin.ensureAdmin();
    if (!res.ok) {
      if (res.reason === "not_logged") return Admin.redirectToLogin();
      return Admin.toast("Accès refusé (pas admin).", "err");
    }

    Admin.bindLogout();
    // si tu as oublié #worksList, on le dit clairement
    if (!Admin.qs("#worksList")) console.warn("[ADMIN] Ajoute <div id='worksList' class='admin-list'></div> après le form.");
    refresh();
    Admin.toast("Admin prêt ✅", "ok");
  })();
})();
