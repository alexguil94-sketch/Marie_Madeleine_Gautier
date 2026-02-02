/* gallery.js — MMG (Supabase works)
   Schéma works:
   id, title, year, category, cover_url, thumb_url, images(jsonb), sort(int), is_published(bool), created_at
*/

(() => {
  "use strict";

  // -----------------------
  // Helpers
  // -----------------------
  const qs = (sel, root = document) => root.querySelector(sel);

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));

  const uniq = (arr) => Array.from(new Set(arr));

  const asArray = (v) => {
    if (Array.isArray(v)) return v;
    // parfois jsonb peut arriver sous forme string JSON dans certains setups
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  // -----------------------
  // DOM
  // -----------------------
  const grid = qs("#grid");
  if (!grid) return;

  const q = qs("#q");
  const cat = qs("#cat");
  const loadMore = qs("#loadMore");

  // Lightbox DOM
  const lb = qs("#lightbox");
  const lbImg = qs("#lbImg");
  const lbTitle = qs("#lbTitle");
  const lbCount = qs("#lbCount");
  const lbCanvas = qs("#lbCanvas");

  const hasLightbox = !!(lb && lbImg && lbTitle && lbCanvas);

  // -----------------------
  // Data loading
  // -----------------------
  async function loadWorks() {
    const sb = window.mmgSupabase;
    if (!sb) throw new Error("Supabase client manquant (window.mmgSupabase).");

    const { data, error } = await sb
      .from("works")
      .select("id,title,year,category,cover_url,thumb_url,images,sort,is_published,created_at")
      .eq("is_published", true)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const norm = (data || [])
      .map((x, i) => {
        const imgs = asArray(x.images).filter(Boolean);
        const main = imgs[0] || x.cover_url || "";
        const thumb = x.thumb_url || x.cover_url || main;

        return {
          id: x.id || `w_${i + 1}`,
          src: main,
          thumb: thumb || main,
          title: x.title || `Oeuvre ${String(i + 1).padStart(3, "0")}`,
          year: x.year ?? "",
          category: x.category ?? "",
          sort: x.sort ?? 1000,
          created_at: x.created_at ?? "",
        };
      })
      // IMPORTANT : si cover_url NULL + images [], l’oeuvre ne peut pas s’afficher (pas d’image)
      .filter((x) => !!x.src);

    return norm;
  }

  // -----------------------
  // State
  // -----------------------
  const PAGE_SIZE = 24;
  let all = [];
  let current = [];
  let shown = 0;

  // -----------------------
  // Categories
  // -----------------------
  function setupCategories(items) {
    if (!cat) return;

    // reset en gardant "all"
    const keepAll = cat.querySelector('option[value="all"]');
    cat.innerHTML = "";
    if (keepAll) cat.appendChild(keepAll);
    else {
      const opt = document.createElement("option");
      opt.value = "all";
      opt.textContent = "Toutes";
      cat.appendChild(opt);
    }

    const cats = uniq(items.map((x) => x.category).filter(Boolean)).sort((a, b) => a.localeCompare(b));
    if (!cats.length) {
      cat.style.display = "none";
      return;
    }
    cat.style.display = "";

    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      cat.appendChild(opt);
    });
  }

  // -----------------------
  // Filters / Rendering
  // -----------------------
  function matches(item) {
    const qq = (q?.value || "").trim().toLowerCase();
    const cc = cat ? cat.value : "all";

    if (cc !== "all" && item.category !== cc) return false;

    if (qq) {
      const hay = `${item.title || ""} ${item.year || ""} ${item.category || ""}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  }

  function reset() {
    current = all.filter(matches);
    shown = 0;
    grid.innerHTML = "";
    renderMore();
  }

  function renderMore() {
    const slice = current.slice(shown, shown + PAGE_SIZE);
    shown += slice.length;

    const frag = document.createDocumentFragment();

    slice.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "work work--gallery";
      btn.type = "button";
      btn.innerHTML = `
        <img loading="lazy" src="${escapeHtml(item.thumb)}" alt="${escapeHtml(item.title)}">
        <div class="meta">
          <div style="font-weight:600">${escapeHtml(item.title)}</div>
          <div class="muted">${escapeHtml(item.year)}${item.category ? " • " + escapeHtml(item.category) : ""}</div>
        </div>
      `;
      if (hasLightbox) btn.addEventListener("click", () => Lightbox.openBySrc(item.src));
      frag.appendChild(btn);
    });

    grid.appendChild(frag);

    if (loadMore) {
      loadMore.disabled = shown >= current.length;
      loadMore.style.opacity = loadMore.disabled ? "0.45" : "1";
    }
  }

  // -----------------------
  // Lightbox (fix aria-hidden + focus)
  // -----------------------
  const Lightbox = (() => {
    if (!hasLightbox) return { openBySrc: () => {} };

    let scale = 1, x = 0, y = 0;
    let dragging = false, sx = 0, sy = 0;
    let index = -1;
    let lastFocus = null;

    const isOpen = () => lb.classList.contains("is-open");

    const setInert = (v) => {
      try { lb.inert = v; } catch {}
      lb.setAttribute("aria-hidden", v ? "true" : "false");
    };

    const apply = () => {
      lbImg.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
    };

    const resetZoom = () => {
      scale = 1; x = 0; y = 0;
      apply();
    };

    const setAt = (i) => {
      if (!current.length) return;
      index = (i + current.length) % current.length;

      const item = current[index];
      lbImg.src = item.src;
      lbTitle.textContent = item.title || "—";
      if (lbCount) lbCount.textContent = `(${index + 1}/${current.length})`;

      resetZoom();
    };

    const openAt = (i) => {
      lastFocus = document.activeElement;

      lb.classList.add("is-open");
      setInert(false);

      setAt(i);

      const closeBtn = lb.querySelector("[data-close]") || lb.querySelector("button");
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    };

    const openBySrc = (src) => {
      const idx = current.findIndex((x) => x.src === src);
      openAt(idx >= 0 ? idx : 0);
    };

    const close = () => {
      if (lb.contains(document.activeElement)) document.activeElement.blur(); // <-- fix warning
      lb.classList.remove("is-open");
      setInert(true);

      if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus({ preventScroll: true });
      }
      lastFocus = null;
    };

    // Click: close / zoom / nav
    document.addEventListener("click", (e) => {
      if (!isOpen()) return;

      if (e.target.closest("[data-close]") || e.target === lb) return close();

      const z = e.target.closest("[data-zoom]");
      if (z) {
        const v = z.dataset.zoom;
        if (v === "in") scale = Math.min(6, scale * 1.15);
        if (v === "out") scale = Math.max(0.6, scale / 1.15);
        if (v === "reset") resetZoom();
        apply();
        return;
      }

      const n = e.target.closest("[data-nav]");
      if (n) setAt(index + (n.dataset.nav === "next" ? 1 : -1));
    });

    // Keyboard
    window.addEventListener("keydown", (e) => {
      if (!isOpen()) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setAt(index + 1);
      if (e.key === "ArrowLeft") setAt(index - 1);
    });

    // Pan drag
    lbCanvas.addEventListener("mousedown", (e) => {
      if (!isOpen()) return;
      dragging = true;
      sx = e.clientX - x;
      sy = e.clientY - y;
    });
    window.addEventListener("mouseup", () => (dragging = false));
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      x = e.clientX - sx;
      y = e.clientY - sy;
      apply();
    });

    // Wheel zoom
    lbCanvas.addEventListener("wheel", (e) => {
      if (!isOpen()) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      scale = delta > 0 ? Math.max(0.6, scale / 1.12) : Math.min(6, scale * 1.12);
      apply();
    }, { passive: false });

    // Swipe
    let tStartX = 0, tStartY = 0;
    lbCanvas.addEventListener("touchstart", (e) => {
      if (!isOpen()) return;
      const t = e.touches[0];
      tStartX = t.clientX; tStartY = t.clientY;
    }, { passive: true });

    lbCanvas.addEventListener("touchend", (e) => {
      if (!isOpen()) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - tStartX;
      const dy = t.clientY - tStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        setAt(index + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });

    setInert(true);
    return { openBySrc, close };
  })();

  // -----------------------
  // Boot
  // -----------------------
  (async () => {
    try {
      all = await loadWorks();
      // tri stable même si beaucoup de sort identiques
      all.sort((a, b) => (a.sort - b.sort) || (String(b.created_at).localeCompare(String(a.created_at))));

      setupCategories(all);

      if (q) q.addEventListener("input", reset);
      if (cat) cat.addEventListener("change", reset);
      if (loadMore) loadMore.addEventListener("click", renderMore);

      reset();
    } catch (e) {
      console.error("[gallery] load error:", e);
      grid.innerHTML = `<p class="muted">Impossible de charger la galerie pour le moment.</p>`;
    }
  })();
})();
