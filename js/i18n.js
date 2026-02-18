const I18N = {
  lang: localStorage.getItem("lang") || "fr",
  baseLang: "fr",
  dict: {},
  baseDict: null,
};

function i18nBase() {
  // If we are in /admin/, go up one level (same logic as layout.js for partials)
  return /(^|\/)admin(\/|$)/.test(location.pathname) ? "../i18n/" : "i18n/";
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return await res.json();
}

async function ensureBaseLoaded() {
  if (I18N.baseDict) return;
  try {
    I18N.baseDict = await fetchJson(`${i18nBase()}${I18N.baseLang}.json`);
  } catch (e) {
    console.warn("[i18n] failed to load base language:", e);
    I18N.baseDict = {};
  }
}

function getKey(dict, key) {
  return String(key || "")
    .split(".")
    .reduce((o, k) => (o && o[k] != null ? o[k] : null), dict);
}

function formatTemplate(value, vars) {
  if (!vars || typeof value !== "string") return value;
  return value.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function t(key, fallback, vars) {
  const v = getKey(I18N.dict, key) ?? getKey(I18N.baseDict, key);
  const out = v == null ? fallback ?? key : v;
  return formatTemplate(String(out), vars);
}

function parseAttrSpec(spec) {
  // Format: "attr:key; aria-label:nav.close"
  // Separators: ";" or ","
  const s = String(spec || "").trim();
  if (!s) return [];

  return s
    .split(/[;,]/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx === -1) return null;
      const attr = pair.slice(0, idx).trim();
      const key = pair.slice(idx + 1).trim();
      if (!attr || !key) return null;
      return [attr, key];
    })
    .filter(Boolean);
}

function nodesIn(root, selector) {
  const list = [];
  if (root && root !== document && root.matches && root.matches(selector)) list.push(root);
  if (root?.querySelectorAll) list.push(...root.querySelectorAll(selector));
  return list;
}

function applyTranslations(root = document) {
  // Avoid turning the UI into raw keys before dictionaries are ready (or if they failed to load).
  if (I18N.baseDict == null) return;
  const hasAnyKeys =
    (I18N.baseDict && typeof I18N.baseDict === "object" && Object.keys(I18N.baseDict).length > 0) ||
    (I18N.dict && typeof I18N.dict === "object" && Object.keys(I18N.dict).length > 0);
  if (!hasAnyKeys) return;

  nodesIn(root, "[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });

  nodesIn(root, "[data-i18n-html]").forEach((el) => {
    // WARNING: this will inject HTML from the dictionary. Use only for trusted strings.
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });

  nodesIn(root, "[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });

  nodesIn(root, "[data-i18n-attr]").forEach((el) => {
    const pairs = parseAttrSpec(el.getAttribute("data-i18n-attr"));
    pairs.forEach(([attr, key]) => el.setAttribute(attr, t(key)));
  });

  document.documentElement.lang = I18N.lang.startsWith("zh") ? "zh-Hant" : I18N.lang;
}

async function loadLang(lang) {
  await ensureBaseLoaded();

  const next = String(lang || I18N.baseLang).trim() || I18N.baseLang;

  let dict = null;
  if (next === I18N.baseLang) {
    dict = I18N.baseDict;
  } else {
    try {
      dict = await fetchJson(`${i18nBase()}${next}.json`);
    } catch (e) {
      console.warn("[i18n] failed to load language:", next, e);
      dict = {};
    }
  }

  I18N.dict = dict || {};
  I18N.lang = next;
  localStorage.setItem("lang", next);

  applyTranslations(document);
  updateLangLabel();
  updateLangButtons();
  window.dispatchEvent(new Event("i18n:changed"));

  // close lang menu if it's open
  document.querySelector("[data-lang-wrap]")?.classList.remove("is-open");
  document.querySelector("[data-lang-toggle]")?.setAttribute("aria-expanded", "false");
}

function updateLangLabel() {
  const lab = document.querySelector("[data-lang-label]");
  if (!lab) return;
  if (I18N.lang === "zh-Hant") lab.textContent = "中文";
  else lab.textContent = I18N.lang.toUpperCase();
}

function updateLangButtons() {
  document.querySelectorAll("[data-lang]")?.forEach((btn) => {
    const isActive = btn.dataset.lang === I18N.lang;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-checked", isActive ? "true" : "false");
  });
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-lang]");
  if (!btn) return;
  loadLang(btn.dataset.lang).catch((err) => console.error(err));
});

document.addEventListener("partials:loaded", () => {
  applyTranslations(document);
  updateLangLabel();
  updateLangButtons();
});

window.addEventListener("DOMContentLoaded", () => {
  loadLang(I18N.lang).catch((err) => console.error(err));
});

// Optional: translate newly injected DOM that uses i18n data attributes.
try {
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      (m.addedNodes || []).forEach((node) => {
        if (node?.nodeType !== 1) return;
        const el = /** @type {Element} */ (node);

        const hit =
          el.matches?.("[data-i18n],[data-i18n-html],[data-i18n-placeholder],[data-i18n-attr]") ||
          el.querySelector?.("[data-i18n],[data-i18n-html],[data-i18n-placeholder],[data-i18n-attr]");
        if (!hit) return;

        applyTranslations(el);
      });
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
} catch {}

window.__t = t;
window.__lang = () => I18N.lang;
window.__applyTranslations = applyTranslations;
window.__loadLang = loadLang;
