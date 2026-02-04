// js/gallery.js (v3)
// Tables: works + work_images
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
    lightboxIndex: -1,
    zoom: 1,
    panX: 0,
    panY: 0,
  };

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
          Aucune œuvre publiée pour le moment.
        </div>
      `;
      return;
    }

    state.view.forEach((w, idx) => {
      const img = w._imgs?.[0] || "";
      const sub = [w.year, w.category].filter(Boolean).join(" • ");
      const card = document.createElement("button");
      card.type = "button";
      card.className = "work work--gallery";
      card.setAttribute("aria-label", w.title || "Œuvre");

      card.innerHTML = `
        ${img ? `<img loading="lazy" decoding="async" src="${img}" alt="">` : ""}
        <div class="meta">
          <div style="font-weight:700">${w.title || "—"}</div>
          ${sub ? `<div class="muted" style="font-size:12px">${sub}</div>` : ""}
        </div>
      `;

      card.addEventListener("click", () => openLightbox(idx));
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

    const { data: works, error } = await sb
      .from("works")
      .select("id,title,year,category,description,cover_url,thumb_url,images,sort,is_published,created_at")
      .eq("is_published", true)
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

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
  }

  async function init() {
    // si pas sur la page galerie, stop
    if (!qs("#grid")) return;

    bindUI();
    await fetchPage();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
