// js/layout.js
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
  return location.pathname.includes("/admin/") ? "../partials/" : "partials/";
}

(async function () {
  const base = partialBase();

  await injectPartial("siteHeader", base + "header.html");
  await injectPartial("siteFooter", base + "footer.html");

  const y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear();

  document.dispatchEvent(new CustomEvent("partials:loaded"));
})();
