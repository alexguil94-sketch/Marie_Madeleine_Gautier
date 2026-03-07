// js/home.js
// Home-only widgets: featured works + agenda preview
(() => {
  "use strict";
  if (window.__MMG_HOME_INIT__) return;
  window.__MMG_HOME_INIT__ = true;

  const qs = (s, r = document) => r.querySelector(s);

  const isAbort = (e) =>
    e?.name === "AbortError" || /signal is aborted/i.test(String(e?.message || e || ""));
  const getSB = () => window.mmgSupabase || null;
  const getBucket = () => (window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media");
  const isLocalStaticPath = (v) => /^\/?assets\//i.test(v) || /^\/?favicon\.ico(?:[?#].*)?$/i.test(v);

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
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    if (isLocalStaticPath(v)) return v.startsWith("/") ? v : "/" + v;

    const storagePath = v.replace(/^\/+/, "");
    const sb = getSB();
    if (!sb?.storage || !storagePath) return v;
    const { data } = sb.storage.from(getBucket()).getPublicUrl(storagePath);
    return data?.publicUrl || v;
  };

  async function loadSitePhoto(slot) {
    const sb = await waitForSB(3500);
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from("site_photos")
        .select("path,title,alt,sort,created_at")
        .eq("slot", slot)
        .eq("is_published", true)
        .order("sort", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return null;
      const row = (data || [])[0];
      if (!row?.path) return null;

      return {
        url: resolveUrl(row.path),
        alt: String(row.alt || row.title || "").trim(),
      };
    } catch {
      return null;
    }
  }

  async function applyHomeSitePhotos() {
    // Header background (Accueil)
    const hero = qs(".hero--welcome");
    if (hero) {
      // Keep the original CSS header image by default.
      // Opt-in to a Supabase override by setting: data-hero-source="supabase"
      const src = String(hero.getAttribute("data-hero-source") || "").trim().toLowerCase();
      if (src === "supabase") {
        const p = await loadSitePhoto("home_hero");
        if (p?.url) hero.style.backgroundImage = `url("${p.url}")`;
      } else {
        hero.style.backgroundImage = "";
      }
    }

    // Exposition du moment (image)
    const featureImg = qs("[data-home-feature]");
    if (featureImg) {
      const p = await loadSitePhoto("home_feature");
      if (p?.url) {
        featureImg.src = p.url;
        if (p.alt) featureImg.alt = p.alt;
      }
    }
  }

  function pickWorkImage(work) {
    if (!work) return "";
    if (work.cover_url) return resolveUrl(work.cover_url);
    if (work.thumb_url) return resolveUrl(work.thumb_url);

    const imgs = work.images;
    if (Array.isArray(imgs)) {
      const first = imgs.find(Boolean);
      if (typeof first === "string") return resolveUrl(first);
      if (first && typeof first === "object" && first.url) return resolveUrl(first.url);
    }

    if (work.src) return resolveUrl(work.src);
    if (work.thumb) return resolveUrl(work.thumb);
    return "";
  }

  const prefersReducedMotion = () =>
    !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function updateHomeWorksCarouselState() {
    const wrap = qs("[data-home-works-carousel]");
    if (!wrap) return;

    const viewport = qs(".home-works-carousel__viewport", wrap);
    const prev = qs("[data-home-carousel-prev]", wrap);
    const next = qs("[data-home-carousel-next]", wrap);
    if (!viewport || !prev || !next) return;

    const canScroll = viewport.scrollWidth > viewport.clientWidth + 8;
    wrap.classList.toggle("is-static", !canScroll);

    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    prev.disabled = !canScroll || viewport.scrollLeft <= 2;
    next.disabled = !canScroll || viewport.scrollLeft >= max - 2;
  }

  function initHomeWorksCarouselControls() {
    const wrap = qs("[data-home-works-carousel]");
    if (!wrap || wrap.dataset.carouselInited === "1") return;

    const viewport = qs(".home-works-carousel__viewport", wrap);
    const prev = qs("[data-home-carousel-prev]", wrap);
    const next = qs("[data-home-carousel-next]", wrap);
    if (!viewport || !prev || !next) return;

    const scrollByPage = (dir) => {
      const behavior = prefersReducedMotion() ? "auto" : "smooth";
      const amount = Math.max(240, Math.floor(viewport.clientWidth * 0.9));
      viewport.scrollBy({ left: dir * amount, behavior });
    };

    prev.addEventListener("click", () => scrollByPage(-1));
    next.addEventListener("click", () => scrollByPage(1));

    let raf = 0;
    viewport.addEventListener(
      "scroll",
      () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          updateHomeWorksCarouselState();
        });
      },
      { passive: true }
    );

    window.addEventListener("resize", () => updateHomeWorksCarouselState());
    wrap.dataset.carouselInited = "1";
  }

  function renderHomeWorks(list) {
    const root = qs("#homeWorks");
    if (!root) return;

    initHomeWorksCarouselControls();
    root.innerHTML = "";

    if (!list?.length) {
      root.innerHTML = `<div class="muted" data-i18n="home.noWorks">Aucune œuvre à afficher pour le moment.</div>`;
      updateHomeWorksCarouselState();
      return;
    }

    list.slice(0, 12).forEach((w) => {
      const img = pickWorkImage(w);
      const title = w.title || "—";
      const sub = [w.year, w.category].filter(Boolean).join(" • ");

      const a = document.createElement("a");
      a.className = "work work--home";
      a.href = "gallery.html";
      a.setAttribute("aria-label", title);
      a.setAttribute("role", "listitem");

      a.innerHTML = `
        ${img ? `<img loading="lazy" decoding="async" src="${img}" alt="">` : ""}
        <div class="meta">
          <div style="font-weight:700">${title}</div>
          ${sub ? `<div class="muted">${sub}</div>` : ""}
        </div>
      `;

      root.appendChild(a);
    });

    requestAnimationFrame(() => updateHomeWorksCarouselState());
  }

  async function loadWorksFallback() {
    try {
      const res = await fetch("data/works.json", { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async function loadWorksSupabase() {
    const sb = await waitForSB();
    if (!sb) return [];

    const { data, error } = await sb
      .from("works")
      .select("id,title,year,category,cover_url,thumb_url,images,sort,is_published,created_at")
      .eq("is_published", true)
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) return [];
    return data || [];
  }

  function renderAgendaPreview() {
    const root = qs("#homeAgenda");
    if (!root) return;

    const KEY = "exhibitions.v1";
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }

    const upcoming = list
      .filter((x) => x && x.status === "upcoming" && x.date)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 3);

    if (!upcoming.length) {
      root.innerHTML = `
        <div class="muted" style="padding:6px 0" data-i18n="home.noUpcoming">
          Aucune date à venir pour l’instant. Ajoute tes expositions depuis la page Agenda.
        </div>
      `;
      return;
    }

    root.innerHTML = upcoming
      .map(
        (x) => `
          <div class="item">
            <div>
              <div style="font-weight:600">${x.title || "Exposition"}</div>
              <div class="muted">${[x.city, x.date].filter(Boolean).join(" • ")}${x.venue ? " • " + x.venue : ""}</div>
              ${x.link ? `<div><a class="muted" href="${x.link}" target="_blank" rel="noreferrer">${x.link}</a></div>` : ""}
            </div>
            <span class="badge" data-i18n="expo.badgeUpcoming">À venir</span>
          </div>
        `
      )
      .join("");
  }

  async function init() {
    const worksRoot = qs("#homeWorks");
    initHomeWorksCarouselControls();
    if (worksRoot) worksRoot.innerHTML = `<div class="muted" data-i18n="common.loading">Chargement…</div>`;
    updateHomeWorksCarouselState();
    renderAgendaPreview();
    applyHomeSitePhotos().catch(() => {});

    const works = await loadWorksSupabase();
    if (works.length) {
      renderHomeWorks(works);
      return;
    }

    const fallback = await loadWorksFallback();
    renderHomeWorks(fallback);
  }

  window.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => {
      if (isAbort(err)) return;
      console.error(err);
    });
  });
})();
