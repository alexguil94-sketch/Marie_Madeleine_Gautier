/* admin/admin-app.js
   MMG Admin bundle (core + auth + works + ui)
   - Compatible avec TON HTML: #loginCard, #loginForm, #dash, #workForm, #workDrop, #workImages...
   - Requires: ../js/supabase-config.js and supabase-js v2
*/

(() => {
  "use strict";

  // =========================================================
  // CORE
  // =========================================================
  const Admin = (window.Admin = window.Admin || {});

  Admin.cfg = (() => {
    const c = window.MMG_SUPABASE || {};
    const url = c.url || window.SUPABASE_URL;
    const anonKey = c.anonKey || window.SUPABASE_ANON_KEY;
    const bucket = c.bucket || window.SUPABASE_BUCKET || "media";
    return { url, anonKey, bucket };
  })();

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
  Admin.errText = errText;
  Admin.toast = toast;

  const assertConfigured = () => {
    const { url, anonKey } = Admin.cfg;
    if (!url || !anonKey) {
      throw new Error("Supabase non configuré. Vérifie ../js/supabase-config.js (url + anonKey).");
    }
    if (!window.supabase?.createClient) {
      throw new Error("supabase-js manquant. Ajoute le CDN @supabase/supabase-js@2 avant admin-app.js");
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

  Admin.publicUrl = (path) => {
    if (!path) return "";
    const { data } = sb.storage.from(Admin.cfg.bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  };

  console.log("[ADMIN] ready", { url: Admin.cfg.url, bucket: Admin.cfg.bucket });

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

  const signIn = async (email, password) => {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await sb.auth.signOut();
  };

  // =========================================================
  // UI TOGGLE (login vs dash)
  // =========================================================
  const loginCard = qs("#loginCard");
  const dash = qs("#dash");
  const adminUser = qs("#adminUser");
  const btnSignOut = qs("#btnSignOut") || qs("[data-logout]");
  const loginForm = qs("#loginForm");
  const loginMsg = qs("#loginMsg");

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
      await signOut();
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
        await signIn(email, password);

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
  // WORKS (dropzone + cover upload)
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

  const setFiles = (incoming) => {
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
      setFiles(Works.inputFiles.files);
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
      if (e.dataTransfer?.files?.length) setFiles(e.dataTransfer.files);
    });
  }

  const uploadOne = async (path, file) => {
    const { error } = await sb.storage.from(Admin.cfg.bucket).upload(path, file, {
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

  const renderWorksList = (works) => {
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

      const thumb = document.createElement("img");
      thumb.style.width = "64px";
      thumb.style.height = "64px";
      thumb.style.objectFit = "cover";
      thumb.style.borderRadius = "14px";
      thumb.style.border = "1px solid rgba(255,255,255,.12)";
      thumb.src = w.image_path ? Admin.publicUrl(w.image_path) : "";
      if (!thumb.src) thumb.style.background = "rgba(255,255,255,.06)";

      const txt = document.createElement("div");
      txt.innerHTML = `
        <div class="admin-item__meta">${w.status || "—"} • ${w.year ?? ""} • #${w.sort_order ?? 0}</div>
        <strong>${w.title || "(sans titre)"}</strong>
      `;

      left.appendChild(thumb);
      left.appendChild(txt);

      const actions = document.createElement("div");
      actions.className = "admin-actions";

      const btnToggle = document.createElement("button");
      btnToggle.className = "btn";
      btnToggle.type = "button";
      btnToggle.textContent = w.status === "published" ? "Dépublier" : "Publier";
      btnToggle.addEventListener("click", async () => {
        btnToggle.disabled = true;
        try {
          const next = w.status === "published" ? "draft" : "published";
          const { error } = await sb.from("works").update({ status: next }).eq("id", w.id);
          if (error) throw error;
          toast("Statut mis à jour.", "ok");
          await Works.refresh();
        } catch (e) {
          console.error(e);
          toast(errText(e), "err");
        } finally {
          btnToggle.disabled = false;
        }
      });

      const btnDel = document.createElement("button");
      btnDel.className = "btn";
      btnDel.type = "button";
      btnDel.textContent = "Supprimer";
      btnDel.style.borderColor = "rgba(255,100,100,.35)";
      btnDel.addEventListener("click", async () => {
        if (!confirm(`Supprimer "${w.title}" ?`)) return;
        btnDel.disabled = true;
        try {
          if (w.image_path) {
            await sb.storage.from(Admin.cfg.bucket).remove([w.image_path]);
          }
          const { error } = await sb.from("works").delete().eq("id", w.id);
          if (error) throw error;
          toast("Œuvre supprimée.", "ok");
          await Works.refresh();
        } catch (e) {
          console.error(e);
          toast(errText(e), "err");
        } finally {
          btnDel.disabled = false;
        }
      });

      actions.appendChild(btnToggle);
      actions.appendChild(btnDel);

      row.appendChild(left);
      row.appendChild(actions);
      Works.list.appendChild(row);
    });
  };

  Works.refresh = async () => {
    try {
      const works = await fetchWorks();
      renderWorksList(works);
    } catch (e) {
      console.error(e);
      toast(errText(e), "err");
    }
  };

  // Submit work (create + upload cover)
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

      try {
        // 1) create work row
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

        // 2) upload cover image (first file)
        if (Works.files.length) {
          const cover = Works.files[0];
          const coverPath = `works/${w.id}/cover.${extOf(cover.name)}`;

          await uploadOne(coverPath, cover);

          const { error: e2 } = await sb
            .from("works")
            .update({ image_path: coverPath, image_alt: title })
            .eq("id", w.id);

          if (e2) console.warn("update image_path failed:", e2);
        }

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
  // INIT
  // =========================================================
  const boot = async () => {
    // Check DOM requirements
    if (!Works.list) {
      console.warn("[ADMIN] Ajoute <div id='worksList' class='admin-list'></div> après le form #workForm.");
    }

    const res = await ensureAdmin();

    if (!res.ok) {
      showLogin();
      // Option: forcer la connexion globale
      // if (res.reason === "not_logged") Admin.redirectToLogin();
      return;
    }

    showDash(res.user);
    await Works.refresh();
    toast("Admin prêt ✅", "ok");
  };

  boot();
})();
