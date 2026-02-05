(async function () {
  const booksGrid = document.getElementById("booksGrid");
  const pressGrid = document.getElementById("pressGrid");
  const sourcesList = document.getElementById("sourcesList");
  if (!booksGrid && !pressGrid && !sourcesList) return;

  const t = (key, fallback) => window.__t?.(key) ?? fallback ?? key;

  const isAbort = (e) =>
    e?.name === "AbortError" || /signal is aborted|aborted/i.test(String(e?.message || e || ""));

  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;
  const getBucket = () => window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media";

  const waitForSB = async (timeoutMs = 3500) => {
    if (getSB()) return getSB();

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

  const resolveUrl = (sb, uOrPath) => {
    const v = String(uOrPath || "").trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/")) return v;
    if (v.startsWith("assets/")) return "/" + v;

    if (!sb?.storage) return v;
    const { data } = sb.storage.from(getBucket()).getPublicUrl(v);
    return data?.publicUrl || v;
  };

  const esc = (v) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const fmt = (arr) => (Array.isArray(arr) ? arr : []);

  const tile = (d) => {
    const cover = esc(d?.cover || "assets/placeholders/book-cover-1.svg");
    const title = esc(d?.title || "");
    const year = esc(d?.year || "");
    const pdf = esc(d?.pdf || "#");
    return `
      <div class="work" style="cursor:default">
        <img src="${cover}" alt="">
        <div class="meta">
          <div style="font-weight:600">${title}</div>
          <div class="muted">${year}</div>
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap">
            <a class="btn ghost" href="${pdf}" target="_blank" rel="noreferrer">${esc(t("books.open", "Ouvrir PDF"))}</a>
            <a class="btn" href="${pdf}" download>${esc(t("books.download", "Télécharger"))}</a>
          </div>
        </div>
      </div>
    `;
  };

  const renderEmpty = (el, msg) => {
    if (!el) return;
    el.innerHTML = `<div class="small-note muted">${esc(msg)}</div>`;
  };

  async function loadFromSupabase() {
    const sb = await waitForSB(3500);
    if (!sb) return null;

    const { data: docs, error: dErr } = await sb
      .from("site_documents")
      .select("kind,title,year,cover_path,pdf_path,sort,created_at")
      .eq("is_published", true)
      .order("kind", { ascending: true })
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(2000);

    if (dErr) throw dErr;

    const { data: srcs, error: sErr } = await sb
      .from("site_sources")
      .select("title,url,meta,sort,created_at")
      .eq("is_published", true)
      .order("sort", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(2000);

    if (sErr) throw sErr;

    const books = (docs || [])
      .filter((d) => (d?.kind || "book") === "book")
      .map((d) => ({
        title: d?.title || "",
        year: d?.year || "",
        cover: d?.cover_path ? resolveUrl(sb, d.cover_path) : "",
        pdf: d?.pdf_path ? resolveUrl(sb, d.pdf_path) : "",
      }));

    const press = (docs || [])
      .filter((d) => (d?.kind || "book") === "press")
      .map((d) => ({
        title: d?.title || "",
        year: d?.year || "",
        cover: d?.cover_path ? resolveUrl(sb, d.cover_path) : "",
        pdf: d?.pdf_path ? resolveUrl(sb, d.pdf_path) : "",
      }));

    const sources = (srcs || []).map((s) => ({
      title: s?.title || "",
      url: s?.url || "",
      meta: s?.meta || "",
    }));

    return { books, press_brochures: press, sources };
  }

  let cache = null;
  async function loadData() {
    if (cache) return cache;

    try {
      const remote = await loadFromSupabase();
      if (remote) {
        cache = remote;
        return cache;
      }
    } catch (e) {
      if (!isAbort(e)) console.warn("[books] supabase error", e);
    }

    const res = await fetch("data/books.json", { cache: "no-store" });
    cache = await res.json();
    return cache;
  }

  async function render() {
    const data = await loadData();
    const model = Array.isArray(data) ? { books: data } : data || {};

    const books = fmt(model.books);
    const press = fmt(model.press_brochures || model.pressBrochures);
    const sources = fmt(model.sources);

    if (booksGrid) {
      if (!books.length) renderEmpty(booksGrid, t("books.empty", "Aucun élément pour le moment."));
      else booksGrid.innerHTML = books.map(tile).join("");
    }

    if (pressGrid) {
      if (!press.length) renderEmpty(pressGrid, t("books.empty", "Aucun élément pour le moment."));
      else pressGrid.innerHTML = press.map(tile).join("");
    }

    if (sourcesList) {
      if (!sources.length) {
        renderEmpty(sourcesList, t("books.empty", "Aucun élément pour le moment."));
      } else {
        sourcesList.innerHTML = sources
          .map((s) => {
            const title = esc(s?.title || s?.name || "");
            const url = esc(s?.url || "#");
            const meta = esc(s?.meta || s?.publisher || s?.date || "");
            const badge = esc(t("books.openLink", "Ouvrir"));

            return `
              <a class="item" href="${url}" target="_blank" rel="noreferrer">
                <div>
                  <div style="font-weight:600">${title}</div>
                  ${meta ? `<div class="muted" style="font-size:12px; margin-top:4px">${meta}</div>` : ""}
                </div>
                <div style="display:flex; align-items:center; align-self:center">
                  <span class="badge">${badge}</span>
                </div>
              </a>
            `;
          })
          .join("");
      }
    }
  }

  const safeRender = () =>
    render().catch((err) => {
      console.error(err);
    });

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", safeRender);
  else safeRender();
  window.addEventListener("i18n:changed", safeRender);
})();
