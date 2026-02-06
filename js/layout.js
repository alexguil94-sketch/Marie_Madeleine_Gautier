// js/layout.js
(() => {
  if (window.__MMG_LAYOUT_INIT__) return;
  window.__MMG_LAYOUT_INIT__ = true;

  async function injectPartial(targetId, url) {
    const el = document.getElementById(targetId);
    if (!el) return;

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
      el.innerHTML = await res.text();
    } catch (e) {
      console.warn("[MMG] injectPartial failed:", url, e);
    }
  }

  function partialBase() {
    // Si on est dans /admin/ -> remonte d’un niveau
    return /(^|\/)admin(\/|$)/.test(location.pathname) ? "../partials/" : "partials/";
  }

  (async function () {
    const base = partialBase();

    await injectPartial("siteHeader", base + "header.html");
    await injectPartial("siteFooter", base + "footer.html");

    const y = document.querySelector("[data-year]");
    if (y) y.textContent = new Date().getFullYear();

    // Make the event resilient: dispatch on next task so any deferred scripts
    // that attach listeners after `layout.js` still receive it.
    window.__MMG_PARTIALS_LOADED__ = true;
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent("partials:loaded"));
    }, 0);
  })();
})();
