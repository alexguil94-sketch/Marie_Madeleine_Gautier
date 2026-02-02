// js/gallery.js (v2 clean)
// Charge works + works_images sans AbortController (évite AbortError)

(() => {
  "use strict";
  if (window.__MMG_GALLERY_INIT__) return;
  window.__MMG_GALLERY_INIT__ = true;

  const qs = (s, r = document) => r.querySelector(s);
  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;
  const getBucket = () => (window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media");

  let token = 0;

  async function waitSB(ms = 4000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const sb = getSB();
      if (sb?.from) return sb;
      await new Promise((r) => setTimeout(r, 80));
    }
    return null;
  }

  function rootEl() {
    return (
      qs("#galleryRoot") ||
      qs("[data-gallery-root]") ||
      qs("#worksGrid") ||
      qs("#galleryGrid")
    );
  }

  function isHttp(u) {
    return /^https?:\/\//i.test(String(u || ""));
  }

  function publicUrl(sb, path) {
    if (!path) return "";
    if (isHttp(path)) return path;
    const bucket = getBucket();
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  async function loadWorks(sb) {
    // adapte si tes colonnes diffèrent (mais ça reste safe)
    const { data, error } = await sb
      .from("works")
      .select("id,title,year,category,cover_url,image_path,is_published,sort,created_at")
      .eq("is_published", true)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return data || [];
  }

  async function loadWorkImages(sb, workIds) {
    if (!workIds.length) return [];
    const { data, error } = await sb
      .from("works_images")
      .select("work_id,path,sort_order,created_at")
      .in("work_id", workIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  function groupByWork(images) {
    const map = new Map();
    for (const img of images) {
      const arr = map.get(img.work_id) || [];
      arr.push(img);
      map.set(img.work_id, arr);
    }
    return map;
  }

  function cardHTML({ cover, title, meta }) {
    return `
      <article class="work-card">
        <div class="work-media">
          ${cover ? `<img src="${cover}" alt="" loading="lazy" decoding="async">` : `<div class="work-empty"></div>`}
        </div>
        <div class="work-body">
          <h3 class="work-title">${title || ""}</h3>
          ${meta ? `<div class="work-meta">${meta}</div>` : ""}
        </div>
      </article>
    `;
  }

  async function render() {
    const my = ++token;
    const root = rootEl();
    if (!root) return;

    root.innerHTML = `<div class="muted">Chargement…</div>`;

    try {
      const sb = await waitSB();
      if (!sb) throw new Error("Supabase client introuvable");

      const works = await loadWorks(sb);
      if (my !== token) return;

      const ids = works.map((w) => w.id).filter(Boolean);
      const imgs = await loadWorkImages(sb, ids);
      if (my !== token) return;

      const byWork = groupByWork(imgs);

      // build
      root.innerHTML = "";
      for (const w of works) {
        const list = byWork.get(w.id) || [];

        // priorité : cover_url, sinon image_path, sinon premier works_images.path
        const cover =
          (w.cover_url && (isHttp(w.cover_url) ? w.cover_url : publicUrl(sb, w.cover_url))) ||
          (w.image_path ? publicUrl(sb, w.image_path) : "") ||
          (list[0]?.path ? publicUrl(sb, list[0].path) : "");

        const meta = [w.year, w.category].filter(Boolean).join(" • ");

        const wrap = document.createElement("div");
        wrap.innerHTML = cardHTML({ cover, title: w.title, meta });
        const card = wrap.firstElementChild;

        // Option : clique = ouvre lightbox (si tu veux après)
        // card.addEventListener("click", () => openLightbox(list.map(x => publicUrl(sb, x.path)), cover));

        root.appendChild(card);
      }

      if (!works.length) {
        root.innerHTML = `<div class="muted">Aucune œuvre publiée.</div>`;
      }
    } catch (e) {
      console.warn("[gallery] load error:", e);
      root.innerHTML = `<div class="muted">Erreur de chargement galerie.</div>`;
    }
  }

  window.addEventListener("DOMContentLoaded", render);
  document.addEventListener("partials:loaded", render);
})();
