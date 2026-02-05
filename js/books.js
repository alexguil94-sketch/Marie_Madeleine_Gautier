(async function () {
  const booksGrid = document.getElementById("booksGrid");
  const pressGrid = document.getElementById("pressGrid");
  const sourcesList = document.getElementById("sourcesList");
  if (!booksGrid && !pressGrid && !sourcesList) return;

  const t = (key, fallback) => window.__t?.(key) ?? fallback ?? key;

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

  let cache = null;
  async function loadData() {
    if (cache) return cache;
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
