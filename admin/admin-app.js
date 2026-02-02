/* admin/admin-app.js
   MMG Admin (core + auth + works)
   DB works:
   id (uuid), title, year, category, description,
   cover_url (text), thumb_url (text), images (jsonb array),
   sort (int4), is_published (bool), status (text), created_at
   Storage bucket: media
*/

(() => {
  "use strict";

  // =========================================================
  // CORE
  // =========================================================
  const Admin = (window.Admin = window.Admin || {});
  const qs = (sel, root = document) => root.querySelector(sel);

  const errText = (e) =>
    e?.message || e?.error_description || e?.hint || e?.details || String(e || "Erreur inconnue");

  const toast = (msg, type = "info") => {
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

  Admin.qs = qs;
  Admin.toast = toast;
  Admin.errText = errText;

  Admin.cfg = (() => {
    const c = window.MMG_SUPABASE || {};
    const url = c.url || window.SUPABASE_URL;
    const anonKey = c.anonKey || window.SUPABASE_ANON_KEY;
    const bucket = c.bucket || window.SUPABASE_BUCKET || "media";
    return { url, anonKey, bucket };
  })();

  const assertConfigured = () => {
    const { url, anonKey } = Admin.cfg;
    if (!url || !anonKey) {
      throw new Error("Supabase non configuré. Vérifie ../js/supabase-config.js (url + anonKey).");
    }
    if (!window.supabase?.createClient) {
      throw new Error("supabase-js manquant (CDN @supabase/supabase-js@2).");
    }
  };

  const initClient = () => {
    assertConfigured();
    const existing = window.mmgSupabase || window.mmg_supabase || window.supabaseClient;
    if (existing?.auth && existing?.from) return existing;

    return window.supabase.createClient(Admin.cfg.url, Admin.cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  };

  const sb = (Admin.sb = initClient());

  Admin.getPublicUrl = (path) => {
    const { data } = sb.storage.from(Admin.cfg.bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  };

  console.log("[ADMIN] core ready", { url: Admin.cfg.url, bucket: Admin.cfg.bucket });

  // =========================================================
  // AUTH (admin via profiles.role)
  // =========================================================
  const getUser = async () => {
    const { data, error } = await sb.auth.getUser();
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  };

  const getMyRole = async (userId) => {
    const { data, error } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
    return { role: data?.role || null, error };
  };

  const ensureAdmin = async () => {
    const { user, error: uErr } = await getUser();
    if (uErr || !user) return { ok: false, reason: "not_logged" };

    const { role, error: rErr } = await getMyRole(user.id);
    if (rErr) return { ok: false, reason: "role_error", error: rErr };
    if (role !== "admin") return { ok: false, reason: "not_admin" };

    return { ok: true, user };
  };

  // =========================================================
  // UI (login <-> dash)
  // =========================================================
  const loginCard = qs("#loginCard");
  const dash = qs("#dash");
  const adminUser = qs("#adminUser");
  const loginForm = qs("#loginForm");
  const loginMsg = qs("#loginMsg");
  const btnSignOut = qs("#btnSignOut") || qs("[data-logout]");

  const showDash = (user) => {
    if (loginCard) loginCard.hidden = true;
    if (dash) dash.hidden = false;
    if (adminUser) adminUser.textContent = user?.email || "";
  };

  const showLogin = () => {
    if (loginCard) loginCard.hidden = false;
    if (dash) dash.hidden = true;
    if (adminUser) adminUser.textContent = "";
  };

  if (btnSignOut) {
    btnSignOut.addEventListener("click", async () => {
      await sb.auth.signOut();
      toast("Déconnecté.", "ok");
      showLogin();
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (loginMsg) loginMsg.textContent = "";

      const fd = new FormData(loginForm);
      const email = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "");

      try {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const res = await ensureAdmin();
        if (!res.ok) throw new Error("Compte connecté mais pas admin.");

        showDash(res.user);
        toast("Connecté ✅", "ok");
        await Works.refresh();
      } catch (err) {
        console.error(err);
        const t = errText(err);
        if (loginMsg) loginMsg.textContent = t;
        toast(t, "err");
      }
    });
  }

  // =========================================================
  // WORKS
  // =========================================================
  const Works = {
    form: qs("#workForm"),
    list: qs("#worksList"),
    msg: qs("#workMsg"),
    inputFiles: qs("#workImages"),
    drop: qs("#workDrop"),
    preview: qs("#workPreview"),
    dropMeta: qs("#workDropMeta"),
    files: [],
  };

  const setWorkMsg = (t = "") => {
    if (Works.msg) Works.msg.textContent = t;
  };

  const extOf = (name) => {
    const e = (name.split(".").pop() || "jpg").toLowerCase();
    return e.replace(/[^a-z0-9]/g, "") || "jpg";
  };

  // ----- Dropzone + previews
  const renderPreviews = () => {
    if (!Works.preview) return;
    Works.preview.innerHTML = "";

    if (Works.dropMeta) {
      Works.dropMeta.textContent = Works.files.length ? `${Works.files.length} fichier(s) sélectionné(s)` : "";
    }

    Works.files.forEach((f, idx) => {
      const card = document.createElement("div");
      card.className = "dz-thumb";

      const img = document.createElement("img");
      img.alt = f.name;
      img.src = URL.createObjectURL(f);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.title = "Retirer";
      btn.addEventListener("click", () => {
        Works.files.splice(idx, 1);
        renderPreviews();
      });

      card.appendChild(img);
      card.appendChild(btn);
      Works.preview.appendChild(card);
    });
  };

  const addFiles = (incoming) => {
    const arr = Array.from(incoming || []);
    Works.files = [...Works.files, ...arr].slice(0, 10);
    renderPreviews();
  };

  if (Works.drop && Works.inputFiles) {
    Works.drop.addEventListener("click", () => Works.inputFiles.click());
    Works.drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        Works.inputFiles.click();
      }
    });

    Works.inputFiles.addEventListener("change", () => {
      addFiles(Works.inputFiles.files);
      Works.inputFiles.value = "";
    });

    ["dragenter", "dragover"].forEach((ev) => {
      Works.drop.addEventListener(ev, (e) => {
        e.preventDefault();
        Works.drop.classList.add("is-over");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      Works.drop.addEventListener(ev, (e) => {
        e.preventDefault();
        Works.drop.classList.remove("is-over");
      });
    });
    Works.drop.addEventListener("drop", (e) => {
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    });
  }

  // ----- Storage upload
  const uploadOne = async (path, file) => {
    const { error } = await sb.storage.from(Admin.cfg.bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (error) throw error;
  };

  // ----- DB list
  const fetchWorks = async () => {
    const { data, error } = await sb
      .from("works")
      .select("id,title,year,category,description,cover_url,thumb_url,images,sort,is_published,status,created_at")
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const renderList = (works) => {
    if (!Works.list) return;
    Works.list.innerHTML = "";

    if (!works.length) {
      Works.list.innerHTML = `<p class="muted">Aucune œuvre pour l’instant.</p>`;
      return;
    }

    works.forEach((w) => {
      const row = document.createElement("div");
      row.className = "admin-item";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.gap = "12px";
      left.style.alignItems = "center";

      const thumb = document.createElement("img");
      thumb.style.width = "64px";
      thumb.style.height = "64px";
      thumb.style.objectFit = "cover";
      thumb.style.borderRadius = "14px";
      thumb.style.border = "1px solid rgba(255,255,255,.12)";
      thumb.src = w.thumb_url || w.cover_url || "";
      if (!thumb.src) thumb.style.background = "rgba(255,255,255,.06)";

      const meta = document.createElement("div");
      const pub = w.is_published ? "publié" : "brouillon";
      meta.innerHTML = `
        <div class="admin-item__meta">${pub} • sort=${w.sort ?? 1000} • ${w.year ?? ""} ${w.category ? "• " + w.category : ""}</div>
        <strong>${w.title || "(sans titre)"}</strong>
      `;

      left.appendChild(thumb);
      left.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "admin-actions";

      // publish toggle
      const btnPub = document.createElement("button");
      btnPub.className = "btn";
      btnPub.type = "button";
      btnPub.textContent = w.is_published ? "Dépublier" : "Publier";
      btnPub.addEventListener("click", async () => {
        btnPub.disabled = true;
        try {
          const next = !w.is_published;
          const { error } = await sb
            .from("works")
            .update({ is_published: next, status: next ? "published" : "draft" })
            .eq("id", w.id);
          if (error) throw error;
          toast("Statut mis à jour ✅", "ok");
          await Works.refresh();
        } catch (e) {
          console.error(e);
          toast(errText(e), "err");
        } finally {
          btnPub.disabled = false;
        }
      });

      // delete
      const btnDel = document.createElement("button");
      btnDel.className = "btn";
      btnDel.type = "button";
      btnDel.textContent = "Supprimer";
      btnDel.style.borderColor = "rgba(255,100,100,.35)";
      btnDel.addEventListener("click", async () => {
        if (!confirm(`Supprimer "${w.title}" ?`)) return;
        btnDel.disabled = true;
        try {
          const { error } = await sb.from("works").delete().eq("id", w.id);
          if (error) throw error;
          toast("Œuvre supprimée ✅", "ok");
          await Works.refresh();
        } catch (e) {
          console.error(e);
          toast(errText(e), "err");
        } finally {
          btnDel.disabled = false;
        }
      });

      actions.appendChild(btnPub);
      actions.appendChild(btnDel);

      row.appendChild(left);
      row.appendChild(actions);
      Works.list.appendChild(row);
    });
  };

  Works.refresh = async () => {
    try {
      renderList(await fetchWorks());
    } catch (e) {
      console.error(e);
      toast(errText(e), "err");
    }
  };

  // ----- Submit: create work + upload all images + update cover/thumb/images
  if (Works.form) {
    Works.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setWorkMsg("");

      const fd = new FormData(Works.form);
      const title = String(fd.get("title") || "").trim();
      const yearRaw = String(fd.get("year") || "").trim();
      const category = String(fd.get("category") || "").trim();
      const description = String(fd.get("description") || "").trim();
      const published = !!fd.get("published");

      if (!title) return toast("Titre obligatoire.", "warn");
      if (!Works.files.length) return toast("Ajoute au moins 1 image.", "warn");

      try {
        // 1) Create row (need id)
        const { data: w, error: e1 } = await sb
          .from("works")
          .insert({
            title,
            year: yearRaw ? Number(yearRaw) : null,
            category: category || null,
            description: description || null,
            sort: 1000,
            is_published: published,
            status: published ? "published" : "draft",
          })
          .select("*")
          .single();
        if (e1) throw e1;

        // 2) Upload ALL images and collect public URLs
        const urls = [];
        for (let i = 0; i < Works.files.length; i++) {
          const file = Works.files[i];
          const path = `works/${w.id}/img_${String(i + 1).padStart(2, "0")}.${extOf(file.name)}`;
          await uploadOne(path, file);
          const url = Admin.getPublicUrl(path);
          if (url) urls.push(url);
        }

        if (!urls.length) {
          throw new Error("Images uploadées mais URLs introuvables. Vérifie les policies SELECT du bucket media.");
        }

        // 3) Update row with cover/thumb + images array jsonb
        const coverUrl = urls[0];
        const thumbUrl = urls[0];

        const { error: e2 } = await sb
          .from("works")
          .update({
            cover_url: coverUrl,
            thumb_url: thumbUrl,
            images: urls, // jsonb array
          })
          .eq("id", w.id);
        if (e2) throw e2;

        // reset UI
        Works.files = [];
        renderPreviews();
        Works.form.reset();

        toast("Œuvre enregistrée ✅", "ok");
        await Works.refresh();
      } catch (err) {
        console.error(err);
        const t = errText(err);
        toast(t, "err");
        setWorkMsg(t);
      }
    });
  }

  // =========================================================
  // BOOT
  // =========================================================
  const boot = async () => {
    if (!Works.list) {
      console.warn("[ADMIN] Ajoute <div id='worksList' class='admin-list'></div> après le form #workForm.");
    }

    const res = await ensureAdmin();
    if (!res.ok) {
      showLogin();
      return;
    }

    showDash(res.user);
    await Works.refresh();
    toast("Admin prêt ✅", "ok");
  };

  boot();
})();
