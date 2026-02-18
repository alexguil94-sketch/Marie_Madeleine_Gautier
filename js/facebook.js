(() => {
  const embedRoot = document.querySelector("[data-fb-embed]");
  if (!embedRoot) return;

  const frameRoot = embedRoot.querySelector("[data-fb-frame]") || embedRoot;
  const openLink = document.querySelector("[data-fb-link]");
  const startedAt = Date.now();
  let retryTimer = 0;
  let moHref = null;
  let hrefEl = null;

  const DEFAULT_PLACEHOLDERS = new Set([
    "",
    "#",
    "https://www.facebook.com",
    "https://www.facebook.com/",
    "https://facebook.com",
    "https://facebook.com/",
  ]);

  function theme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function isValidFbUrl(url) {
    let raw = String(url || "").trim();
    if (!raw) return false;
    if (DEFAULT_PLACEHOLDERS.has(raw)) return false;

    // Allow "facebook.com/..." (no scheme) for convenience.
    if (!/^https?:\/\//i.test(raw) && /^(?:www\.)?(?:facebook\.com|fb\.com|m\.facebook\.com)\//i.test(raw)) {
      raw = `https://${raw}`;
    }

    try {
      const u = new URL(raw, location.origin);
      const host = String(u.hostname || "").toLowerCase();
      const isFb = host.includes("facebook.com") || host === "fb.com" || host.endsWith(".fb.com");
      if (!isFb) return false;
      if (u.pathname === "/" || u.pathname === "") return false;
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  function bestPageUrl() {
    const fromData = String(embedRoot.getAttribute("data-fb-page") || "").trim();
    if (isValidFbUrl(fromData)) return fromData;

    const social = Array.from(document.querySelectorAll('a[data-social="facebook"]'))
      .map((a) => String(a.getAttribute("href") || "").trim())
      .find((u) => isValidFbUrl(u));
    if (social) return social;

    const fromBtn = String(openLink?.getAttribute("href") || "").trim();
    if (isValidFbUrl(fromBtn)) return fromBtn;

    return "";
  }

  function frameTitle() {
    const t = window.__t;
    if (typeof t === "function") return t("fb.frameTitle", "Facebook");
    return "Facebook";
  }

  function setOpenLink(url) {
    if (!openLink) return;
    if (isValidFbUrl(url)) openLink.setAttribute("href", url);
  }

  function heightForViewport() {
    return window.matchMedia("(max-width: 980px)").matches ? 560 : 680;
  }

  function buildSrc(url, colorscheme, height) {
    const params = new URLSearchParams({
      href: url,
      tabs: "timeline",
      width: "500",
      height: String(height),
      small_header: "false",
      adapt_container_width: "true",
      hide_cover: "false",
      show_facepile: "true",
      colorscheme,
    });

    return `https://www.facebook.com/plugins/page.php?${params.toString()}`;
  }

  function showLoading() {
    const existing = frameRoot.querySelector('[data-i18n="common.loading"]');
    if (existing && frameRoot.children.length === 1) return;

    frameRoot.innerHTML = "";
    const msg = document.createElement("div");
    msg.className = "fb-fallback muted";
    msg.setAttribute("data-i18n", "common.loading");
    msg.textContent =
      typeof window.__t === "function" ? window.__t("common.loading", "Chargement…") : "Chargement…";
    frameRoot.appendChild(msg);
    window.__applyTranslations?.(msg);
  }

  function showMissing() {
    frameRoot.innerHTML = "";

    const msg = document.createElement("div");
    msg.className = "fb-fallback muted";
    msg.setAttribute("data-i18n", "fb.missing");
    msg.textContent =
      typeof window.__t === "function"
        ? window.__t("fb.missing", "Lien Facebook non configuré.")
        : "Lien Facebook non configuré.";

    frameRoot.appendChild(msg);

    window.__applyTranslations?.(msg);
  }

  let lastUrl = "";
  let lastTheme = "";
  let lastHeight = 0;

  function render() {
    const url = bestPageUrl();
    const th = theme();
    const h = heightForViewport();

    if (!url) {
      const partialsReady = !!window.__MMG_PARTIALS_LOADED__;
      const sbStatus = String(window.__MMG_SB_STATUS__ || "");
      const waitingForSb = sbStatus === "loading";
      const waitingWindow = Date.now() - startedAt < 2500;

      if (!partialsReady || waitingForSb || waitingWindow) {
        showLoading();
        if (!retryTimer) {
          retryTimer = window.setTimeout(() => {
            retryTimer = 0;
            render();
          }, 350);
        }
        return;
      }

      showMissing();
      return;
    }

    if (url === lastUrl && th === lastTheme && h === lastHeight && frameRoot.querySelector("iframe")) {
      return;
    }

    lastUrl = url;
    lastTheme = th;
    lastHeight = h;

    setOpenLink(url);

    frameRoot.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.src = buildSrc(url, th, h);
    iframe.title = frameTitle();
    iframe.loading = "lazy";
    iframe.allow = "encrypted-media; clipboard-write; web-share";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allowfullscreen", "true");
    iframe.style.border = "0";
    iframe.style.overflow = "hidden";
    iframe.style.width = "100%";
    iframe.style.height = `${h}px`;

    frameRoot.appendChild(iframe);
  }

  render();

  document.addEventListener("partials:loaded", render);
  document.addEventListener("sb:ready", render);

  window.addEventListener("i18n:changed", () => {
    const iframe = frameRoot.querySelector("iframe");
    if (iframe) iframe.title = frameTitle();
    window.__applyTranslations?.(frameRoot);
  });

  try {
    const moTheme = new MutationObserver(() => render());
    moTheme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } catch {}

  try {
    const moEmbed = new MutationObserver(() => render());
    moEmbed.observe(embedRoot, { attributes: true, attributeFilter: ["data-fb-page"] });
  } catch {}

  function bindSocialHrefObserver() {
    const a = document.querySelector('a[data-social="facebook"]');
    if (!a) return;
    if (a === hrefEl) return;
    hrefEl = a;
    try {
      moHref?.disconnect?.();
      moHref = new MutationObserver(() => render());
      moHref.observe(a, { attributes: true, attributeFilter: ["href"] });
    } catch {}
  }

  document.addEventListener("partials:loaded", bindSocialHrefObserver);
  bindSocialHrefObserver();

  let rAf = 0;
  window.addEventListener("resize", () => {
    if (rAf) cancelAnimationFrame(rAf);
    rAf = requestAnimationFrame(() => render());
  });
})();
