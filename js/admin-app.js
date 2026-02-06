// js/admin-app.js (v7)
// - Guard admin AVANT toute requête
// - CRUD œuvres (titre/texte + publier + image cover)
// - Best-effort cleanup Storage

(() => {
  "use strict";

  if (window.__MMG_ADMIN_INIT__) return;
  window.__MMG_ADMIN_INIT__ = true;

  const qs = (s, r = document) => r.querySelector(s);

  const errText = (e) =>
    e?.message || e?.error_description || e?.hint || e?.details || String(e || "Erreur");

  const isAbort = (e) =>
    e?.name === "AbortError" || /aborted/i.test(String(e?.message || ""));

  // supabase-js can surface AbortError as unhandled rejections (nav/unload/timeouts)
  window.addEventListener("unhandledrejection", (ev) => {
    if (isAbort(ev?.reason)) ev.preventDefault();
  });

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

  const getBucket = () => window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media";

  const safeName = (fileName) =>
    String(fileName || "image")
      .normalize("NFKD")
      .replace(/[^a-z0-9._-]/gi, "-")
      .replace(/-+/g, "-")
      .slice(0, 120);

  const extOf = (name) => {
    const e = String(name || "jpg")
      .split(".")
      .pop()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return e || "jpg";
  };

  const resolveUrl = (sb, uOrPath) => {
    const v = String(uOrPath || "").trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/")) return v;
    const { data } = sb.storage.from(getBucket()).getPublicUrl(v);
    return data?.publicUrl || v;
  };

  const storagePathFromUrl = (uOrPath) => {
    const v = String(uOrPath || "").trim();
    if (!v) return "";
    if (v.startsWith("/")) return "";
    if (v.startsWith("http://") || v.startsWith("https://")) {
      const m1 = v.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
      if (m1?.[1]) {
        try { return decodeURIComponent(m1[1]); } catch { return m1[1]; }
      }
      const m2 = v.match(/\/storage\/v1\/object\/sign\/[^/]+\/([^?]+)(?:\?|$)/);
      if (m2?.[1]) {
        try { return decodeURIComponent(m2[1]); } catch { return m2[1]; }
      }
      return "";
    }
    return v;
  };

  async function waitSB(ms = 5000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const sb = window.mmgSupabase || window.mmg_supabase;
      if (sb?.auth?.getSession && sb?.from && sb?.storage) return sb;
      await new Promise((r) => setTimeout(r, 80));
    }
    return null;
  }

  function showLogin(msg) {
    const loginCard = qs("#loginCard");
    const dash = qs("#dash");
    if (loginCard) loginCard.hidden = false;
    if (dash) dash.hidden = true;
    const adminUser = qs("#adminUser");
    if (adminUser) adminUser.textContent = "";
    const btnSignOut = qs("#btnSignOut");
    if (btnSignOut) btnSignOut.style.display = "none";
    const el = qs("#loginMsg");
    if (el) el.textContent = msg || "";
  }

  function showDash() {
    const loginCard = qs("#loginCard");
    const dash = qs("#dash");
    if (loginCard) loginCard.hidden = true;
    if (dash) dash.hidden = false;
    const el = qs("#loginMsg");
    if (el) el.textContent = "";
    const btnSignOut = qs("#btnSignOut");
    if (btnSignOut) btnSignOut.style.display = "";
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

    // 1) Read profile role
    const readRole = async () =>
      await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();

    let { data: prof, error: pErr } = await readRole();

    // 2) If missing row, seed it (policy: insert own) then re-read
    if (!pErr && !prof) {
      const { error: insErr } = await sb.from("profiles").insert({ id: user.id });
      // Ignore insert errors: if RLS blocks, or row created elsewhere, we'll detect on re-read.
      if (insErr) console.warn("[admin] profiles insert error", insErr);
      ({ data: prof, error: pErr } = await readRole());
    }

    if (pErr) return { ok: false, reason: "profile_error", error: pErr };
    if (prof?.role !== "admin") return { ok: false, reason: "not_admin", role: prof?.role || null };

    return { ok: true, user };
  }

  async function fetchWorks(sb) {
    const { data, error } = await sb
      .from("works")
      .select("id,title,year,category,description,cover_url,thumb_url,images,sort,is_published,created_at")
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  function collectStoragePaths(work) {
    const candidates = []
      .concat(work?.cover_url || "")
      .concat(work?.thumb_url || "")
      .concat(Array.isArray(work?.images) ? work.images : []);

    return Array.from(
      new Set(
        candidates
          .map((it) => (typeof it === "string" ? it : it?.url))
          .map(storagePathFromUrl)
          .filter(Boolean)
      )
    );
  }

  function ensureWorkModal() {
    if (qs("#workEditModal")) return;

    const modal = document.createElement("section");
    modal.id = "workEditModal";
    modal.className = "admin-modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="admin-modal__card admin-card" role="dialog" aria-modal="true" aria-labelledby="wemTitle">
        <div class="admin-modal__head">
          <div style="min-width:0">
            <div class="admin-kicker">Œuvre</div>
            <h2 id="wemTitle" class="admin-modal__title">Modifier</h2>
            <div id="wemMeta" class="small-note" style="margin-top:6px"></div>
          </div>
          <button type="button" class="btn" data-wem-close aria-label="Fermer">×</button>
        </div>

        <hr />

        <form id="workEditForm" class="admin-form" autocomplete="off">
          <div class="row">
            <div class="field">
              <span>Titre</span>
              <input class="input" name="title" required />
            </div>
            <div class="field">
              <span>Année</span>
              <input class="input" name="year" inputmode="numeric" />
            </div>
          </div>

          <div class="row">
            <div class="field">
              <span>Catégorie</span>
              <input class="input" name="category" />
            </div>
            <div class="field">
              <span>Ordre</span>
              <input class="input" name="sort" inputmode="numeric" />
            </div>
          </div>

          <div class="field">
            <span>Description</span>
            <textarea class="input" name="description" rows="5"></textarea>
          </div>

          <div class="row">
            <div class="field">
              <span>Publié</span>
              <label class="admin-toggle">
                <input type="checkbox" name="is_published" />
                <span>oui</span>
              </label>
            </div>
            <div class="field">
              <span>Remplacer l’image</span>
              <input class="input" type="file" name="cover" accept="image/*" />
            </div>
          </div>

          <div class="admin-modal__actions">
            <button type="button" class="btn" data-wem-delete style="border-color:rgba(255,100,100,.35)">Supprimer</button>
            <div class="admin-modal__actionsRight">
              <button type="button" class="btn" data-wem-cancel>Annuler</button>
              <button type="submit" class="btn">Enregistrer</button>
            </div>
          </div>

          <div id="wemMsg" class="muted" style="min-height:18px"></div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
  }

  async function boot() {
    const sb = await waitSB();
    if (!sb) {
      showLogin("Supabase non chargé. Vérifie `js/supabase-config.js` + ta connexion.");
      qs("#loginForm")
        ?.querySelectorAll("input, button")
        .forEach((el) => (el.disabled = true));
      return;
    }

      let worksCache = [];
      let selectedFiles = [];
      let editingId = null;
      let newsCache = [];
      let pubsCache = [];
      let sitePhotosCache = [];
      let docsCache = [];
      let sourcesCache = [];
      let editingNews = null;
      let editingPub = null;
      let editingDoc = null;
      let editingSource = null;

    const inputFiles = qs("#workImages");
    const drop = qs("#workDrop");
    const preview = qs("#workPreview");
    const dropMeta = qs("#workDropMeta");

    const workForm = qs("#workForm");
    const workMsg = qs("#workMsg");

    const listEl = qs("#worksList");

    const navBtns = Array.from(document.querySelectorAll(".admin-nav__btn"));
    const VIEWS = ["works", "news", "publications", "books", "photos", "comments"];

    const setView = (name) => {
      const view = VIEWS.includes(name) ? name : "works";

      navBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
      VIEWS.forEach((v) => {
        const el = document.getElementById(`view-${v}`);
        if (el) el.hidden = v !== view;
      });

      if (location.hash !== `#${view}`) location.hash = `#${view}`;
    };

    const initNav = () => {
      navBtns.forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));

      const fromHash = String(location.hash || "").replace("#", "");
      setView(fromHash || "works");

      window.addEventListener("hashchange", () => {
        const v = String(location.hash || "").replace("#", "");
        if (v) setView(v);
      });
    };

    const setWorkMsg = (t) => {
      if (!workMsg) return;
      workMsg.textContent = t || "";
    };

    const renderPreviews = () => {
      if (!preview) return;
      preview.innerHTML = "";
      if (dropMeta) dropMeta.textContent = selectedFiles.length ? `${selectedFiles.length} fichier(s)` : "";

      selectedFiles.forEach((f, idx) => {
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
          selectedFiles.splice(idx, 1);
          renderPreviews();
        });

        card.appendChild(img);
        card.appendChild(btn);
        preview.appendChild(card);
      });
    };

    const setFiles = (incoming) => {
      const arr = Array.from(incoming || []).filter((f) => (f.type || "").startsWith("image/"));
      selectedFiles = selectedFiles.concat(arr).slice(0, 10);
      renderPreviews();
    };

    if (drop && inputFiles) {
      drop.addEventListener("click", () => inputFiles.click());
      drop.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputFiles.click();
        }
      });

      inputFiles.addEventListener("change", () => {
        setFiles(inputFiles.files);
        inputFiles.value = "";
      });

      ["dragenter", "dragover"].forEach((ev) => {
        drop.addEventListener(ev, (e) => {
          e.preventDefault();
          drop.classList.add("is-over");
        });
      });
      ["dragleave", "drop"].forEach((ev) => {
        drop.addEventListener(ev, (e) => {
          e.preventDefault();
          drop.classList.remove("is-over");
        });
      });
      drop.addEventListener("drop", (e) => {
        const dt = e.dataTransfer;
        if (!dt?.files?.length) return;
        setFiles(dt.files);
      });
    }

    async function refreshWorks() {
      worksCache = await fetchWorks(sb);
      renderWorks();
    }

    function renderWorks() {
      if (!listEl) return;
      listEl.innerHTML = "";

      if (!worksCache.length) {
        listEl.innerHTML = `<p class="muted">Aucune œuvre pour l’instant.</p>`;
        return;
      }

      worksCache.forEach((w) => {
        const row = document.createElement("div");
        row.className = "admin-item";

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.gap = "12px";

        const img = document.createElement("img");
        img.style.cssText =
          "width:64px;height:64px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.12)";

        const src = w.thumb_url || w.cover_url || (Array.isArray(w.images) ? w.images[0] : "") || "";
        img.src = resolveUrl(sb, src);
        if (!img.src) img.style.background = "rgba(255,255,255,.06)";

        const txt = document.createElement("div");
        const parts = [w.year ?? "", w.category ?? ""].filter(Boolean).join(" • ");
        const status = w.is_published ? "Publié" : "Brouillon";
        txt.innerHTML = `
          <div class="admin-item__meta">${status}${parts ? " • " + parts : ""} • sort=${w.sort ?? 1000}</div>
          <div><strong>${w.title || "(sans titre)"}</strong></div>
          ${w.description ? `<div class="admin-item__text">${String(w.description)}</div>` : ""}
        `;

        left.appendChild(img);
        left.appendChild(txt);

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "btn";
        btnEdit.textContent = "Modifier";
        btnEdit.addEventListener("click", () => openEdit(w.id));

        const btnPub = document.createElement("button");
        btnPub.type = "button";
        btnPub.className = "btn";
        btnPub.textContent = w.is_published ? "Dépublier" : "Publier";
        btnPub.addEventListener("click", async () => {
          btnPub.disabled = true;
          try {
            const next = !w.is_published;
            const { error } = await sb.from("works").update({ is_published: next }).eq("id", w.id);
            if (error) throw error;
            w.is_published = next;
            toast("Statut mis à jour ✅", "ok");
            await refreshWorks();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnPub.disabled = false;
          }
        });

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn";
        btnDel.textContent = "Supprimer";
        btnDel.style.borderColor = "rgba(255,100,100,.35)";
        btnDel.addEventListener("click", async () => {
          await deleteWorkById(w.id);
        });

        actions.appendChild(btnEdit);
        actions.appendChild(btnPub);
        actions.appendChild(btnDel);

        row.appendChild(left);
        row.appendChild(actions);
        listEl.appendChild(row);
      });
    }

    async function uploadImageToWork(workId, file) {
      const bucket = getBucket();
      const path = `works/${workId}/${Date.now()}-${safeName(file.name || "cover")}.${extOf(file.name)}`;

      const { error } = await sb.storage.from(bucket).upload(path, file, {
        cacheControl: "31536000",
        upsert: true,
        contentType: file.type || "image/jpeg",
      });
      if (error) throw error;
      return path;
    }

    workForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      setWorkMsg("");

      if (!selectedFiles.length) {
        setWorkMsg("Ajoute au moins 1 image.");
        return;
      }

      const fd = new FormData(workForm);
      const title = String(fd.get("title") || "").trim();
      const yearRaw = String(fd.get("year") || "").trim();
      const category = String(fd.get("category") || "").trim();
      const description = String(fd.get("description") || "").trim();
      const isPublished = !!fd.get("published");

      const yearVal = yearRaw ? Number.parseInt(yearRaw, 10) : NaN;

      if (!title) {
        setWorkMsg("Titre obligatoire.");
        return;
      }

      const btn = workForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      setWorkMsg("Enregistrement…");

      try {
        const payload = {
          title,
          year: Number.isFinite(yearVal) ? yearVal : null,
          category: category || null,
          description: description || null,
          is_published: isPublished,
        };

        const { data: created, error: insErr } = await sb
          .from("works")
          .insert(payload)
          .select("id")
          .single();

        if (insErr) throw insErr;
        const workId = created?.id;
        if (!workId) throw new Error("Impossible de récupérer l’ID de l’œuvre.");

        const paths = [];
        for (const f of selectedFiles) {
          paths.push(await uploadImageToWork(workId, f));
        }

        const cover = paths[0] || "";
        const { error: upErr } = await sb
          .from("works")
          .update({ cover_url: cover || null, thumb_url: cover || null, images: paths })
          .eq("id", workId);
        if (upErr) throw upErr;

        selectedFiles = [];
        renderPreviews();
        workForm.reset();
        setWorkMsg("✅ Œuvre enregistrée.");
        toast("Œuvre enregistrée ✅", "ok");
        await refreshWorks();
      } catch (e1) {
        console.error(e1);
        setWorkMsg("Erreur : " + errText(e1));
        toast(errText(e1), "err");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    async function deleteWorkById(id) {
      const w = worksCache.find((x) => String(x.id) === String(id));
      if (!w) return;

      const ok = confirm(`Supprimer "${w.title || "œuvre"}" ?`);
      if (!ok) return;

      try {
        const { error } = await sb.from("works").delete().eq("id", w.id);
        if (error) throw error;

        const paths = collectStoragePaths(w);
        if (paths.length) {
          try { await sb.storage.from(getBucket()).remove(paths); } catch {}
        }

        toast("Œuvre supprimée ✅", "ok");
        await refreshWorks();
      } catch (e) {
        console.error(e);
        toast(errText(e), "err");
      }
    }

    function setModalOpen(open) {
      const modal = qs("#workEditModal");
      if (!modal) return;
      modal.hidden = !open;
      modal.setAttribute("aria-hidden", open ? "false" : "true");
    }

    function fillEditForm(work) {
      ensureWorkModal();
      const modal = qs("#workEditModal");
      const form = qs("#workEditForm");
      if (!modal || !form) return;

      editingId = String(work.id);

      const meta = qs("#wemMeta");
      if (meta) meta.textContent = `#${String(work.id).slice(0, 8)} • ${work.is_published ? "Publié" : "Brouillon"}`;

      form.querySelector('[name="title"]').value = work.title || "";
      form.querySelector('[name="year"]').value = work.year ?? "";
      form.querySelector('[name="category"]').value = work.category || "";
      form.querySelector('[name="sort"]').value = work.sort ?? 1000;
      form.querySelector('[name="description"]').value = work.description || "";
      form.querySelector('[name="is_published"]').checked = !!work.is_published;

      const cover = form.querySelector('input[name="cover"]');
      if (cover) cover.value = "";

      const msg = qs("#wemMsg");
      if (msg) msg.textContent = "";

      setModalOpen(true);
      form.querySelector('[name="title"]')?.focus?.();
    }

    function openEdit(id) {
      const w = worksCache.find((x) => String(x.id) === String(id));
      if (!w) return;
      fillEditForm(w);
    }

    function bindModalEvents() {
      ensureWorkModal();
      const modal = qs("#workEditModal");
      const form = qs("#workEditForm");
      if (!modal || !form) return;

      const close = () => {
        editingId = null;
        form.reset();
        setModalOpen(false);
      };

      modal.addEventListener("click", (e) => {
        if (e.target === modal) close();
      });

      qs("[data-wem-close]")?.addEventListener("click", close);
      qs("[data-wem-cancel]")?.addEventListener("click", close);

      qs("[data-wem-delete]")?.addEventListener("click", async () => {
        if (!editingId) return;
        await deleteWorkById(editingId);
        close();
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!editingId) return;

        const w = worksCache.find((x) => String(x.id) === String(editingId));
        if (!w) return;

        const msg = qs("#wemMsg");
        if (msg) msg.textContent = "Enregistrement…";

        const fd = new FormData(form);
        const title = String(fd.get("title") || "").trim();
        const yearRaw = String(fd.get("year") || "").trim();
        const category = String(fd.get("category") || "").trim();
        const sortRaw = String(fd.get("sort") || "").trim();
        const description = String(fd.get("description") || "").trim();
        const isPublished = !!fd.get("is_published");

        if (!title) {
          if (msg) msg.textContent = "Titre obligatoire.";
          return;
        }

        const yearVal = yearRaw ? Number.parseInt(yearRaw, 10) : NaN;
        const sortVal = sortRaw ? Number.parseInt(sortRaw, 10) : NaN;

        const payload = {
          title,
          year: Number.isFinite(yearVal) ? yearVal : null,
          category: category || null,
          sort: Number.isFinite(sortVal) ? sortVal : (w.sort ?? 1000),
          description: description || null,
          is_published: isPublished,
        };

        const coverInput = form.querySelector('input[name="cover"]');
        const file = coverInput?.files?.[0] || null;
        if (file) {
          try {
            const path = await uploadImageToWork(w.id, file);

            const existing = Array.isArray(w.images)
              ? w.images.map((it) => (typeof it === "string" ? it : it?.url)).filter(Boolean)
              : [];

            payload.cover_url = path;
            payload.thumb_url = path;
            payload.images = [path].concat(existing.filter((x) => x !== path));
          } catch (e2) {
            console.error(e2);
            if (msg) msg.textContent = "Upload impossible : " + errText(e2);
            return;
          }
        }

        try {
          const { error } = await sb.from("works").update(payload).eq("id", w.id);
          if (error) throw error;

          toast("Enregistré ✅", "ok");
          if (msg) msg.textContent = "✅ Enregistré.";
          await refreshWorks();
          setTimeout(close, 650);
        } catch (e3) {
          console.error(e3);
          if (msg) msg.textContent = "Erreur : " + errText(e3);
        }
      });
    }

    // ---------- News + Publications (CRUD) ----------
    const setInputFiles = (input, files) => {
      const dt = new DataTransfer();
      Array.from(files || []).forEach((f) => dt.items.add(f));
      input.files = dt.files;
    };

    const removeFileAt = (input, idx) => {
      const cur = Array.from(input.files || []);
      cur.splice(idx, 1);
      setInputFiles(input, cur);
    };

    function parseYoutubeId(input) {
      const s = String(input || "").trim();
      if (!s) return "";
      if (/^[a-zA-Z0-9_-]{8,}$/.test(s) && !s.includes("http")) return s;
      const m1 = s.match(/[?&]v=([a-zA-Z0-9_-]{8,})/);
      if (m1) return m1[1];
      const m2 = s.match(/youtu\.be\/([a-zA-Z0-9_-]{8,})/);
      if (m2) return m2[1];
      const m3 = s.match(/embed\/([a-zA-Z0-9_-]{8,})/);
      if (m3) return m3[1];
      return "";
    }

    const newsForm = qs("#newsForm");
    const newsMsg = qs("#newsMsg");
    const newsCancel = qs("#newsCancel");
    const newsList = qs("#newsList");
    const newsPreview = qs("#newsPreview");
    const newsImage = qs("#newsImage");
    const newsYoutubeWrap = qs("[data-news-youtube]");
    const newsImageWrap = qs("[data-news-image]");

    const pubForm = qs("#pubForm");
    const pubMsg = qs("#pubMsg");
    const pubCancel = qs("#pubCancel");
    const pubDedup = qs("#pubDedup");
    const pubList = qs("#pubList");
    const pubPreview = qs("#pubPreview");
    const pubImages = qs("#pubImages");

    const sitePhotosForm = qs("#sitePhotosForm");
    const sitePhotosMsg = qs("#sitePhotosMsg");
    const sitePhotosList = qs("#sitePhotosList");
    const sitePhotosSlot = qs("#sitePhotosSlot");
    const sitePhotosFiles = qs("#sitePhotosFiles");
    const sitePhotosReload = qs("#sitePhotosReload");
    const sitePhotosHint = qs("#sitePhotosHint");

    const SITE_PHOTO_SLOTS = {
      drawer_carousel: {
        label: "Menu burger — Carrousel",
        multiple: true,
        folder: "site/carousel",
        hint: 'Ces images alimentent le carrousel du menu burger (slot: <code>drawer_carousel</code>).',
      },
      home_hero: {
        label: "Accueil — Header (fond)",
        multiple: false,
        folder: "site/home_hero",
        hint: 'Image de fond du grand header sur la page Accueil (slot: <code>home_hero</code>).',
      },
      home_feature: {
        label: "Accueil — Exposition du moment",
        multiple: false,
        folder: "site/home_feature",
        hint: 'Image de la section “Exposition du moment” sur la page Accueil (slot: <code>home_feature</code>).',
      },
      header_logo_light: {
        label: "Header — Logo clair",
        multiple: false,
        folder: "site/header_logo_light",
        hint: 'Logo “clair” du header (slot: <code>header_logo_light</code>).',
      },
      header_logo_dark: {
        label: "Header — Logo sombre",
        multiple: false,
        folder: "site/header_logo_dark",
        hint: 'Logo “sombre” du header (slot: <code>header_logo_dark</code>).',
      },
    };

    const getSitePhotoSlot = () => {
      const v = String(sitePhotosSlot?.value || "drawer_carousel").trim();
      return SITE_PHOTO_SLOTS[v] ? v : "drawer_carousel";
    };

    const currentSitePhotoSlotLabel = () => SITE_PHOTO_SLOTS[getSitePhotoSlot()]?.label || "Photos";

    const syncSitePhotosUI = () => {
      const slot = getSitePhotoSlot();
      const cfg = SITE_PHOTO_SLOTS[slot] || SITE_PHOTO_SLOTS.drawer_carousel;

      if (sitePhotosHint) {
        sitePhotosHint.innerHTML =
          (cfg?.hint || "") +
          (cfg?.multiple
            ? ""
            : '<div style="margin-top:6px">Astuce : pour cet emplacement, seule la dernière image publiée est utilisée.</div>');
      }

      if (sitePhotosFiles) sitePhotosFiles.multiple = !!cfg?.multiple;
    };

    // ---------- Books / Press / Sources ----------
    const docsForm = qs("#docsForm");
    const docsMsg = qs("#docsMsg");
    const docsCancel = qs("#docsCancel");
    const docsReload = qs("#docsReload");
    const docsBooksList = qs("#docsBooksList");
    const docsPressList = qs("#docsPressList");
    const docCover = qs("#docCover");
    const docPdf = qs("#docPdf");

    const sourcesForm = qs("#sourcesForm");
    const sourcesMsg = qs("#sourcesMsg");
    const sourcesCancel = qs("#sourcesCancel");
    const sourcesReload = qs("#sourcesReload");
    const sourcesAdminList = qs("#sourcesAdminList");

    const setNewsMsg = (t) => {
      if (!newsMsg) return;
      newsMsg.textContent = t || "";
    };
    const setPubMsg = (t) => {
      if (!pubMsg) return;
      pubMsg.textContent = t || "";
    };
    const setSitePhotosMsg = (t) => {
      if (!sitePhotosMsg) return;
      sitePhotosMsg.textContent = t || "";
    };
    const setDocsMsg = (t) => {
      if (!docsMsg) return;
      docsMsg.textContent = t || "";
    };
    const setSourcesMsg = (t) => {
      if (!sourcesMsg) return;
      sourcesMsg.textContent = t || "";
    };

    const renderNewsPreview = () => {
      if (!newsPreview) return;
      newsPreview.innerHTML = "";

      const file = newsImage?.files?.[0] || null;
      if (file) {
        const card = document.createElement("div");
        card.className = "dz-thumb";

        const img = document.createElement("img");
        img.alt = file.name;
        img.src = URL.createObjectURL(file);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "×";
        btn.title = "Retirer";
        btn.addEventListener("click", () => {
          if (newsImage) newsImage.value = "";
          renderNewsPreview();
        });

        card.appendChild(img);
        card.appendChild(btn);
        newsPreview.appendChild(card);
        return;
      }

      if (editingNews?.media_type === "image" && editingNews?.media_url) {
        const card = document.createElement("div");
        card.className = "dz-thumb";
        const img = document.createElement("img");
        img.alt = "Image actuelle";
        img.src = resolveUrl(sb, editingNews.media_url);
        card.appendChild(img);
        newsPreview.appendChild(card);
      }
    };

    const renderPubPreview = () => {
      if (!pubPreview) return;
      pubPreview.innerHTML = "";

      const files = Array.from(pubImages?.files || []);
      if (files.length) {
        files.slice(0, 6).forEach((file, idx) => {
          const card = document.createElement("div");
          card.className = "dz-thumb";

          const img = document.createElement("img");
          img.alt = file.name;
          img.src = URL.createObjectURL(file);

          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = "×";
          btn.title = "Retirer";
          btn.addEventListener("click", () => {
            if (!pubImages) return;
            removeFileAt(pubImages, idx);
            renderPubPreview();
          });

          card.appendChild(img);
          card.appendChild(btn);
          pubPreview.appendChild(card);
        });
        return;
      }

      const imgs = Array.isArray(editingPub?.images) ? editingPub.images : [];
      imgs.slice(0, 6).forEach((src) => {
        const card = document.createElement("div");
        card.className = "dz-thumb";
        const img = document.createElement("img");
        img.alt = "Image actuelle";
        img.src = resolveUrl(sb, src);
        card.appendChild(img);
        pubPreview.appendChild(card);
      });
    };

    const syncNewsMediaUI = () => {
      if (!newsForm) return;
      const type = newsForm.elements?.media_type?.value || "image";
      if (newsYoutubeWrap) newsYoutubeWrap.hidden = type !== "youtube";
      if (newsImageWrap) newsImageWrap.hidden = type !== "image";
      renderNewsPreview();
    };

    async function fetchNews(sb) {
      const { data, error } = await sb
        .from("news_posts")
        .select("id,title,body,media_type,media_url,youtube_id,published_at,is_published,created_at")
        .order("published_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data || [];
    }

    async function fetchPublications(sb) {
      const { data, error } = await sb
        .from("publications")
        .select("id,title,body,images,published_at,is_published,created_at")
        .order("published_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data || [];
    }

    const normPubKeyPart = (v) =>
      String(v || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    const pubDedupeKey = (p) => {
      const title = normPubKeyPart(p?.title);
      const body = normPubKeyPart(p?.body);
      const date = String(p?.published_at || "").slice(0, 10);
      return `${title}||${body}||${date}`;
    };

    const findPublicationDuplicates = (list) => {
      const groups = new Map();
      (list || []).forEach((p) => {
        const key = pubDedupeKey(p);
        if (!key.replace(/\|/g, "")) return;
        const arr = groups.get(key);
        if (arr) arr.push(p);
        else groups.set(key, [p]);
      });

      const toDelete = [];
      groups.forEach((arr) => {
        if (arr.length < 2) return;
        const sorted = arr.slice().sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")));
        toDelete.push(...sorted.slice(1)); // keep newest
      });
      return toDelete;
    };

    async function fetchSitePhotos(sb) {
      const slot = getSitePhotoSlot();
      const { data, error } = await sb
        .from("site_photos")
        .select("id,slot,title,alt,path,sort,is_published,created_at")
        .eq("slot", slot)
        .order("sort", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return data || [];
    }

    async function fetchSiteDocuments(sb) {
      const { data, error } = await sb
        .from("site_documents")
        .select("id,kind,title,year,cover_path,pdf_path,sort,is_published,created_at")
        .order("kind", { ascending: true })
        .order("sort", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return data || [];
    }

    async function fetchSiteSources(sb) {
      const { data, error } = await sb
        .from("site_sources")
        .select("id,title,url,meta,sort,is_published,created_at")
        .order("sort", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return data || [];
    }

    const renderNewsList = () => {
      if (!newsList) return;
      newsList.innerHTML = "";
      if (!newsCache.length) {
        newsList.innerHTML = `<p class="muted">Aucune actu pour l’instant.</p>`;
        return;
      }

      newsCache.forEach((p) => {
        const row = document.createElement("div");
        row.className = "admin-item";

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.gap = "12px";

        const img = document.createElement("img");
        img.style.cssText =
          "width:64px;height:64px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.12)";

        const thumb = p.media_type === "image" ? p.media_url : "";
        img.src = thumb ? resolveUrl(sb, thumb) : "";
        if (!img.src) img.style.background = "rgba(255,255,255,.06)";

        const txt = document.createElement("div");
        const status = p.is_published ? "Publié" : "Brouillon";
        const type = p.media_type === "youtube" ? "YouTube" : p.media_type === "image" ? "Image" : "—";
        const when = p.published_at || p.created_at || "";
        txt.innerHTML = `
          <div class="admin-item__meta">${status} • ${type} • ${String(when).slice(0, 10)}</div>
          <div><strong>${p.title || "(sans titre)"}</strong></div>
          ${p.body ? `<div class="admin-item__text">${String(p.body).slice(0, 220)}</div>` : ""}
        `;

        left.appendChild(img);
        left.appendChild(txt);

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "btn";
        btnEdit.textContent = "Modifier";
        btnEdit.addEventListener("click", () => {
          if (!newsForm) return;
          editingNews = p;
          newsForm.elements.id.value = p.id;
          newsForm.elements.title.value = p.title || "";
          newsForm.elements.body.value = p.body || "";
          newsForm.elements.published_at.value = p.published_at || "";
          newsForm.elements.is_published.checked = !!p.is_published;
          newsForm.elements.media_type.value = p.media_type || "image";
          if (newsForm.elements.youtube) newsForm.elements.youtube.value = p.youtube_id || "";
          if (newsImage) newsImage.value = "";
          if (newsCancel) newsCancel.hidden = false;
          setNewsMsg("");
          syncNewsMediaUI();
          renderNewsPreview();
          newsForm.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        const btnPub = document.createElement("button");
        btnPub.type = "button";
        btnPub.className = "btn";
        btnPub.textContent = p.is_published ? "Dépublier" : "Publier";
        btnPub.addEventListener("click", async () => {
          btnPub.disabled = true;
          try {
            const next = !p.is_published;
            const { error } = await sb.from("news_posts").update({ is_published: next }).eq("id", p.id);
            if (error) throw error;
            toast("Statut mis à jour ✅", "ok");
            await refreshNews();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnPub.disabled = false;
          }
        });

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn";
        btnDel.textContent = "Supprimer";
        btnDel.style.borderColor = "rgba(255,100,100,.35)";
        btnDel.addEventListener("click", async () => {
          const ok = confirm(`Supprimer "${p.title || "actu"}" ?`);
          if (!ok) return;
          try {
            const { error } = await sb.from("news_posts").delete().eq("id", p.id);
            if (error) throw error;

            const path = storagePathFromUrl(p.media_url || "");
            if (path) {
              try { await sb.storage.from(getBucket()).remove([path]); } catch {}
            }

            toast("Actu supprimée ✅", "ok");
            await refreshNews();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          }
        });

        actions.appendChild(btnEdit);
        actions.appendChild(btnPub);
        actions.appendChild(btnDel);

        row.appendChild(left);
        row.appendChild(actions);
        newsList.appendChild(row);
      });
    };

    const renderPubList = () => {
      if (!pubList) return;
      pubList.innerHTML = "";
      if (!pubsCache.length) {
        pubList.innerHTML = `<p class="muted">Aucune publication pour l’instant.</p>`;
        return;
      }

      pubsCache.forEach((p) => {
        const row = document.createElement("div");
        row.className = "admin-item";

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.gap = "12px";

        const img = document.createElement("img");
        img.style.cssText =
          "width:64px;height:64px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.12)";

        const first = Array.isArray(p.images) ? p.images[0] : "";
        img.src = first ? resolveUrl(sb, first) : "";
        if (!img.src) img.style.background = "rgba(255,255,255,.06)";

        const txt = document.createElement("div");
        const status = p.is_published ? "Publié" : "Brouillon";
        const when = p.published_at || p.created_at || "";
        const count = Array.isArray(p.images) ? p.images.length : 0;
        txt.innerHTML = `
          <div class="admin-item__meta">${status} • ${String(when).slice(0, 10)} • ${count} image(s)</div>
          <div><strong>${p.title || "(sans titre)"}</strong></div>
          ${p.body ? `<div class="admin-item__text">${String(p.body).slice(0, 220)}</div>` : ""}
        `;

        left.appendChild(img);
        left.appendChild(txt);

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "btn";
        btnEdit.textContent = "Modifier";
        btnEdit.addEventListener("click", () => {
          if (!pubForm) return;
          editingPub = p;
          pubForm.elements.id.value = p.id;
          pubForm.elements.title.value = p.title || "";
          pubForm.elements.body.value = p.body || "";
          pubForm.elements.published_at.value = p.published_at || "";
          pubForm.elements.is_published.checked = !!p.is_published;
          if (pubImages) pubImages.value = "";
          if (pubCancel) pubCancel.hidden = false;
          setPubMsg("");
          renderPubPreview();
          pubForm.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        const btnPub = document.createElement("button");
        btnPub.type = "button";
        btnPub.className = "btn";
        btnPub.textContent = p.is_published ? "Dépublier" : "Publier";
        btnPub.addEventListener("click", async () => {
          btnPub.disabled = true;
          try {
            const next = !p.is_published;
            const { error } = await sb.from("publications").update({ is_published: next }).eq("id", p.id);
            if (error) throw error;
            toast("Statut mis à jour ✅", "ok");
            await refreshPubs();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnPub.disabled = false;
          }
        });

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn";
        btnDel.textContent = "Supprimer";
        btnDel.style.borderColor = "rgba(255,100,100,.35)";
        btnDel.addEventListener("click", async () => {
          const ok = confirm(`Supprimer "${p.title || "publication"}" ?`);
          if (!ok) return;
          try {
            const { error } = await sb.from("publications").delete().eq("id", p.id);
            if (error) throw error;

            const paths = (Array.isArray(p.images) ? p.images : []).map(storagePathFromUrl).filter(Boolean);
            if (paths.length) {
              try { await sb.storage.from(getBucket()).remove(paths); } catch {}
            }

            toast("Publication supprimée ✅", "ok");
            await refreshPubs();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          }
        });

        actions.appendChild(btnEdit);
        actions.appendChild(btnPub);
        actions.appendChild(btnDel);

        row.appendChild(left);
        row.appendChild(actions);
        pubList.appendChild(row);
      });
    };

    const renderDocsList = () => {
      const renderKind = (kind, root) => {
        if (!root) return;
        root.innerHTML = "";

        const list = docsCache
          .filter((d) => (d?.kind || "book") === kind)
          .slice()
          .sort((a, b) => {
            const as = Number(a?.sort) || 0;
            const bs = Number(b?.sort) || 0;
            if (as !== bs) return as - bs;
            return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
          });

        if (!list.length) {
          root.innerHTML = `<p class="muted">Aucun élément pour l’instant.</p>`;
          return;
        }

        list.forEach((d, idx) => {
          const row = document.createElement("div");
          row.className = "admin-item";

          const left = document.createElement("div");
          left.style.display = "flex";
          left.style.gap = "12px";

          const img = document.createElement("img");
          img.style.cssText =
            "width:64px;height:64px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.12)";

          img.src = d?.cover_path ? resolveUrl(sb, d.cover_path) : "";
          if (!img.src) img.style.background = "rgba(255,255,255,.06)";

          const txt = document.createElement("div");
          const status = d.is_published ? "Publié" : "Brouillon";
          const sortVal = Number.isFinite(Number(d.sort)) ? String(d.sort) : "—";
          const label = kind === "press" ? "Presse" : "Livre";
          const meta = [label, d.year].filter(Boolean).join(" • ");
          txt.innerHTML = `
            <div class="admin-item__meta">${status}${meta ? " • " + meta : ""} • sort ${sortVal}</div>
            <div><strong>${d.title || "(sans titre)"}</strong></div>
            <div class="admin-item__text">${d.pdf_path || ""}</div>
          `;

          left.appendChild(img);
          left.appendChild(txt);

          const actions = document.createElement("div");
          actions.className = "admin-actions";

          const btnEdit = document.createElement("button");
          btnEdit.type = "button";
          btnEdit.className = "btn";
          btnEdit.textContent = "Modifier";
          btnEdit.addEventListener("click", () => {
            if (!docsForm) return;
            editingDoc = d;
            docsForm.elements.id.value = d.id;
            docsForm.elements.kind.value = d.kind || "book";
            docsForm.elements.title.value = d.title || "";
            docsForm.elements.year.value = d.year || "";
            docsForm.elements.is_published.checked = !!d.is_published;
            if (docCover) docCover.value = "";
            if (docPdf) docPdf.value = "";
            if (docsCancel) docsCancel.hidden = false;
            setDocsMsg("");
            docsForm.scrollIntoView({ behavior: "smooth", block: "start" });
          });

          const btnOpen = document.createElement("button");
          btnOpen.type = "button";
          btnOpen.className = "btn";
          btnOpen.textContent = "Ouvrir PDF";
          btnOpen.disabled = !d?.pdf_path;
          btnOpen.addEventListener("click", () => {
            const u = d?.pdf_path ? resolveUrl(sb, d.pdf_path) : "";
            if (!u) return;
            window.open(u, "_blank", "noopener,noreferrer");
          });

          const btnUp = document.createElement("button");
          btnUp.type = "button";
          btnUp.className = "btn";
          btnUp.textContent = "Monter";
          btnUp.disabled = idx === 0;
          btnUp.addEventListener("click", async () => moveDoc(kind, idx, -1));

          const btnDown = document.createElement("button");
          btnDown.type = "button";
          btnDown.className = "btn";
          btnDown.textContent = "Descendre";
          btnDown.disabled = idx === list.length - 1;
          btnDown.addEventListener("click", async () => moveDoc(kind, idx, +1));

          const btnPub = document.createElement("button");
          btnPub.type = "button";
          btnPub.className = "btn";
          btnPub.textContent = d.is_published ? "Dépublier" : "Publier";
          btnPub.addEventListener("click", async () => {
            btnPub.disabled = true;
            try {
              const next = !d.is_published;
              const { error } = await sb.from("site_documents").update({ is_published: next }).eq("id", d.id);
              if (error) throw error;
              toast("Statut mis à jour ✅", "ok");
              await refreshDocs();
            } catch (e) {
              console.error(e);
              toast(errText(e), "err");
            } finally {
              btnPub.disabled = false;
            }
          });

          const btnDel = document.createElement("button");
          btnDel.type = "button";
          btnDel.className = "btn";
          btnDel.textContent = "Supprimer";
          btnDel.style.borderColor = "rgba(255,100,100,.35)";
          btnDel.addEventListener("click", async () => {
            const ok = confirm(`Supprimer "${d.title || "document"}" ?`);
            if (!ok) return;

            btnDel.disabled = true;
            try {
              const { error } = await sb.from("site_documents").delete().eq("id", d.id);
              if (error) throw error;

              const paths = []
                .concat(storagePathFromUrl(d.cover_path))
                .concat(storagePathFromUrl(d.pdf_path))
                .filter(Boolean);
              if (paths.length) {
                try { await sb.storage.from(getBucket()).remove(paths); } catch {}
              }

              toast("Document supprimé ✅", "ok");
              await refreshDocs();
            } catch (e) {
              console.error(e);
              toast(errText(e), "err");
            } finally {
              btnDel.disabled = false;
            }
          });

          actions.appendChild(btnEdit);
          actions.appendChild(btnOpen);
          actions.appendChild(btnUp);
          actions.appendChild(btnDown);
          actions.appendChild(btnPub);
          actions.appendChild(btnDel);

          row.appendChild(left);
          row.appendChild(actions);
          root.appendChild(row);
        });
      };

      renderKind("book", docsBooksList);
      renderKind("press", docsPressList);
    };

    const renderSourcesAdminList = () => {
      if (!sourcesAdminList) return;
      sourcesAdminList.innerHTML = "";

      const list = sourcesCache
        .slice()
        .sort((a, b) => {
          const as = Number(a?.sort) || 0;
          const bs = Number(b?.sort) || 0;
          if (as !== bs) return as - bs;
          return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
        });

      if (!list.length) {
        sourcesAdminList.innerHTML = `<p class="muted">Aucune source pour l’instant.</p>`;
        return;
      }

      list.forEach((s, idx) => {
        const row = document.createElement("div");
        row.className = "admin-item";

        const left = document.createElement("div");
        const status = s.is_published ? "Publié" : "Brouillon";
        const sortVal = Number.isFinite(Number(s.sort)) ? String(s.sort) : "—";
        left.innerHTML = `
          <div class="admin-item__meta">${status} • sort ${sortVal}</div>
          <div><strong>${s.title || "(sans titre)"}</strong></div>
          ${s.meta ? `<div class="admin-item__text">${String(s.meta)}</div>` : ""}
          <div class="admin-item__text">${s.url || ""}</div>
        `;

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const btnEdit = document.createElement("button");
        btnEdit.type = "button";
        btnEdit.className = "btn";
        btnEdit.textContent = "Modifier";
        btnEdit.addEventListener("click", () => {
          if (!sourcesForm) return;
          editingSource = s;
          sourcesForm.elements.id.value = s.id;
          sourcesForm.elements.title.value = s.title || "";
          sourcesForm.elements.url.value = s.url || "";
          sourcesForm.elements.meta.value = s.meta || "";
          sourcesForm.elements.is_published.checked = !!s.is_published;
          if (sourcesCancel) sourcesCancel.hidden = false;
          setSourcesMsg("");
          sourcesForm.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        const btnOpen = document.createElement("button");
        btnOpen.type = "button";
        btnOpen.className = "btn";
        btnOpen.textContent = "Ouvrir";
        btnOpen.disabled = !s?.url;
        btnOpen.addEventListener("click", () => {
          const u = String(s?.url || "").trim();
          if (!u) return;
          window.open(u, "_blank", "noopener,noreferrer");
        });

        const btnUp = document.createElement("button");
        btnUp.type = "button";
        btnUp.className = "btn";
        btnUp.textContent = "Monter";
        btnUp.disabled = idx === 0;
        btnUp.addEventListener("click", async () => moveSource(idx, -1));

        const btnDown = document.createElement("button");
        btnDown.type = "button";
        btnDown.className = "btn";
        btnDown.textContent = "Descendre";
        btnDown.disabled = idx === list.length - 1;
        btnDown.addEventListener("click", async () => moveSource(idx, +1));

        const btnPub = document.createElement("button");
        btnPub.type = "button";
        btnPub.className = "btn";
        btnPub.textContent = s.is_published ? "Dépublier" : "Publier";
        btnPub.addEventListener("click", async () => {
          btnPub.disabled = true;
          try {
            const next = !s.is_published;
            const { error } = await sb.from("site_sources").update({ is_published: next }).eq("id", s.id);
            if (error) throw error;
            toast("Statut mis à jour ✅", "ok");
            await refreshSources();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnPub.disabled = false;
          }
        });

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn";
        btnDel.textContent = "Supprimer";
        btnDel.style.borderColor = "rgba(255,100,100,.35)";
        btnDel.addEventListener("click", async () => {
          const ok = confirm(`Supprimer "${s.title || "source"}" ?`);
          if (!ok) return;

          btnDel.disabled = true;
          try {
            const { error } = await sb.from("site_sources").delete().eq("id", s.id);
            if (error) throw error;
            toast("Source supprimée ✅", "ok");
            await refreshSources();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnDel.disabled = false;
          }
        });

        actions.appendChild(btnEdit);
        actions.appendChild(btnOpen);
        actions.appendChild(btnUp);
        actions.appendChild(btnDown);
        actions.appendChild(btnPub);
        actions.appendChild(btnDel);

        row.appendChild(left);
        row.appendChild(actions);
        sourcesAdminList.appendChild(row);
      });
    };

    async function moveDoc(kind, idx, delta) {
      const list = docsCache
        .filter((d) => (d?.kind || "book") === kind)
        .slice()
        .sort((a, b) => {
          const as = Number(a?.sort) || 0;
          const bs = Number(b?.sort) || 0;
          if (as !== bs) return as - bs;
          return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
        });
      const cur = list[idx];
      const other = list[idx + delta];
      if (!cur?.id || !other?.id) return;

      try {
        const aSort = Number(cur.sort) || 0;
        const bSort = Number(other.sort) || 0;
        const nextASort = aSort === bSort ? bSort + (delta > 0 ? 1 : -1) : bSort;

        const { error: e1 } = await sb.from("site_documents").update({ sort: nextASort }).eq("id", cur.id);
        if (e1) throw e1;
        const { error: e2 } = await sb.from("site_documents").update({ sort: aSort }).eq("id", other.id);
        if (e2) throw e2;

        await refreshDocs();
      } catch (e) {
        console.error(e);
        toast(errText(e), "err");
      }
    }

    async function moveSource(idx, delta) {
      const list = sourcesCache
        .slice()
        .sort((a, b) => {
          const as = Number(a?.sort) || 0;
          const bs = Number(b?.sort) || 0;
          if (as !== bs) return as - bs;
          return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
        });
      const cur = list[idx];
      const other = list[idx + delta];
      if (!cur?.id || !other?.id) return;

      try {
        const aSort = Number(cur.sort) || 0;
        const bSort = Number(other.sort) || 0;
        const nextASort = aSort === bSort ? bSort + (delta > 0 ? 1 : -1) : bSort;

        const { error: e1 } = await sb.from("site_sources").update({ sort: nextASort }).eq("id", cur.id);
        if (e1) throw e1;
        const { error: e2 } = await sb.from("site_sources").update({ sort: aSort }).eq("id", other.id);
        if (e2) throw e2;

        await refreshSources();
      } catch (e) {
        console.error(e);
        toast(errText(e), "err");
      }
    }

    const renderSitePhotosList = () => {
      if (!sitePhotosList) return;
      sitePhotosList.innerHTML = "";

      if (!sitePhotosCache.length) {
        sitePhotosList.innerHTML = `<p class="muted">Aucune photo pour “${currentSitePhotoSlotLabel()}” pour l’instant.</p>`;
        return;
      }

      sitePhotosCache.forEach((p, idx) => {
        const row = document.createElement("div");
        row.className = "admin-item";

        const left = document.createElement("div");
        left.style.display = "flex";
        left.style.gap = "12px";

        const img = document.createElement("img");
        img.style.cssText =
          "width:64px;height:64px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.12)";

        img.src = p?.path ? resolveUrl(sb, p.path) : "";
        if (!img.src) img.style.background = "rgba(255,255,255,.06)";

        const txt = document.createElement("div");
        const status = p.is_published ? "Publie" : "Brouillon";
        const sortVal = Number.isFinite(Number(p.sort)) ? String(p.sort) : "—";
        const title = p.title || p.alt || (String(p.path || "").split("/").pop() || "image");
        const slotLabel = SITE_PHOTO_SLOTS[p?.slot]?.label || String(p?.slot || "");
        txt.innerHTML = `
          <div class="admin-item__meta">${status}${slotLabel ? " • " + slotLabel : ""} • sort ${sortVal}</div>
          <div><strong>${title}</strong></div>
          <div class="admin-item__text">${p.path || ""}</div>
        `;

        left.appendChild(img);
        left.appendChild(txt);

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const btnUp = document.createElement("button");
        btnUp.type = "button";
        btnUp.className = "btn";
        btnUp.textContent = "Monter";
        btnUp.disabled = idx === 0;
        btnUp.addEventListener("click", async () => moveSitePhoto(idx, -1));

        const btnDown = document.createElement("button");
        btnDown.type = "button";
        btnDown.className = "btn";
        btnDown.textContent = "Descendre";
        btnDown.disabled = idx === sitePhotosCache.length - 1;
        btnDown.addEventListener("click", async () => moveSitePhoto(idx, +1));

        const btnPub = document.createElement("button");
        btnPub.type = "button";
        btnPub.className = "btn";
        btnPub.textContent = p.is_published ? "Depublier" : "Publier";
        btnPub.addEventListener("click", async () => {
          btnPub.disabled = true;
          try {
            const next = !p.is_published;
            const { error } = await sb.from("site_photos").update({ is_published: next }).eq("id", p.id);
            if (error) throw error;
            toast("Statut mis a jour.", "ok");
            await refreshSitePhotos();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnPub.disabled = false;
          }
        });

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn";
        btnDel.textContent = "Supprimer";
        btnDel.style.borderColor = "rgba(255,100,100,.35)";
        btnDel.addEventListener("click", async () => {
          const ok = confirm("Supprimer cette photo ?");
          if (!ok) return;

          btnDel.disabled = true;
          try {
            const { error } = await sb.from("site_photos").delete().eq("id", p.id);
            if (error) throw error;
            toast("Photo supprimee.", "ok");
            await refreshSitePhotos();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnDel.disabled = false;
          }
        });

        actions.appendChild(btnUp);
        actions.appendChild(btnDown);
        actions.appendChild(btnPub);
        actions.appendChild(btnDel);

        row.appendChild(left);
        row.appendChild(actions);
        sitePhotosList.appendChild(row);
      });
    };

    async function moveSitePhoto(idx, delta) {
      const cur = sitePhotosCache[idx];
      const other = sitePhotosCache[idx + delta];
      if (!cur?.id || !other?.id) return;

      try {
        const aSort = Number(cur.sort) || 0;
        const bSort = Number(other.sort) || 0;
        const nextASort = aSort === bSort ? bSort + (delta > 0 ? 1 : -1) : bSort;

        const { error: e1 } = await sb.from("site_photos").update({ sort: nextASort }).eq("id", cur.id);
        if (e1) throw e1;
        const { error: e2 } = await sb.from("site_photos").update({ sort: aSort }).eq("id", other.id);
        if (e2) throw e2;

        await refreshSitePhotos();
      } catch (e) {
        console.error(e);
        toast(errText(e), "err");
      }
    }

    async function uploadImageToFolder(folder, file) {
      const bucket = getBucket();
      const path = `${folder}/${Date.now()}-${safeName(file.name || "image")}.${extOf(file.name)}`;
      const { error } = await sb.storage.from(bucket).upload(path, file, {
        cacheControl: "31536000",
        upsert: true,
        contentType: file.type || "image/jpeg",
      });
      if (error) throw error;
      return path;
    }

    async function uploadFileToFolder(folder, file) {
      const bucket = getBucket();
      const path = `${folder}/${Date.now()}-${safeName(file.name || "file")}.${extOf(file.name)}`;
      const { error } = await sb.storage.from(bucket).upload(path, file, {
        cacheControl: "31536000",
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
      if (error) throw error;
      return path;
    }

    async function refreshNews() {
      newsCache = await fetchNews(sb);
      renderNewsList();
    }

    async function refreshPubs() {
      pubsCache = await fetchPublications(sb);
      renderPubList();
    }

    async function refreshSitePhotos() {
      if (!sitePhotosList) return;

      try {
        syncSitePhotosUI();
        sitePhotosCache = await fetchSitePhotos(sb);
        renderSitePhotosList();
        setSitePhotosMsg("");
      } catch (e) {
        if (isAbort(e)) return;
        console.warn("[admin] site_photos error", e);
        sitePhotosCache = [];
        renderSitePhotosList();
        setSitePhotosMsg("Erreur de chargement. Cree la table `site_photos` (voir supabase/schema.sql).");
      }
    }

    async function refreshDocs() {
      if (!docsBooksList && !docsPressList) return;

      try {
        docsCache = await fetchSiteDocuments(sb);
        renderDocsList();
        setDocsMsg("");
      } catch (e) {
        if (isAbort(e)) return;
        console.warn("[admin] site_documents error", e);
        docsCache = [];
        renderDocsList();
        setDocsMsg("Erreur de chargement. Cree la table `site_documents` (voir supabase/schema.sql).");
      }
    }

    async function refreshSources() {
      if (!sourcesAdminList) return;

      try {
        sourcesCache = await fetchSiteSources(sb);
        renderSourcesAdminList();
        setSourcesMsg("");
      } catch (e) {
        if (isAbort(e)) return;
        console.warn("[admin] site_sources error", e);
        sourcesCache = [];
        renderSourcesAdminList();
        setSourcesMsg("Erreur de chargement. Cree la table `site_sources` (voir supabase/schema.sql).");
      }
    }

    function resetDocsForm() {
      if (!docsForm) return;
      editingDoc = null;
      docsForm.reset();
      docsForm.elements.id.value = "";
      if (docCover) docCover.value = "";
      if (docPdf) docPdf.value = "";
      if (docsCancel) docsCancel.hidden = true;
      setDocsMsg("");
    }

    function resetSourcesForm() {
      if (!sourcesForm) return;
      editingSource = null;
      sourcesForm.reset();
      sourcesForm.elements.id.value = "";
      if (sourcesCancel) sourcesCancel.hidden = true;
      setSourcesMsg("");
    }

    function resetNewsForm() {
      if (!newsForm) return;
      editingNews = null;
      newsForm.reset();
      newsForm.elements.id.value = "";
      if (newsImage) newsImage.value = "";
      if (newsCancel) newsCancel.hidden = true;
      setNewsMsg("");
      syncNewsMediaUI();
      renderNewsPreview();
    }

    function resetPubForm() {
      if (!pubForm) return;
      editingPub = null;
      pubForm.reset();
      pubForm.elements.id.value = "";
      if (pubImages) pubImages.value = "";
      if (pubCancel) pubCancel.hidden = true;
      setPubMsg("");
      renderPubPreview();
    }

    newsCancel?.addEventListener("click", resetNewsForm);
    pubCancel?.addEventListener("click", resetPubForm);

    pubDedup?.addEventListener("click", async () => {
      if (!pubDedup) return;
      pubDedup.disabled = true;
      try {
        // Fresh data first (avoid acting on stale cache)
        await refreshPubs();

        const duplicates = findPublicationDuplicates(pubsCache);
        if (!duplicates.length) {
          toast("Aucun doublon détecté ✅", "ok");
          return;
        }

        const sample = duplicates
          .slice(0, 6)
          .map((p) => `• ${p?.title || "(sans titre)"}`)
          .join("\n");

        const ok = confirm(
          `Supprimer ${duplicates.length} doublon(s) dans Publications ?\n\n${sample}${duplicates.length > 6 ? "\n…" : ""}`
        );
        if (!ok) return;

        const ids = duplicates.map((p) => p?.id).filter(Boolean);
        const paths = [];
        duplicates.forEach((p) => {
          (Array.isArray(p?.images) ? p.images : []).forEach((u) => {
            const path = storagePathFromUrl(u);
            if (path) paths.push(path);
          });
        });

        if (ids.length) {
          const { error } = await sb.from("publications").delete().in("id", ids);
          if (error) throw error;
        }

        const uniqPaths = Array.from(new Set(paths));
        if (uniqPaths.length) {
          try { await sb.storage.from(getBucket()).remove(uniqPaths); } catch {}
        }

        toast("Doublons supprimés ✅", "ok");
        await refreshPubs();
      } catch (e) {
        if (isAbort(e)) return;
        console.error(e);
        toast(errText(e), "err");
      } finally {
        pubDedup.disabled = false;
      }
    });
    docsCancel?.addEventListener("click", resetDocsForm);
    sourcesCancel?.addEventListener("click", resetSourcesForm);

    newsForm?.elements?.media_type?.addEventListener?.("change", syncNewsMediaUI);
    newsImage?.addEventListener("change", renderNewsPreview);
    pubImages?.addEventListener("change", renderPubPreview);

    docsReload?.addEventListener("click", () => {
      refreshDocs().catch((e) => {
        if (isAbort(e)) return;
        console.error(e);
        toast(errText(e), "err");
      });
    });

    sourcesReload?.addEventListener("click", () => {
      refreshSources().catch((e) => {
        if (isAbort(e)) return;
        console.error(e);
        toast(errText(e), "err");
      });
    });

    sitePhotosReload?.addEventListener("click", () => {
      refreshSitePhotos().catch((e) => {
        if (isAbort(e)) return;
        console.error(e);
        toast(errText(e), "err");
      });
    });

    sitePhotosSlot?.addEventListener("change", () => {
      syncSitePhotosUI();
      refreshSitePhotos().catch((e) => {
        if (isAbort(e)) return;
        console.error(e);
        toast(errText(e), "err");
      });
    });

    docsForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!docsForm) return;

      setDocsMsg("");

      const fd = new FormData(docsForm);
      const id = String(fd.get("id") || "").trim();
      const kind = String(fd.get("kind") || "book").trim() || "book";
      const title = String(fd.get("title") || "").trim();
      const year = String(fd.get("year") || "").trim();
      const is_published = !!docsForm.elements?.is_published?.checked;

      if (!title) return setDocsMsg("Titre requis.");

      const coverFile = docCover?.files?.[0] || null;
      const pdfFile = docPdf?.files?.[0] || null;

      if (!id && !pdfFile) return setDocsMsg("Ajoute un PDF.");

      const btn = docsForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      setDocsMsg("Enregistrement…");

      const old = id
        ? docsCache.find((d) => d.id === id) || (editingDoc?.id === id ? editingDoc : null)
        : null;

      try {
        let cover_path = old?.cover_path || null;
        let pdf_path = old?.pdf_path || null;

        if (coverFile) cover_path = await uploadImageToFolder(`site/documents/${kind}`, coverFile);
        if (pdfFile) pdf_path = await uploadFileToFolder(`site/documents/${kind}`, pdfFile);

        if (!pdf_path) throw new Error("PDF manquant.");

        if (id) {
          const payload = {
            kind,
            title,
            year: year || null,
            cover_path: cover_path || null,
            pdf_path,
            is_published,
          };

          if (old && old.kind !== kind) {
            const maxSort = docsCache
              .filter((d) => (d?.kind || "book") === kind)
              .reduce((m, x) => Math.max(m, Number(x?.sort) || 0), 0);
            payload.sort = (Number.isFinite(maxSort) ? maxSort : 0) + 10;
          }

          const { error } = await sb.from("site_documents").update(payload).eq("id", id);
          if (error) throw error;

          const rm = [];
          if (coverFile && old?.cover_path) {
            const p = storagePathFromUrl(old.cover_path);
            const np = storagePathFromUrl(cover_path);
            if (p && np && p !== np) rm.push(p);
          }
          if (pdfFile && old?.pdf_path) {
            const p = storagePathFromUrl(old.pdf_path);
            const np = storagePathFromUrl(pdf_path);
            if (p && np && p !== np) rm.push(p);
          }
          if (rm.length) {
            try { await sb.storage.from(getBucket()).remove(rm); } catch {}
          }

          toast("Document mis à jour ✅", "ok");
        } else {
          const maxSort = docsCache
            .filter((d) => (d?.kind || "book") === kind)
            .reduce((m, x) => Math.max(m, Number(x?.sort) || 0), 0);
          const sort = (Number.isFinite(maxSort) ? maxSort : 0) + 10;

          const payload = {
            kind,
            title,
            year: year || null,
            cover_path: cover_path || null,
            pdf_path,
            sort,
            is_published,
          };

          const { error } = await sb.from("site_documents").insert(payload);
          if (error) throw error;

          toast("Document ajouté ✅", "ok");
        }

        resetDocsForm();
        await refreshDocs();
      } catch (e1) {
        console.error(e1);
        setDocsMsg("Erreur : " + errText(e1));
        toast(errText(e1), "err");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    sourcesForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!sourcesForm) return;

      setSourcesMsg("");

      const fd = new FormData(sourcesForm);
      const id = String(fd.get("id") || "").trim();
      const title = String(fd.get("title") || "").trim();
      const url = String(fd.get("url") || "").trim();
      const meta = String(fd.get("meta") || "").trim();
      const is_published = !!sourcesForm.elements?.is_published?.checked;

      if (!title) return setSourcesMsg("Titre requis.");
      if (!url) return setSourcesMsg("URL requise.");

      const btn = sourcesForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      setSourcesMsg("Enregistrement…");

      try {
        if (id) {
          const payload = { title, url, meta: meta || null, is_published };
          const { error } = await sb.from("site_sources").update(payload).eq("id", id);
          if (error) throw error;
          toast("Source mise à jour ✅", "ok");
        } else {
          const maxSort = sourcesCache.reduce((m, x) => Math.max(m, Number(x?.sort) || 0), 0);
          const sort = (Number.isFinite(maxSort) ? maxSort : 0) + 10;
          const payload = { title, url, meta: meta || null, sort, is_published };
          const { error } = await sb.from("site_sources").insert(payload);
          if (error) throw error;
          toast("Source ajoutée ✅", "ok");
        }

        resetSourcesForm();
        await refreshSources();
      } catch (e2) {
        console.error(e2);
        setSourcesMsg("Erreur : " + errText(e2));
        toast(errText(e2), "err");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    sitePhotosForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!sitePhotosForm) return;

      setSitePhotosMsg("");

      const slot = getSitePhotoSlot();
      const cfg = SITE_PHOTO_SLOTS[slot] || SITE_PHOTO_SLOTS.drawer_carousel;

      let files = Array.from(sitePhotosFiles?.files || [])
        .filter((f) => (f.type || "").startsWith("image/"))
        .slice(0, cfg?.multiple ? 30 : 1);

      if (!files.length) return setSitePhotosMsg("Ajoute au moins 1 image.");

      const btn = sitePhotosForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      setSitePhotosMsg("Upload...");

      try {
        if (cfg?.multiple) {
          const maxSort = sitePhotosCache.reduce((m, x) => Math.max(m, Number(x?.sort) || 0), 0);
          let sort = (Number.isFinite(maxSort) ? maxSort : 0) + 10;

          for (const file of files) {
            const path = await uploadImageToFolder(cfg.folder, file);
            const payload = { slot, path, sort, is_published: true };
            const { error } = await sb.from("site_photos").insert(payload);
            if (error) throw error;
            sort += 10;
          }
        } else {
          const file = files[0];
          const path = await uploadImageToFolder(cfg.folder, file);
          const payload = { slot, path, sort: 0, is_published: true };

          const { data: created, error } = await sb
            .from("site_photos")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;

          const newId = created?.id;
          if (newId) {
            try {
              await sb.from("site_photos").update({ is_published: false }).eq("slot", slot).neq("id", newId);
            } catch {}
          }
        }

        if (sitePhotosFiles) sitePhotosFiles.value = "";
        toast("Photos ajoutees.", "ok");
        await refreshSitePhotos();
      } catch (e1) {
        console.error(e1);
        setSitePhotosMsg("Erreur : " + errText(e1));
        toast(errText(e1), "err");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    newsForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!newsForm) return;

      setNewsMsg("");
      const fd = new FormData(newsForm);
      const id = String(fd.get("id") || "").trim();
      const title = String(fd.get("title") || "").trim();
      const body = String(fd.get("body") || "").trim();
      const publishedAt = String(fd.get("published_at") || "").trim();
      const isPublished = !!fd.get("is_published");
      const mediaType = String(fd.get("media_type") || "image");

      if (!title) return setNewsMsg("Titre obligatoire.");

      let youtubeId = "";
      let mediaUrl = "";

      if (mediaType === "youtube") {
        const input = String(fd.get("youtube") || "").trim();
        youtubeId = parseYoutubeId(input) || (editingNews?.youtube_id || "");
        if (!youtubeId) return setNewsMsg("YouTube : mets un ID ou une URL valide.");
      } else {
        const file = newsImage?.files?.[0] || null;
        if (file) {
          // upload later (needs id)
        } else if (editingNews?.media_type === "image" && editingNews?.media_url) {
          mediaUrl = editingNews.media_url;
        } else {
          return setNewsMsg("Ajoute une image.");
        }
      }

      setNewsMsg("Enregistrement…");

      try {
        if (id) {
          const payload = {
            title,
            body: body || null,
            media_type: mediaType,
            is_published: isPublished,
            youtube_id: mediaType === "youtube" ? youtubeId : null,
          };
          if (publishedAt) payload.published_at = publishedAt;

          // image upload for update
          if (mediaType === "image") {
            const file = newsImage?.files?.[0] || null;
            if (file) {
              const old = editingNews?.media_url || "";
              const path = await uploadImageToFolder(`news/${id}`, file);
              payload.media_url = path;

              const oldPath = storagePathFromUrl(old);
              if (oldPath) {
                try { await sb.storage.from(getBucket()).remove([oldPath]); } catch {}
              }
            } else {
              payload.media_url = mediaUrl || null;
            }
          } else {
            payload.media_url = null;
          }

          const { error } = await sb.from("news_posts").update(payload).eq("id", id);
          if (error) throw error;

          toast("Actu enregistrée ✅", "ok");
          resetNewsForm();
          await refreshNews();
          return;
        }

        // insert
        const base = {
          title,
          body: body || null,
          media_type: mediaType,
          is_published: isPublished,
          youtube_id: mediaType === "youtube" ? youtubeId : null,
          media_url: null,
        };
        if (publishedAt) base.published_at = publishedAt;

        const { data: created, error: insErr } = await sb
          .from("news_posts")
          .insert(base)
          .select("id")
          .single();
        if (insErr) throw insErr;

        const newId = created?.id;
        if (!newId) throw new Error("Impossible de récupérer l’ID de l’actu.");

        if (mediaType === "image") {
          const file = newsImage?.files?.[0] || null;
          if (!file) throw new Error("Ajoute une image.");
          const path = await uploadImageToFolder(`news/${newId}`, file);
          const { error: upErr } = await sb.from("news_posts").update({ media_url: path }).eq("id", newId);
          if (upErr) throw upErr;
        }

        toast("Actu créée ✅", "ok");
        resetNewsForm();
        await refreshNews();
      } catch (e1) {
        console.error(e1);
        setNewsMsg("Erreur : " + errText(e1));
        toast(errText(e1), "err");
      }
    });

    pubForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!pubForm) return;

      setPubMsg("");
      const fd = new FormData(pubForm);
      const id = String(fd.get("id") || "").trim();
      const title = String(fd.get("title") || "").trim();
      const body = String(fd.get("body") || "").trim();
      const publishedAt = String(fd.get("published_at") || "").trim();
      const isPublished = !!fd.get("is_published");

      if (!title) return setPubMsg("Titre obligatoire.");

      const files = Array.from(pubImages?.files || []).slice(0, 6);

      const btn = pubForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      setPubMsg("Enregistrement…");
      try {
        if (id) {
          const payload = {
            title,
            body: body || null,
            is_published: isPublished,
          };
          if (publishedAt) payload.published_at = publishedAt;

          if (files.length) {
            const folder = `publications/${id}`;
            const paths = [];
            for (const f of files) paths.push(await uploadImageToFolder(folder, f));
            payload.images = paths;
          }

          const { error } = await sb.from("publications").update(payload).eq("id", id);
          if (error) throw error;

          toast("Publication enregistrée ✅", "ok");
          resetPubForm();
          await refreshPubs();
          return;
        }

        const base = {
          title,
          body: body || null,
          is_published: isPublished,
          images: [],
        };
        if (publishedAt) base.published_at = publishedAt;

        const { data: created, error: insErr } = await sb
          .from("publications")
          .insert(base)
          .select("id")
          .single();
        if (insErr) throw insErr;

        const newId = created?.id;
        if (!newId) throw new Error("Impossible de récupérer l’ID de la publication.");

        if (files.length) {
          const folder = `publications/${newId}`;
          const paths = [];
          for (const f of files) paths.push(await uploadImageToFolder(folder, f));
          const { error: upErr } = await sb.from("publications").update({ images: paths }).eq("id", newId);
          if (upErr) throw upErr;
        }

        toast("Publication créée ✅", "ok");
        resetPubForm();
        await refreshPubs();
      } catch (e1) {
        console.error(e1);
        setPubMsg("Erreur : " + errText(e1));
        toast(errText(e1), "err");
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    // ---------- Comments moderation ----------
    const moderationList = qs("#moderationList");
    const modMsg = qs("#modMsg");

    const setModMsg = (t) => {
      if (!modMsg) return;
      modMsg.textContent = t || "";
    };

    async function refreshModeration() {
      if (!moderationList) return;
      moderationList.innerHTML = "";
      setModMsg("Chargement…");

      const { data: comments, error } = await sb
        .from("news_comments")
        .select("id,post_id,name,message,created_at,approved")
        .eq("approved", false)
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) {
        console.error(error);
        setModMsg("Impossible de charger la modération (RLS ?).");
        return;
      }

      const list = comments || [];
      if (!list.length) {
        setModMsg("");
        moderationList.innerHTML = `<p class="muted">Aucun commentaire en attente.</p>`;
        return;
      }

      const postIds = Array.from(new Set(list.map((c) => c.post_id).filter(Boolean)));
      let titlesById = {};
      if (postIds.length) {
        const { data: posts } = await sb.from("news_posts").select("id,title").in("id", postIds);
        (posts || []).forEach((p) => (titlesById[p.id] = p.title || ""));
      }

      setModMsg("");

      list.forEach((c) => {
        const row = document.createElement("div");
        row.className = "admin-item";

        const when = (() => {
          try { return new Date(c.created_at).toLocaleString("fr-FR"); } catch { return String(c.created_at || ""); }
        })();

        const left = document.createElement("div");
        left.innerHTML = `
          <div class="admin-item__meta">
            ${String(c.name || "—")} • ${when} • ${titlesById[c.post_id] ? titlesById[c.post_id] : String(c.post_id || "").slice(0, 8)}
          </div>
          <div class="admin-item__text"></div>
        `;
        left.querySelector(".admin-item__text").textContent = c.message || "";

        const actions = document.createElement("div");
        actions.className = "admin-actions";

        const btnApprove = document.createElement("button");
        btnApprove.type = "button";
        btnApprove.className = "btn";
        btnApprove.textContent = "Approuver";
        btnApprove.addEventListener("click", async () => {
          btnApprove.disabled = true;
          try {
            const { error: upErr } = await sb.from("news_comments").update({ approved: true }).eq("id", c.id);
            if (upErr) throw upErr;
            toast("Commentaire approuvé ✅", "ok");
            await refreshModeration();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnApprove.disabled = false;
          }
        });

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn";
        btnDel.textContent = "Supprimer";
        btnDel.style.borderColor = "rgba(255,100,100,.35)";
        btnDel.addEventListener("click", async () => {
          const ok = confirm("Supprimer ce commentaire ?");
          if (!ok) return;

          btnDel.disabled = true;
          try {
            const { error: delErr } = await sb.from("news_comments").delete().eq("id", c.id);
            if (delErr) throw delErr;
            toast("Commentaire supprimé ✅", "ok");
            await refreshModeration();
          } catch (e) {
            console.error(e);
            toast(errText(e), "err");
          } finally {
            btnDel.disabled = false;
          }
        });

        actions.appendChild(btnApprove);
        actions.appendChild(btnDel);

        row.appendChild(left);
        row.appendChild(actions);
        moderationList.appendChild(row);
      });
    }

    // Bind local admin login form (fallback / avoids redirects)
    const loginForm = qs("#loginForm");
    loginForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msgEl = qs("#loginMsg");
      if (msgEl) msgEl.textContent = "Connexion…";

      const fd = new FormData(loginForm);
      const email = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "");

      try {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const res = await ensureAdmin(sb);
        if (!res.ok) {
          if (res.reason === "not_admin") {
            await sb.auth.signOut();
            showLogin(
              "Accès refusé : ce compte n’est pas admin. Dans Supabase → Table Editor → profiles : mets `role=admin` pour ton user, puis reconnecte-toi."
            );
            return;
          }
          showLogin("Erreur d’auth: " + errText(res.error || res.reason));
          return;
        }

        if (msgEl) msgEl.textContent = "";
        toast("Connecté ✅", "ok");
        await initAuthed(res);
      } catch (err) {
        if (isAbort(err)) return;
        console.error(err);
        if (msgEl) msgEl.textContent = "Erreur : " + errText(err);
      }
    });

    // OAuth login (Google) - convenient shortcut for studio/admin
    document.querySelectorAll("[data-admin-oauth]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const msgEl = qs("#loginMsg");
        const provider = String(btn.getAttribute("data-admin-oauth") || "").trim();
        if (!provider) return;

        if (location.protocol === "file:") {
          if (msgEl) msgEl.textContent = "OAuth nécessite un site servi en http(s) (pas file://).";
          return;
        }

        try {
          btn.disabled = true;
          if (msgEl) msgEl.textContent = `Redirection ${provider}…`;

          // Redirect back to this exact admin page (works for root deploy + GitHub Pages subpaths).
          const redirectTo = new URL(location.pathname, location.origin).toString();

          const { error } = await sb.auth.signInWithOAuth({
            provider,
            options: { redirectTo },
          });
          if (error) throw error;
        } catch (err) {
          if (isAbort(err)) return;
          console.error(err);
          if (msgEl) msgEl.textContent = "Erreur : " + errText(err);
          try { btn.disabled = false; } catch {}
        }
      });
    });

    async function initAuthed(res) {
      showDash();

      const adminUser = qs("#adminUser");
      if (adminUser) adminUser.textContent = res.user.email || "";

      const btnSignOut = qs("#btnSignOut") || qs("[data-logout]");
      btnSignOut?.addEventListener("click", async () => {
        try { await sb.auth.signOut(); } catch {}
        toast("Déconnecté.", "ok");
        showLogin();
      });

      ensureWorkModal();
      bindModalEvents();
      initNav();
      syncNewsMediaUI();
      renderPubPreview();

      try {
        await refreshWorks();
        await refreshNews();
        await refreshPubs();
        await refreshDocs();
        await refreshSources();
        await refreshSitePhotos();
        await refreshModeration();
      } catch (e) {
        if (isAbort(e)) return;
        console.error(e);
        toast(errText(e), "err");
      }
    }

    // 1) Guard (no redirect; show login card)
    let res;
    try {
      res = await ensureAdmin(sb);
    } catch (e) {
      if (isAbort(e)) return;
      console.error(e);
      showLogin(errText(e));
      return;
    }

    if (!res.ok) {
      if (res.reason === "not_logged") {
        showLogin();
        return;
      }
      if (res.reason === "not_admin") {
        try { await sb.auth.signOut(); } catch {}
        showLogin(
          "Accès refusé : ce compte n’est pas admin. Dans Supabase → Table Editor → profiles : mets `role=admin` pour ton user, puis reconnecte-toi."
        );
        return;
      }
      showLogin("Erreur d’auth: " + errText(res.error || res.reason));
      return;
    }

    await initAuthed(res);
  }

  window.addEventListener("DOMContentLoaded", () => {
    boot().catch((err) => {
      if (isAbort(err)) return;
      console.error(err);
    });
  });
})();
