// js/gallery.js (v5)
// Tables: works (+ optional work_images)
(() => {
  "use strict";
  if (window.__MMG_GALLERY_INIT__) return;
  window.__MMG_GALLERY_INIT__ = true;

  const qs = (s, r = document) => r.querySelector(s);

  const getSB = () => window.mmgSupabase || null;
  const getBucket = () => (window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media");

  const waitForSB = async (timeoutMs = 6000) => {
    if (getSB()) return getSB();

    // If Supabase init already finished (success or failure), don't wait.
    const status = window.__MMG_SB_STATUS__;
    if (status && status !== "loading") return null;

    return await new Promise((resolve) => {
      let done = false;
      const onReady = () => {
        if (done) return;
        done = true;
        resolve(getSB());
      };

      document.addEventListener("sb:ready", onReady, { once: true });

      setTimeout(() => {
        if (done) return;
        done = true;
        document.removeEventListener("sb:ready", onReady);
        resolve(getSB());
      }, timeoutMs);
    });
  };

  const resolveUrl = (uOrPath) => {
    const v = String(uOrPath || "").trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/")) return v;

    const sb = getSB();
    if (!sb?.storage) return v;
    const { data } = sb.storage.from(getBucket()).getPublicUrl(v);
    return data?.publicUrl || v;
  };

  const errText = (e) =>
    e?.message || e?.error_description || e?.hint || e?.details || String(e || "Erreur");

  const state = {
    page: 0,
    pageSize: 24,
    all: [],
    view: [],
    q: "",
    cat: "all",
    hasMore: true,
    loading: false,
    error: "",
    isAdmin: false,
    user: null,
    adminMenuEl: null,
    editingId: null,
    lightboxIndex: -1,
    zoom: 1,
    panX: 0,
    panY: 0,
  };

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

  const storagePathFromUrl = (uOrPath) => {
    const v = String(uOrPath || "").trim();
    if (!v) return "";
    if (v.startsWith("/")) return ""; // local asset (not storage)
    if (v.startsWith("http://") || v.startsWith("https://")) {
      // public URL: .../storage/v1/object/public/<bucket>/<path>
      const m1 = v.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
      if (m1?.[1]) {
        try { return decodeURIComponent(m1[1]); } catch { return m1[1]; }
      }
      // signed URL: .../storage/v1/object/sign/<bucket>/<path>?token=...
      const m2 = v.match(/\/storage\/v1\/object\/sign\/[^/]+\/([^?]+)(?:\?|$)/);
      if (m2?.[1]) {
        try { return decodeURIComponent(m2[1]); } catch { return m2[1]; }
      }
      return "";
    }

    // already a storage path
    return v;
  };

  const closeAdminMenu = () => {
    if (!state.adminMenuEl) return;
    state.adminMenuEl.hidden = true;
    state.adminMenuEl = null;
  };

  const toggleAdminMenu = (menuEl) => {
    if (!menuEl) return;
    const isOpen = state.adminMenuEl === menuEl && menuEl.hidden === false;
    closeAdminMenu();
    if (!isOpen) {
      menuEl.hidden = false;
      state.adminMenuEl = menuEl;
    }
  };

  const getWorkById = (id) => state.all.find((w) => String(w.id) === String(id)) || null;

  function normalizeImages(work, extraPaths = []) {
    const out = [];

    // cover/thumb
    if (work.cover_url) out.push(resolveUrl(work.cover_url));
    else if (work.thumb_url) out.push(resolveUrl(work.thumb_url));

    // images jsonb (array)
    const imgs = work.images;
    if (Array.isArray(imgs)) {
      imgs.forEach((it) => {
        if (typeof it === "string") out.push(resolveUrl(it));
        else if (it && typeof it === "object" && it.url) out.push(resolveUrl(it.url));
      });
    }

    // work_images paths
    extraPaths.forEach((p) => out.push(resolveUrl(p)));

    // unique
    return Array.from(new Set(out.filter(Boolean)));
  }

  function applyFilters() {
    const q = state.q.toLowerCase();
    const cat = state.cat;

    state.view = state.all.filter((w) => {
      const inCat = cat === "all" ? true : (String(w.category || "").trim() === cat);
      if (!inCat) return false;

      if (!q) return true;
      const blob = `${w.title || ""} ${w.year || ""} ${w.category || ""}`.toLowerCase();
      return blob.includes(q);
    });
  }

  function renderCategories() {
    const sel = qs("#cat");
    if (!sel) return;

    const cats = Array.from(
      new Set(state.all.map((w) => String(w.category || "").trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, "fr"));

    const current = sel.value || "all";
    sel.innerHTML = `<option value="all">Toutes les catégories</option>` +
      cats.map((c) => `<option value="${c}">${c}</option>`).join("");

    sel.value = cats.includes(current) ? current : "all";
  }

  function renderGrid() {
    const grid = qs("#grid");
    if (!grid) return;

    grid.innerHTML = "";

    const loadMore = qs("#loadMore");
    if (loadMore) loadMore.disabled = state.loading || !state.hasMore;

    const count = qs("#workCount");
    if (count) {
      const shown = state.view.length;
      const loaded = state.all.length;
      count.textContent = state.loading
        ? "Chargement…"
        : `${shown} œuvre${shown > 1 ? "s" : ""} affichée${shown > 1 ? "s" : ""} • ${loaded} chargée${loaded > 1 ? "s" : ""}`;
    }

    if (state.error) {
      grid.innerHTML = `
        <div class="muted" style="padding:14px 0">
          ${state.error}
        </div>
      `;
      return;
    }

    if (state.loading && !state.all.length) {
      grid.innerHTML = `
        <div class="muted" style="padding:14px 0">
          Chargement…
        </div>
      `;
      return;
    }

    if (!state.view.length) {
      grid.innerHTML = `
        <div class="muted" style="padding:14px 0">
          ${state.isAdmin ? "Aucune œuvre à afficher pour le moment." : "Aucune œuvre publiée pour le moment."}
        </div>
      `;
      return;
    }

    state.view.forEach((w, idx) => {
      const img = w._imgs?.[0] || "";
      const subParts = [w.year, w.category].filter(Boolean);
      if (state.isAdmin && w.is_published === false) subParts.unshift("Brouillon");
      const sub = subParts.join(" • ");

      const card = document.createElement("article");
      card.className = "work work--gallery";
      card.setAttribute("aria-label", w.title || "Œuvre");
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.dataset.workId = String(w.id);

      card.innerHTML = `
        ${img ? `<img loading="lazy" decoding="async" src="${img}" alt="">` : ""}
        <div class="meta">
          <div style="font-weight:700">${w.title || "—"}</div>
          ${sub ? `<div class="muted" style="font-size:12px">${sub}</div>` : ""}
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.defaultPrevented) return;
        openLightbox(idx);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        openLightbox(idx);
      });

      if (state.isAdmin && !String(w.id).startsWith("demo-")) {
        const admin = document.createElement("div");
        admin.className = "work-admin";
        admin.innerHTML = `
          <button type="button" class="work-admin__btn" aria-label="Options">⋯</button>
          <div class="work-admin__menu" role="menu" hidden>
            <button type="button" data-action="edit">Modifier</button>
            <button type="button" data-action="toggle">${w.is_published ? "Dépublier" : "Publier"}</button>
            <button type="button" data-action="delete" class="danger">Supprimer</button>
          </div>
        `;

        const btn = admin.querySelector(".work-admin__btn");
        const menu = admin.querySelector(".work-admin__menu");

        btn?.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleAdminMenu(menu);
        });

        menu?.addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          e.preventDefault();
          e.stopPropagation();

          const action = b.dataset.action;
          closeAdminMenu();

          if (action === "edit") openEditModal(String(w.id));
          if (action === "toggle") togglePublish(String(w.id));
          if (action === "delete") deleteWork(String(w.id));
        });

        // Prevent menu clicks from opening lightbox
        admin.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });

        card.appendChild(admin);
      }

      grid.appendChild(card);
    });

    // loadMore disabled handled above
  }

  function setZoom(zoom) {
    state.zoom = Math.max(1, Math.min(4, zoom));
    const img = qs("#lbImg");
    if (img) img.style.transform = `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  }

  function resetPanZoom() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    setZoom(1);
  }

  function renderLightbox() {
    const lb = qs("#lightbox");
    const img = qs("#lbImg");
    const title = qs("#lbTitle");
    const count = qs("#lbCount");
    if (!lb || !img) return;

    const w = state.view[state.lightboxIndex];
    if (!w) return;

    const src = w._imgs?.[0] || "";
    img.src = src;
    img.alt = w.title || "";

    if (title) title.textContent = w.title || "—";
    if (count) count.textContent = `${state.lightboxIndex + 1}/${state.view.length}`;

    resetPanZoom();
  }

  function openLightbox(index) {
    const lb = qs("#lightbox");
    if (!lb) return;

    state.lightboxIndex = index;
    lb.hidden = false;
    lb.classList.add("is-open");
    lb.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderLightbox();
  }

  function closeLightbox() {
    const lb = qs("#lightbox");
    if (!lb) return;
    lb.hidden = true;
    lb.classList.remove("is-open");
    lb.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function navLightbox(dir) {
    if (!state.view.length) return;
    state.lightboxIndex = (state.lightboxIndex + dir + state.view.length) % state.view.length;
    renderLightbox();
  }

  function setEditModalOpen(open) {
    const modal = qs("#workEditModal");
    if (!modal) return;
    modal.hidden = !open;
    modal.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  function ensureEditModal() {
    if (qs("#workEditModal")) return;

    const modal = document.createElement("section");
    modal.id = "workEditModal";
    modal.className = "mmg-modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="mmg-card" role="dialog" aria-modal="true" aria-labelledby="weTitle">
        <div class="mmg-head">
          <div style="min-width:0">
            <div class="kicker">Édition</div>
            <h2 id="weTitle" class="mmg-title" style="margin:10px 0 0">Modifier une œuvre</h2>
            <div id="weMeta" class="muted small-note" style="margin-top:6px"></div>
          </div>
          <button type="button" class="icon-btn" data-we-close aria-label="Fermer">×</button>
        </div>

        <div class="hr"></div>

        <form id="workEditForm" class="mmg-form" autocomplete="off">
          <div class="columns">
            <div>
              <label class="mmg-label" for="weTitleInput">Titre</label>
              <input id="weTitleInput" class="field" name="title" required />
            </div>
            <div>
              <label class="mmg-label" for="weYearInput">Année</label>
              <input id="weYearInput" class="field" name="year" inputmode="numeric" />
            </div>
          </div>

          <div class="columns">
            <div>
              <label class="mmg-label" for="weCatInput">Catégorie</label>
              <input id="weCatInput" class="field" name="category" />
            </div>
            <div>
              <label class="mmg-label" for="weSortInput">Ordre</label>
              <input id="weSortInput" class="field" name="sort" inputmode="numeric" />
            </div>
          </div>

          <div>
            <label class="mmg-label" for="weDescInput">Texte</label>
            <textarea id="weDescInput" class="field" name="description" rows="4"></textarea>
          </div>

          <div class="mmg-row">
            <label class="mmg-check">
              <input type="checkbox" name="is_published" />
              <span>Publié</span>
            </label>

            <label class="mmg-file">
              <span class="muted small-note">Remplacer l’image</span>
              <input type="file" name="cover" accept="image/*" />
            </label>
          </div>

          <div class="mmg-actions">
            <button type="button" class="btn ghost" data-we-delete>Supprimer</button>
            <div class="mmg-actions__right">
              <button type="button" class="btn ghost" data-we-cancel>Annuler</button>
              <button type="submit" class="btn">Enregistrer</button>
            </div>
          </div>

          <div id="weMsg" class="muted small-note" style="min-height:18px"></div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
      state.editingId = null;
      const form = qs("#workEditForm");
      if (form) form.reset();
      const msg = qs("#weMsg");
      if (msg) msg.textContent = "";
      setEditModalOpen(false);
    };

    modal.addEventListener("click", (e) => {
      if (e.target === modal) close();
    });

    qs("[data-we-close]", modal)?.addEventListener("click", close);
    qs("[data-we-cancel]", modal)?.addEventListener("click", close);

    qs("[data-we-delete]", modal)?.addEventListener("click", async () => {
      if (!state.editingId) return;
      await deleteWork(state.editingId);
      if (!getWorkById(state.editingId)) close();
    });

    qs("#workEditForm", modal)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.editingId) return;

      const sb = await waitForSB();
      if (!sb || !state.isAdmin) return;

      const w = getWorkById(state.editingId);
      if (!w) return;

      const form = e.target;
      const msg = qs("#weMsg");
      const meta = qs("#weMeta");
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
      const safeSort = Number.isFinite(sortVal)
        ? sortVal
        : Number.isFinite(w.sort)
        ? w.sort
        : 1000;

      const payload = {
        title,
        year: Number.isFinite(yearVal) ? yearVal : null,
        category: category || null,
        sort: safeSort,
        description: description || null,
        is_published: isPublished,
      };

      // Upload cover if provided
      const coverInput = form.querySelector('input[name="cover"]');
      const file = coverInput?.files?.[0] || null;
      if (file) {
        try {
          const bucket = getBucket();
          const path = `works/${w.id}/${Date.now()}-${safeName(file.name || "cover")}.${extOf(file.name)}`;
          const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
            cacheControl: "31536000",
            upsert: true,
            contentType: file.type || "image/jpeg",
          });
          if (upErr) throw upErr;

          const existing = Array.isArray(w.images)
            ? w.images.map((it) => (typeof it === "string" ? it : it?.url)).filter(Boolean)
            : [];

          payload.cover_url = path;
          payload.thumb_url = path;
          payload.images = [path].concat(existing.filter((x) => x !== path));
        } catch (e2) {
          if (msg) msg.textContent = "Upload image impossible : " + errText(e2);
          return;
        }
      }

      try {
        const { error } = await sb.from("works").update(payload).eq("id", w.id);
        if (error) throw error;

        Object.assign(w, payload);
        w._imgs = normalizeImages(w);

        renderCategories();
        applyFilters();
        renderGrid();

        if (meta) meta.textContent = `#${String(w.id).slice(0, 8)} • ${w.is_published ? "Publié" : "Brouillon"}`;
        if (msg) msg.textContent = "✅ Enregistré.";

        // keep open a moment, then close
        setTimeout(() => {
          if (qs("#workEditModal")?.hidden) return;
          close();
        }, 650);
      } catch (e1) {
        console.error(e1);
        if (msg) msg.textContent = "Erreur : " + errText(e1);
      }
    });
  }

  function openEditModal(id) {
    ensureEditModal();
    const w = getWorkById(id);
    if (!w) return;

    state.editingId = String(id);

    const modal = qs("#workEditModal");
    const form = qs("#workEditForm");
    if (!modal || !form) return;

    const meta = qs("#weMeta");
    if (meta) meta.textContent = `#${String(w.id).slice(0, 8)} • ${w.is_published ? "Publié" : "Brouillon"}`;

    form.querySelector('[name="title"]').value = w.title || "";
    form.querySelector('[name="year"]').value = w.year ?? "";
    form.querySelector('[name="category"]').value = w.category || "";
    form.querySelector('[name="sort"]').value = w.sort ?? 1000;
    form.querySelector('[name="description"]').value = w.description || "";
    form.querySelector('[name="is_published"]').checked = !!w.is_published;
    const coverInput = form.querySelector('input[name="cover"]');
    if (coverInput) coverInput.value = "";

    const msg = qs("#weMsg");
    if (msg) msg.textContent = "";

    setEditModalOpen(true);
    form.querySelector("#weTitleInput")?.focus();
  }

  async function loadFallbackWorks() {
    try {
      const res = await fetch("data/works.json", { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      if (!Array.isArray(data)) return [];

      return data.map((x, i) => {
        const src = String(x?.src || x?.thumb || "").trim();
        const thumb = String(x?.thumb || x?.src || "").trim();
        const imgs = Array.from(new Set([src, thumb].filter(Boolean))).map(resolveUrl);

        return {
          id: `demo-${i}`,
          title: x?.title || `Œuvre ${String(i + 1).padStart(3, "0")}`,
          year: x?.year || "",
          category: x?.category || "",
          description: "",
          cover_url: src,
          thumb_url: thumb,
          images: [],
          sort: i,
          is_published: true,
          created_at: "",
          _imgs: imgs,
        };
      });
    } catch {
      return [];
    }
  }

  async function fetchPage() {
    if (state.loading || !state.hasMore) return;

    state.loading = true;
    state.error = "";
    renderGrid();

    const sb = await waitForSB();
    if (!sb) {
      if (state.page === 0 && !state.all.length) {
        const fallback = await loadFallbackWorks();
        if (fallback.length) {
          state.all = fallback;
          state.hasMore = false;
          state.page = 1;
          renderCategories();
          applyFilters();
          state.loading = false;
          renderGrid();
          return;
        }
      }

      state.loading = false;
      state.hasMore = false;
      state.error = "Connexion indisponible. Impossible de charger la galerie.";
      renderGrid();
      return;
    }

    const from = state.page * state.pageSize;
    const to = from + state.pageSize - 1;

    let q = sb
      .from("works")
      .select("id,title,year,category,description,cover_url,thumb_url,images,sort,is_published,created_at")
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!state.isAdmin) q = q.eq("is_published", true);

    const { data: works, error } = await q;

    if (error) {
      console.warn("[gallery] load error:", error);
      state.loading = false;
      state.error = error.message || "Erreur de chargement.";
      renderGrid();
      return;
    }

    const list = works || [];
    state.hasMore = list.length === state.pageSize;
    state.page += 1;

    // charge work_images pour ces works
    const ids = list.map((w) => w.id);
    let imagesByWork = {};
    if (ids.length) {
      const { data: imgs, error: imgsErr } = await sb
        .from("work_images")
        .select("work_id,path,sort_order")
        .in("work_id", ids)
        .order("sort_order", { ascending: true });

      if (imgsErr) console.warn("[gallery] work_images error:", imgsErr);
      (imgs || []).forEach((it) => {
        (imagesByWork[it.work_id] ||= []).push(it.path);
      });
    }

    const normalized = list.map((w) => ({
      ...w,
      _imgs: normalizeImages(w, imagesByWork[w.id] || []),
    }));

    state.all = state.all.concat(normalized);

    renderCategories();
    applyFilters();
    state.loading = false;
    renderGrid();
  }

  async function togglePublish(id) {
    const sb = await waitForSB();
    if (!sb || !state.isAdmin) return;

    const w = getWorkById(id);
    if (!w) return;

    const next = !w.is_published;
    try {
      const { error } = await sb.from("works").update({ is_published: next }).eq("id", w.id);
      if (error) throw error;
      w.is_published = next;
      applyFilters();
      renderGrid();
    } catch (e) {
      console.error(e);
      alert("Erreur : " + errText(e));
    }
  }

  async function deleteWork(id) {
    const sb = await waitForSB();
    if (!sb || !state.isAdmin) return;

    const w = getWorkById(id);
    if (!w) return;

    const ok = confirm(`Supprimer "${w.title || "œuvre"}" ?`);
    if (!ok) return;

    const bucket = getBucket();
    const candidates = []
      .concat(w.cover_url || "")
      .concat(w.thumb_url || "")
      .concat(Array.isArray(w.images) ? w.images : []);

    const paths = Array.from(
      new Set(
        candidates
          .map((it) => (typeof it === "string" ? it : it?.url))
          .map(storagePathFromUrl)
          .filter(Boolean)
      )
    );

    try {
      const { error } = await sb.from("works").delete().eq("id", w.id);
      if (error) throw error;

      // best-effort storage cleanup
      if (paths.length) {
        try { await sb.storage.from(bucket).remove(paths); } catch {}
      }

      // Remove from local state
      state.all = state.all.filter((x) => String(x.id) !== String(w.id));
      applyFilters();
      renderGrid();

      // close lightbox if it was showing that work
      const lb = qs("#lightbox");
      if (lb && !lb.hidden) {
        const cur = state.view[state.lightboxIndex];
        if (!cur || String(cur.id) === String(w.id)) closeLightbox();
      }
    } catch (e) {
      console.error(e);
      alert("Erreur : " + errText(e));
    }
  }

  async function detectAdmin() {
    const sb = await waitForSB();
    if (!sb?.auth) return false;

    const { data, error } = await sb.auth.getSession();
    if (error) return false;

    const user = data?.session?.user || null;
    state.user = user;
    if (!user) return false;

    const { data: prof, error: pErr } = await sb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) return false;
    state.isAdmin = prof?.role === "admin";
    return state.isAdmin;
  }

  function bindUI() {
    qs("#q")?.addEventListener("input", (e) => {
      state.q = e.target.value || "";
      applyFilters();
      renderGrid();
    });

    qs("#cat")?.addEventListener("change", (e) => {
      state.cat = e.target.value || "all";
      applyFilters();
      renderGrid();
    });

    qs("#loadMore")?.addEventListener("click", fetchPage);

    // Lightbox
    qs("[data-close]")?.addEventListener("click", closeLightbox);
    qs("#lightbox")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "lightbox") closeLightbox();
    });

    qs('[data-nav="prev"]')?.addEventListener("click", () => navLightbox(-1));
    qs('[data-nav="next"]')?.addEventListener("click", () => navLightbox(+1));

    qs('[data-zoom="in"]')?.addEventListener("click", () => setZoom(state.zoom + 0.25));
    qs('[data-zoom="out"]')?.addEventListener("click", () => setZoom(state.zoom - 0.25));
    qs('[data-zoom="reset"]')?.addEventListener("click", resetPanZoom);

    window.addEventListener("keydown", (e) => {
      const lb = qs("#lightbox");
      if (!lb || lb.hidden || !lb.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") navLightbox(-1);
      if (e.key === "ArrowRight") navLightbox(+1);
    });

    // Close admin menu on outside click
    document.addEventListener("click", () => closeAdminMenu());

    // Escape closes menu + modal
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      closeAdminMenu();
      if (qs("#workEditModal") && !qs("#workEditModal").hidden) {
        setEditModalOpen(false);
        state.editingId = null;
      }
    });
  }

  async function init() {
    // si pas sur la page galerie, stop
    if (!qs("#grid")) return;

    bindUI();
    await detectAdmin();
    await fetchPage();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
