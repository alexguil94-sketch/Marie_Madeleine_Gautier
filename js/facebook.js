(() => {
  const embedRoot = document.querySelector("[data-fb-embed]");
  if (!embedRoot) return;

  const sectionRoot = document.getElementById("facebook") || embedRoot.closest("section") || embedRoot;
  const frameRoot = embedRoot.querySelector("[data-fb-frame]") || embedRoot;
  const openLink = document.querySelector("[data-fb-link]");
  const tabsSelect = document.querySelector("[data-fb-tabs-select]");
  const refreshBtn = document.querySelector("[data-fb-refresh]");
  const startedAt = Date.now();
  let retryTimer = 0;
  let embedTimer = 0;
  let moHref = null;
  let hrefEl = null;
  let lazyReady = false;
  let visibilityIo = null;

  const STORAGE_TABS_KEY = "mmg.fb.tabs";
  const DEFAULT_TABS = "timeline";
  const ALLOWED_TABS = new Set(["timeline", "events", "messages"]);
  const EMBED_TIMEOUT_MS = 6500;
  const MOBILE_MQ = window.matchMedia("(max-width: 980px)");

  const DEFAULT_PLACEHOLDERS = new Set([
    "",
    "#",
    "https://www.facebook.com",
    "https://www.facebook.com/",
    "https://facebook.com",
    "https://facebook.com/",
  ]);

  function tr(key, fallback) {
    const t = window.__t;
    return typeof t === "function" ? t(key, fallback) : fallback;
  }

  function clearRetryTimer() {
    if (!retryTimer) return;
    window.clearTimeout(retryTimer);
    retryTimer = 0;
  }

  function clearEmbedTimer() {
    if (!embedTimer) return;
    window.clearTimeout(embedTimer);
    embedTimer = 0;
  }

  function markReady(v) {
    frameRoot.setAttribute("data-fb-ready", v ? "true" : "false");
  }

  function theme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function parseFbUrl(url) {
    const original = String(url || "").trim();
    let raw = original;
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
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;

      const normalized = new URL(u.toString());
      normalized.protocol = "https:";
      if (
        normalized.hostname === "facebook.com" ||
        normalized.hostname === "m.facebook.com" ||
        normalized.hostname === "fb.com"
      ) {
        normalized.hostname = "www.facebook.com";
      }

      const path = String(normalized.pathname || "/").replace(/\/+$/, "") || "/";
      const id = String(normalized.searchParams.get("id") || "").trim();
      if (path === "/" && !id) return false;

      const lcPath = path.toLowerCase();
      const isUnsupported =
        lcPath === "/profile.php" ||
        lcPath.startsWith("/people/") ||
        lcPath.startsWith("/groups/");

      return {
        raw: original,
        url: normalized.toString(),
        path: lcPath,
        embeddable: !isUnsupported,
      };
    } catch {
      return false;
    }
  }

  function bestPageCandidate() {
    const fromData = parseFbUrl(embedRoot.getAttribute("data-fb-page"));
    if (fromData) return fromData;

    const social = Array.from(document.querySelectorAll('a[data-social="facebook"]'))
      .map((a) => parseFbUrl(a.getAttribute("href")))
      .find(Boolean);
    if (social) return social;

    const fromBtn = parseFbUrl(openLink?.getAttribute("href"));
    if (fromBtn) return fromBtn;

    return null;
  }

  function frameTitle() {
    const t = window.__t;
    if (typeof t === "function") return t("fb.frameTitle", "Facebook");
    return "Facebook";
  }

  function setOpenLink(url) {
    if (!openLink) return;
    const candidate = parseFbUrl(url);
    if (candidate) openLink.setAttribute("href", candidate.url);
  }

  function heightForViewport() {
    return MOBILE_MQ.matches ? 560 : 680;
  }

  function normalizeTabs(tabs) {
    const raw = String(tabs || "")
      .trim()
      .toLowerCase();
    if (!raw) return "";

    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .filter((p) => ALLOWED_TABS.has(p));

    if (!parts.length) return "";
    return Array.from(new Set(parts)).join(",");
  }

  function getStoredTabs() {
    try {
      return normalizeTabs(localStorage.getItem(STORAGE_TABS_KEY));
    } catch {
      return "";
    }
  }

  function setStoredTabs(tabs) {
    try {
      localStorage.setItem(STORAGE_TABS_KEY, tabs);
    } catch {}
  }

  function tabsValue() {
    const fromAttr = normalizeTabs(embedRoot.getAttribute("data-fb-tabs"));
    if (fromAttr) return fromAttr;

    const fromStored = getStoredTabs();
    if (fromStored) return fromStored;

    const fromSelect = normalizeTabs(tabsSelect?.value);
    if (fromSelect) return fromSelect;

    return DEFAULT_TABS;
  }

  function syncTabsUI(tabs) {
    if (!tabsSelect) return;
    const v = String(tabs || "").split(",")[0] || DEFAULT_TABS;
    if (tabsSelect.value !== v) tabsSelect.value = v;
  }

  function setTabs(tabs) {
    const v = normalizeTabs(tabs) || DEFAULT_TABS;
    embedRoot.setAttribute("data-fb-tabs", v);
    setStoredTabs(v);
    syncTabsUI(v);
  }

  // Init (persist selection across visits).
  setTabs(embedRoot.getAttribute("data-fb-tabs") || getStoredTabs() || DEFAULT_TABS);

  tabsSelect?.addEventListener("change", () => setTabs(tabsSelect.value));
  refreshBtn?.addEventListener("click", () => render({ force: true }));

  function buildSrc(url, colorscheme, height, tabs) {
    const params = new URLSearchParams({
      href: url,
      tabs: normalizeTabs(tabs) || DEFAULT_TABS,
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
    clearEmbedTimer();
    markReady(false);
    const existing = frameRoot.querySelector('[data-i18n="common.loading"]');
    if (existing && frameRoot.children.length === 1) return;

    frameRoot.innerHTML = "";
    const msg = document.createElement("div");
    msg.className = "fb-fallback muted";
    msg.setAttribute("data-i18n", "common.loading");
    msg.textContent = tr("common.loading", "Chargement…");
    frameRoot.appendChild(msg);
    window.__applyTranslations?.(msg);
  }

  function showMissing() {
    clearEmbedTimer();
    markReady(false);
    frameRoot.innerHTML = "";

    const msg = document.createElement("div");
    msg.className = "fb-fallback muted";
    msg.setAttribute("data-i18n", "fb.missing");
    msg.textContent = tr("fb.missing", "Lien Facebook non configuré.");

    frameRoot.appendChild(msg);

    window.__applyTranslations?.(msg);
  }

  function showState(key, fallback, url) {
    clearEmbedTimer();
    markReady(false);
    frameRoot.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "fb-fallback fb-fallback--state";

    const msg = document.createElement("p");
    msg.className = "fb-fallback__text muted";
    msg.setAttribute("data-i18n", key);
    msg.textContent = tr(key, fallback);
    wrap.appendChild(msg);

    const candidate = parseFbUrl(url);
    if (candidate) {
      const actions = document.createElement("div");
      actions.className = "fb-fallback__actions";

      const link = document.createElement("a");
      link.className = "btn ghost";
      link.href = candidate.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("data-i18n", "fb.open");
      link.textContent = tr("fb.open", "Voir sur Facebook");

      actions.appendChild(link);
      wrap.appendChild(actions);
    }

    frameRoot.appendChild(wrap);
    window.__applyTranslations?.(wrap);
  }

  function showDeferred(url) {
    clearEmbedTimer();
    markReady(false);
    frameRoot.innerHTML = "";

    const wrap = document.createElement("div");
    wrap.className = "fb-shell";

    const eyebrow = document.createElement("div");
    eyebrow.className = "fb-shell__eyebrow";
    eyebrow.textContent = "Facebook";
    wrap.appendChild(eyebrow);

    const title = document.createElement("h3");
    title.className = "fb-shell__title";
    title.setAttribute("data-i18n", "fb.previewTitle");
    title.textContent = tr("fb.previewTitle", "Apercu Facebook");
    wrap.appendChild(title);

    const text = document.createElement("p");
    text.className = "fb-shell__text muted";
    text.setAttribute("data-i18n", "fb.deferred");
    text.textContent = tr(
      "fb.deferred",
      "Le fil se charge a l'approche de cette section pour garder la page fluide."
    );
    wrap.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "fb-shell__actions";

    const loadBtn = document.createElement("button");
    loadBtn.type = "button";
    loadBtn.className = "btn";
    loadBtn.setAttribute("data-i18n", "fb.loadNow");
    loadBtn.textContent = tr("fb.loadNow", "Charger le module");
    loadBtn.addEventListener("click", () => {
      lazyReady = true;
      render({ force: true });
    });
    actions.appendChild(loadBtn);

    const candidate = parseFbUrl(url);
    if (candidate) {
      const link = document.createElement("a");
      link.className = "btn ghost";
      link.href = candidate.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("data-i18n", "fb.open");
      link.textContent = tr("fb.open", "Voir sur Facebook");
      actions.appendChild(link);
    }

    wrap.appendChild(actions);
    frameRoot.appendChild(wrap);
    window.__applyTranslations?.(wrap);
  }

  function showUnsupported(url) {
    showState(
      "fb.unsupported",
      "Le module Facebook fonctionne avec l’URL publique d’une page (ex. facebook.com/nom-de-page). Le lien actuel ne permet pas d’afficher le fil ici.",
      url
    );
  }

  function showBlocked(url) {
    showState(
      "fb.blocked",
      "L’intégration Facebook n’a pas pu être chargée ici. Ouvrez la page dans un nouvel onglet.",
      url
    );
  }

  let lastSignature = "";

  function render(opts = {}) {
    const force = !!opts.force;
    const candidate = bestPageCandidate();
    const url = candidate?.url || "";
    const th = theme();
    const h = heightForViewport();
    const tabs = tabsValue();
    syncTabsUI(tabs);

    if (!candidate) {
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

    clearRetryTimer();
    setOpenLink(url);

    if (!candidate.embeddable) {
      lastSignature = "";
      showUnsupported(url);
      return;
    }

    if (!lazyReady && !force) {
      showDeferred(url);
      return;
    }

    const nextSignature = `${url}::${th}::${h}::${tabs}`;
    if (!force && nextSignature === lastSignature && frameRoot.querySelector("iframe")) {
      return;
    }

    lastSignature = nextSignature;
    clearEmbedTimer();

    frameRoot.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.src = buildSrc(url, th, h, tabs);
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

    iframe.addEventListener(
      "load",
      () => {
        clearEmbedTimer();
        markReady(true);
      },
      { once: true }
    );
    iframe.addEventListener(
      "error",
      () => {
        if (!frameRoot.contains(iframe)) return;
        lastSignature = "";
        markReady(false);
        showBlocked(url);
      },
      { once: true }
    );

    frameRoot.appendChild(iframe);
    markReady(false);

    embedTimer = window.setTimeout(() => {
      embedTimer = 0;
      if (!frameRoot.contains(iframe)) return;
      lastSignature = "";
      markReady(false);
      showBlocked(url);
    }, EMBED_TIMEOUT_MS);
  }

  function enableLazyLoad() {
    if (lazyReady) return;
    lazyReady = true;
    visibilityIo?.disconnect?.();
    render();
  }

  try {
    visibilityIo = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) enableLazyLoad();
      },
      { rootMargin: "280px 0px" }
    );
    visibilityIo.observe(sectionRoot);
  } catch {
    lazyReady = true;
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
    moEmbed.observe(embedRoot, { attributes: true, attributeFilter: ["data-fb-page", "data-fb-tabs"] });
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
  try {
    MOBILE_MQ.addEventListener("change", () => render());
  } catch {
    MOBILE_MQ.addListener(() => render());
  }
})();
