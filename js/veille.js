// js/veille.js
(() => {
  "use strict";
  if (window.__MMG_VEILLE_INIT__) return;
  window.__MMG_VEILLE_INIT__ = true;

  const STORAGE_KEY = "mmg_veille_v1";
  const UI_KEY = "mmg_veille_ui_v1";
  const ARTIST_NAME = "Marie-Madeleine Gautier";
  const DEFAULT_PUBLIC_SITE = "https://marie-madeleine-gautier-world.com";

  const qs = (s, r = document) => r.querySelector(s);

  const t = (key, fallback, vars) => {
    try {
      if (typeof window.__t === "function") return window.__t(key, fallback, vars);
    } catch {}
    if (!vars || typeof fallback !== "string") return fallback ?? key;
    return fallback.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  };

  const nowIso = () => new Date().toISOString();

  const isAbort = (e) =>
    e?.name === "AbortError" || /signal is aborted/i.test(String(e?.message || e || ""));

  function safeJsonParse(s) {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  function readLocalStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return safeJsonParse(raw) ?? fallback;
    } catch {
      return fallback;
    }
  }

  function writeLocalStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function makeId() {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }

  function normStr(v) {
    return String(v ?? "").trim();
  }

  function extractEmail(raw) {
    const s = normStr(raw);
    if (!s) return "";
    const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0] : "";
  }

  function itemEmail(x) {
    return extractEmail(x?.email) || extractEmail(x?.contact);
  }

  function normUrl(v) {
    const s = normStr(v);
    if (!s) return "";
    if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
    return "https://" + s.replace(/^\/+/, "");
  }

  function normImageUrl(v) {
    const s = normStr(v);
    if (!s) return "";
    if (/^(data:image\/|blob:|https?:\/\/)/i.test(s)) return s;
    if (/^(\/|\.{1,2}\/)/.test(s)) return s;
    if (/^assets\//i.test(s)) return s;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return "https://" + s.replace(/^\/+/, "");
    return s;
  }

  function publicSiteUrl() {
    const origin = normStr(location?.origin);
    if (!origin || origin === "null" || /^file:/i.test(origin)) return DEFAULT_PUBLIC_SITE;
    if (/localhost|127\.0\.0\.1/i.test(origin)) return DEFAULT_PUBLIC_SITE;
    return origin;
  }

  function mailtoHref(to, subject, body) {
    const email = extractEmail(to);
    if (!email) return "";
    const params = [];
    if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
    if (body) params.push(`body=${encodeURIComponent(body)}`);
    return `mailto:${email}${params.length ? "?" + params.join("&") : ""}`;
  }

  function hostLabel(rawUrl) {
    const href = normUrl(rawUrl);
    try {
      const u = new URL(href);
      const host = u.hostname.replace(/^www\./i, "");
      return host || normStr(rawUrl);
    } catch {
      return normStr(rawUrl);
    }
  }

  function parseLinks(raw) {
    const s = normStr(raw);
    if (!s) return [];

    const out = [];
    const seen = new Set();
    const lines = s
      .split(/\r?\n/g)
      .map((x) => x.trim())
      .filter(Boolean);

    for (const line of lines) {
      let label = "";
      let url = line;

      const m = line.match(/^(.{1,48}?)\s*[:|]\s+(\S.+)$/);
      if (m) {
        label = normStr(m[1]).slice(0, 48);
        url = normStr(m[2]);
      }

      const href = normUrl(url);
      if (!href) continue;
      const key = href.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      let inferred = label;
      if (!inferred) {
        try {
          const u = new URL(href);
          const host = u.hostname.replace(/^www\./i, "");
          inferred = host || href;
        } catch {
          inferred = href;
        }
      }

      out.push({ label: inferred, url: href });
      if (out.length >= 8) break;
    }

    return out;
  }

  function parseTags(raw) {
    const s = normStr(raw);
    if (!s) return [];
    const out = [];
    const seen = new Set();
    s.split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((tag) => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(tag);
      });
    return out.slice(0, 24);
  }

  function fmtDate(yyyyMmDd) {
    const s = normStr(yyyyMmDd);
    if (!s) return "";
    const d = new Date(s + "T00:00:00");
    if (!Number.isFinite(d.getTime())) return s;
    try {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
    } catch {
      return s;
    }
  }

  function daysUntil(yyyyMmDd) {
    const s = normStr(yyyyMmDd);
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    if (!Number.isFinite(d.getTime())) return null;
    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((t1 - t0) / 86400000);
  }

  function fmtShortDate(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return "";
    try {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  function weekKey() {
    return Math.floor(Date.now() / 604800000);
  }

  function hash32(str) {
    // FNV-1a 32-bit (deterministic, small, fast)
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function typeLabel(type) {
    switch (type) {
      case "gallery":
        return t("veille.typeGallery", "Galerie");
      case "symposium":
        return t("veille.typeSymposium", "Symposium");
      case "curator":
        return t("veille.typeCurator", "Commissaire");
      default:
        return type || t("veille.typeUnknown", "Autre");
    }
  }

  function statusLabel(status) {
    switch (status) {
      case "todo":
        return t("veille.statusTodo", "À contacter");
      case "sent":
        return t("veille.statusSent", "Candidature envoyée");
      case "contacted":
        return t("veille.statusContacted", "Contacté");
      case "follow_up":
        return t("veille.statusFollowUp", "Relance");
      case "in_progress":
        return t("veille.statusInProgress", "En cours");
      case "accepted":
        return t("veille.statusAccepted", "Accepté");
      case "rejected":
        return t("veille.statusRejected", "Refusé");
      case "on_hold":
        return t("veille.statusOnHold", "En veille");
      default:
        return status || t("veille.statusUnknown", "—");
    }
  }

  function statusBadgeClass(status) {
    switch (status) {
      case "accepted":
        return "badge--ok";
      case "rejected":
        return "badge--bad";
      case "follow_up":
      case "sent":
        return "badge--warn";
      default:
        return "";
    }
  }

  function readItems() {
    const data = readLocalStorage(STORAGE_KEY, null);
    const arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        id: normStr(x.id) || makeId(),
        type: normStr(x.type) || "gallery",
        name: normStr(x.name),
        city: normStr(x.city),
        country: normStr(x.country),
        url: normStr(x.url),
        image_url: normStr(x.image_url ?? x.imageUrl ?? x.image ?? x.cover ?? ""),
        email: extractEmail(normStr(x.email ?? x.mail ?? x.e_mail ?? x.eMail ?? "")) || extractEmail(normStr(x.contact)),
        contact: normStr(x.contact),
        links: normStr(x.links),
        status: normStr(x.status) || "todo",
        deadline: normStr(x.deadline),
        next_action: normStr(x.next_action),
        tags: Array.isArray(x.tags) ? x.tags.map((t) => normStr(t)).filter(Boolean) : [],
        notes: normStr(x.notes),
        archived: Boolean(x.archived),
        createdAt: normStr(x.createdAt) || nowIso(),
        updatedAt: normStr(x.updatedAt) || nowIso(),
      }))
      .filter((x) => x.name);
  }

  function writeItems(items) {
    return writeLocalStorage(STORAGE_KEY, { version: 1, updatedAt: nowIso(), items });
  }

  function readUi() {
    const raw = readLocalStorage(UI_KEY, {});
    const normSort = (v, fallback) => {
      const s = normStr(v);
      if (s === "updated_desc" || s === "deadline_asc" || s === "name_asc" || s === "weekly") return s;
      return fallback;
    };

    const view = normStr(raw.view);
    return {
      q: normStr(raw.q),
      type: normStr(raw.type) || "all",
      status: normStr(raw.status) || "all",
      view: view === "list" ? "list" : "board",
      sortList: normSort(raw.sortList ?? raw.sort, "updated_desc"),
      sortBoard: normSort(raw.sortBoard, "weekly"),
      showArchived: Boolean(raw.showArchived),
    };
  }

  function writeUi(ui) {
    return writeLocalStorage(UI_KEY, ui);
  }

  const dom = {
    autoRefresh: null,
    autoSearch: null,
    autoMinScore: null,
    autoMeta: null,
    autoEmpty: null,
    autoList: null,
    gallerySearch: null,
    galleryMeta: null,
    galleryEmpty: null,
    galleryList: null,
    btnGalleryAdd: null,
    btnGalleryShowAll: null,
    search: null,
    type: null,
    status: null,
    sort: null,
    viewList: null,
    viewBoard: null,
    showArchived: null,
    stats: null,
    hint: null,
    empty: null,
    list: null,
    board: null,
    btnAdd: null,
    btnExport: null,
    btnImport: null,
    btnReset: null,
    importFile: null,
    modal: null,
    close: null,
    form: null,
    btnDelete: null,
    btnCancel: null,
    modalTitle: null,
  };

  let items = [];
  let ui = readUi();
  let editingId = null;

  let autoState = { generatedAt: "", items: [] };

  function syncControlsFromUi() {
    if (dom.search) dom.search.value = ui.q;
    if (dom.type) dom.type.value = ui.type;
    if (dom.status) dom.status.value = ui.status;
    if (dom.sort) dom.sort.value = ui.view === "board" ? ui.sortBoard : ui.sortList;
    if (dom.showArchived) dom.showArchived.checked = ui.showArchived;
    if (dom.viewList) dom.viewList.setAttribute("aria-pressed", ui.view === "list" ? "true" : "false");
    if (dom.viewBoard) dom.viewBoard.setAttribute("aria-pressed", ui.view === "board" ? "true" : "false");
  }

  function syncUiFromControls() {
    const next = {
      ...ui,
      q: normStr(dom.search?.value),
      type: normStr(dom.type?.value) || "all",
      status: normStr(dom.status?.value) || "all",
      showArchived: Boolean(dom.showArchived?.checked),
    };

    const rawSort = normStr(dom.sort?.value);
    const isValidSort =
      rawSort === "updated_desc" || rawSort === "deadline_asc" || rawSort === "name_asc" || rawSort === "weekly";
    const sort = isValidSort ? rawSort : next.view === "board" ? "weekly" : "updated_desc";

    if (next.view === "board") next.sortBoard = sort;
    else next.sortList = sort;

    ui = next;
    writeUi(ui);
  }

  function compareItems(a, b) {
    const sort = ui.view === "board" ? ui.sortBoard : ui.sortList;
    if (sort === "weekly") {
      const wk = weekKey();
      const as = hash32(`${wk}|${a.id}`);
      const bs = hash32(`${wk}|${b.id}`);
      if (as !== bs) return as < bs ? -1 : 1;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    }
    if (sort === "name_asc") return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (sort === "deadline_asc") {
      const ad = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
      const bd = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    }
    // updated_desc
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  }

  function applyFilters(list) {
    const q = ui.q.toLowerCase();
    return list
      .filter((x) => (ui.showArchived ? true : !x.archived))
      .filter((x) => (ui.type === "all" ? true : x.type === ui.type))
      .filter((x) => (ui.status === "all" ? true : x.status === ui.status))
      .filter((x) => {
        if (!q) return true;
        const hay = [
          x.name,
          x.city,
          x.country,
          x.url,
          x.image_url,
          x.email,
          x.contact,
          x.links,
          x.notes,
          x.next_action,
          (x.tags || []).join(" "),
        ]
          .join(" \n ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort(compareItems);
  }

  function setModalTitle(isEdit) {
    const title = isEdit
      ? t("veille.modalEditTitle", "Modifier la fiche")
      : t("veille.modalNewTitle", "Nouvelle fiche");
    if (dom.modalTitle) dom.modalTitle.textContent = title;
  }

  function openModal(item) {
    editingId = item?.id || null;
    setModalTitle(Boolean(editingId));
    dom.btnDelete.hidden = !editingId;

    dom.form.reset();
    dom.form.elements.id.value = editingId || "";

    const set = (name, val) => {
      const el = dom.form.elements[name];
      if (!el) return;
      if (el.type === "checkbox") el.checked = Boolean(val);
      else el.value = val ?? "";
    };

    set("type", item?.type || "gallery");
    set("status", item?.status || "todo");
    set("name", item?.name || "");
    set("city", item?.city || "");
    set("country", item?.country || "");
    set("url", item?.url || "");
    set("image_url", item?.image_url || "");
    set("email", item?.email || "");
    set("contact", item?.contact || "");
    set("links", item?.links || "");
    set("deadline", item?.deadline || "");
    set("next_action", item?.next_action || "");
    set("tags", (item?.tags || []).join(", "));
    set("notes", item?.notes || "");
    set("archived", Boolean(item?.archived));

    dom.modal.hidden = false;
    setTimeout(() => {
      try {
        dom.form.elements.name?.focus?.();
      } catch {}
    }, 0);
  }

  function closeModal() {
    dom.modal.hidden = true;
    editingId = null;
  }

  function scoreBadgeClass(score) {
    const s = Number(score);
    if (!Number.isFinite(s)) return "badge--dim";
    if (s >= 80) return "badge--ok";
    if (s >= 60) return "badge--warn";
    return "badge--dim";
  }

  function normalizeIsoDate(raw) {
    const s = normStr(raw);
    if (!s || s === "—" || s === "-") return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (m) {
      const dd = String(m[1]).padStart(2, "0");
      const mm = String(m[2]).padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    return "";
  }

  function normalizeAutoItems(raw) {
    const arr = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x) => {
        const title = normStr(x.title ?? x.name ?? "");
        const url = normStr(x.url ?? x.href ?? "");
        const source_url = normStr(x.source_url ?? x.sourceUrl ?? x.source ?? "");
        const score = Math.max(0, Math.min(100, Number(x.score) || 0));
        let country_or_region = normStr(x.country_or_region ?? x.countryOrRegion ?? x.country ?? x.region ?? "");
        if (country_or_region === "—" || country_or_region === "-") country_or_region = "";
        const deadline_raw = normStr(x.deadline ?? x.deadline_raw ?? x.deadlineRaw ?? "");
        const deadline = normalizeIsoDate(deadline_raw) || "";
        const detected_at = normStr(x.detected_at ?? x.detectedAt ?? "");
        const matched_keywords = Array.isArray(x.matched_keywords ?? x.matchedKeywords)
          ? (x.matched_keywords ?? x.matchedKeywords).map((k) => normStr(k)).filter(Boolean)
          : [];
        const context = normStr(x.context ?? x.snippet ?? x.description ?? "");
        const image_url = normStr(x.image_url ?? x.imageUrl ?? x.image ?? "");
        return {
          title,
          url,
          source_url,
          score,
          country_or_region,
          deadline,
          deadline_raw,
          detected_at,
          matched_keywords,
          context,
          image_url,
        };
      })
      .filter((x) => x.title && x.url);
  }

  function autoMetaText(total, filtered) {
    const ms = Date.parse(autoState.generatedAt || "");
    const date = Number.isFinite(ms) ? fmtShortDate(ms) : "";
    return t("veille.autoMeta", "{filtered} / {total} résultat(s) · MAJ : {date}", {
      filtered,
      total,
      date: date || t("common.unknown", "—"),
    });
  }

  function renderAuto() {
    if (!dom.autoList) return;

    const q = normStr(dom.autoSearch?.value).toLowerCase();
    const minScore = Number(dom.autoMinScore?.value) || 0;

    const filtered = autoState.items
      .filter((it) => (Number.isFinite(it.score) ? it.score : 0) >= minScore)
      .filter((it) => {
        if (!q) return true;
        const hay = [
          it.title,
          it.url,
          it.source_url,
          it.country_or_region,
          it.deadline_raw,
          it.deadline,
          it.context,
          (it.matched_keywords || []).join(" "),
        ]
          .join(" \n ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => {
        const as = Number(a.score) || 0;
        const bs = Number(b.score) || 0;
        if (as !== bs) return bs - as;
        const ad = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
        const bd = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      });

    if (dom.autoMeta) dom.autoMeta.textContent = autoMetaText(autoState.items.length, filtered.length);

    dom.autoList.innerHTML = "";
    if (dom.autoEmpty) dom.autoEmpty.hidden = filtered.length !== 0;

    filtered.slice(0, 60).forEach((it) => {
      const row = document.createElement("div");
      row.className = "item veille-item veille-auto-item";
      row.dataset.autoUrl = it.url;

      const thumbSrc = normImageUrl(it.image_url);
      if (thumbSrc) {
        const thumb = document.createElement("img");
        thumb.className = "veille-thumb";
        thumb.loading = "lazy";
        thumb.decoding = "async";
        thumb.alt = "";
        thumb.src = thumbSrc;
        thumb.addEventListener(
          "error",
          () => {
            try {
              thumb.remove();
            } catch {}
          },
          { once: true }
        );
        row.appendChild(thumb);
      }

      const main = document.createElement("div");
      main.className = "veille-main";

      const titleRow = document.createElement("div");
      titleRow.className = "veille-titleRow";

      const name = document.createElement("div");
      name.className = "veille-name";
      const aTitle = document.createElement("a");
      aTitle.href = normUrl(it.url);
      aTitle.target = "_blank";
      aTitle.rel = "noopener noreferrer";
      aTitle.textContent = it.title;
      name.appendChild(aTitle);
      titleRow.appendChild(name);

      if (it.country_or_region) {
        const b = document.createElement("span");
        b.className = "badge badge--dim";
        b.textContent = it.country_or_region;
        titleRow.appendChild(b);
      }

      if (it.deadline || it.deadline_raw) {
        const d = document.createElement("span");
        d.className = "badge badge--dim";
        d.textContent = it.deadline ? fmtDate(it.deadline) : it.deadline_raw;
        titleRow.appendChild(d);
      }

      const score = document.createElement("span");
      score.className = "badge " + scoreBadgeClass(it.score);
      score.textContent = t("veille.autoScore", "Score {n}", { n: Math.round(Number(it.score) || 0) });
      titleRow.appendChild(score);

      main.appendChild(titleRow);

      const meta = document.createElement("div");
      meta.className = "muted veille-meta";

      let had = false;
      const sep = () => {
        if (had) meta.appendChild(document.createTextNode(" • "));
        had = true;
      };
      const addText = (text) => {
        const s = normStr(text);
        if (!s) return;
        sep();
        meta.appendChild(document.createTextNode(s));
      };
      const addLink = (label, url) => {
        const s = normStr(url);
        if (!s) return;
        sep();
        const a = document.createElement("a");
        a.href = normUrl(s);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = label || s;
        meta.appendChild(a);
      };

      addText(hostLabel(it.url));
      if (it.source_url) addLink(t("veille.autoSource", "Source"), it.source_url);
      if (it.detected_at) addText(fmtShortDate(Date.parse(it.detected_at)));
      main.appendChild(meta);

      if (it.context) {
        const p = document.createElement("div");
        p.className = "muted veille-auto-snippet";
        p.textContent = it.context;
        main.appendChild(p);
      }

      if (Array.isArray(it.matched_keywords) && it.matched_keywords.length) {
        const kws = document.createElement("div");
        kws.className = "veille-auto-kws";
        it.matched_keywords.slice(0, 14).forEach((kw) => {
          const b = document.createElement("span");
          b.className = "badge badge--dim";
          b.textContent = kw;
          kws.appendChild(b);
        });
        main.appendChild(kws);
      }

      row.appendChild(main);

      const actions = document.createElement("div");
      actions.className = "veille-actions";

      const aOpen = document.createElement("a");
      aOpen.className = "icon-btn";
      aOpen.href = normUrl(it.url);
      aOpen.target = "_blank";
      aOpen.rel = "noopener noreferrer";
      aOpen.textContent = t("veille.actionOpen", "Ouvrir");
      actions.appendChild(aOpen);

      const btnAdd = document.createElement("button");
      btnAdd.className = "icon-btn";
      btnAdd.type = "button";
      btnAdd.dataset.action = "auto_add";
      btnAdd.textContent = t("veille.autoAdd", "Ajouter à ma veille");
      actions.appendChild(btnAdd);

      row.appendChild(actions);
      dom.autoList.appendChild(row);
    });
  }

  async function loadAuto({ bustCache = false } = {}) {
    if (!dom.autoList) return;
    if (dom.autoMeta) dom.autoMeta.textContent = t("veille.autoLoading", "Chargement…");

    const url = bustCache ? `data/veille-auto.json?t=${Date.now()}` : "data/veille-auto.json";
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      autoState = {
        generatedAt: normStr(data?.generatedAt ?? data?.updatedAt ?? ""),
        items: normalizeAutoItems(data),
      };

      renderAuto();
    } catch (e) {
      autoState = { generatedAt: "", items: [] };
      if (dom.autoList) dom.autoList.innerHTML = "";
      if (dom.autoEmpty) dom.autoEmpty.hidden = false;
      if (dom.autoMeta)
        dom.autoMeta.textContent = t("veille.autoLoadError", "Impossible de charger la recherche automatique.");
      console.warn("[veille] auto load failed", e);
    }
  }

  function inferTypeFromAuto(it) {
    const hay = normStr(
      `${it.title} ${(it.matched_keywords || []).join(" ")} ${it.context} ${it.url} ${it.source_url}`
    ).toLowerCase();
    if (/symposium|residenc|résidenc|residence/.test(hay)) return "symposium";
    if (/curator|commissaire/.test(hay)) return "curator";
    if (/gallery|galerie|galería|gallerie/.test(hay)) return "gallery";
    return "gallery";
  }

  function openAutoAsNewVeille(it) {
    if (!it) return;
    const deadline = it.deadline || normalizeIsoDate(it.deadline_raw) || "";
    const tags = Array.isArray(it.matched_keywords) ? it.matched_keywords.slice(0, 18) : [];
    const notesParts = [];
    if (it.context) notesParts.push(it.context);
    if (it.source_url) notesParts.push(`${t("veille.autoSource", "Source")}: ${it.source_url}`);
    const notes = notesParts.join("\n\n").trim();

    openModal({
      type: inferTypeFromAuto(it),
      name: it.title,
      country: it.country_or_region,
      url: it.url,
      image_url: it.image_url,
      email: "",
      links: it.source_url ? `${t("veille.autoSource", "Source")}: ${it.source_url}` : "",
      deadline,
      tags,
      notes,
      status: "todo",
    });
  }

  function buildEmailForItem(x) {
    const to = itemEmail(x);
    if (!to) return null;

    const vars = {
      my_name: ARTIST_NAME,
      my_site: publicSiteUrl(),
      name: normStr(x?.name),
      url: normUrl(x?.url),
      city: normStr(x?.city),
      country: normStr(x?.country),
      contact: normStr(x?.contact),
    };

    const subject = t("veille.emailSubject", "Proposition — {my_name}", vars);
    let body = t(
      "veille.emailBody",
      "Bonjour,\n\nJe me permets de vous contacter afin de vous présenter mon travail.\n\nPortfolio : {my_site}\n\nBien cordialement,\n{my_name}",
      vars
    );

    body = String(body || "").replace(/\r\n/g, "\n");
    if (body.length > 1800) body = body.slice(0, 1799) + "…";

    return { to, subject, body };
  }

  function sendEmailForItem(x) {
    const mail = buildEmailForItem(x);
    if (!mail) {
      alert(t("veille.emailMissing", "Ajoute un email (dans la fiche) avant d’envoyer."));
      return;
    }

    const href = mailtoHref(mail.to, mail.subject, mail.body);
    if (!href) {
      alert(t("veille.emailMissing", "Ajoute un email (dans la fiche) avant d’envoyer."));
      return;
    }

    window.location.href = href;
  }

  function renderGallerySection() {
    if (!dom.galleryList) return;

    const q = normStr(dom.gallerySearch?.value).toLowerCase();

    const base = items
      .filter((x) => x.type === "gallery")
      .filter((x) => !x.archived)
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

    const filtered = base.filter((x) => {
      if (!q) return true;
      const hay = [
        x.name,
        x.city,
        x.country,
        x.url,
        x.email,
        x.contact,
        x.links,
        x.notes,
        (x.tags || []).join(" "),
      ]
        .join(" \n ")
        .toLowerCase();
      return hay.includes(q);
    });

    const shown = Math.min(12, filtered.length);
    if (dom.galleryMeta)
      dom.galleryMeta.textContent = t("veille.galleryMeta", "{shown} / {total} galeries", {
        shown,
        total: filtered.length,
      });

    dom.galleryList.innerHTML = "";
    if (dom.galleryEmpty) dom.galleryEmpty.hidden = filtered.length !== 0;

    filtered.slice(0, 12).forEach((x) => {
      const row = document.createElement("div");
      row.className = "item veille-item";
      row.dataset.id = x.id;
      const email = itemEmail(x);

      const thumbSrc = normImageUrl(x.image_url);
      if (thumbSrc) {
        const thumb = document.createElement("img");
        thumb.className = "veille-thumb";
        thumb.loading = "lazy";
        thumb.decoding = "async";
        thumb.alt = "";
        thumb.src = thumbSrc;
        thumb.addEventListener(
          "error",
          () => {
            try {
              thumb.remove();
            } catch {}
          },
          { once: true }
        );
        row.appendChild(thumb);
      }

      const main = document.createElement("div");
      main.className = "veille-main";

      const titleRow = document.createElement("div");
      titleRow.className = "veille-titleRow";

      const name = document.createElement("div");
      name.className = "veille-name";
      name.textContent = x.name;
      titleRow.appendChild(name);

      const status = document.createElement("span");
      status.className = "badge " + statusBadgeClass(x.status);
      status.textContent = statusLabel(x.status);
      titleRow.appendChild(status);

      main.appendChild(titleRow);

      const meta = document.createElement("div");
      meta.className = "muted veille-meta";

      let had = false;
      const sep = () => {
        if (had) meta.appendChild(document.createTextNode(" • "));
        had = true;
      };
      const addText = (text) => {
        const s = normStr(text);
        if (!s) return;
        sep();
        meta.appendChild(document.createTextNode(s));
      };
      const addLink = (label, url) => {
        const s = normStr(url);
        if (!s) return;
        sep();
        const a = document.createElement("a");
        a.href = normUrl(s);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = label || s;
        meta.appendChild(a);
      };

      const place = [x.city, x.country].filter(Boolean).join(", ");
      addText(place);
      if (email) addText(email);
      if (x.url) addLink(hostLabel(x.url), x.url);
      main.appendChild(meta);

      row.appendChild(main);

      const actions = document.createElement("div");
      actions.className = "veille-actions";

      if (x.url) {
        const a = document.createElement("a");
        a.className = "icon-btn";
        a.href = normUrl(x.url);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = t("veille.actionOpen", "Ouvrir");
        actions.appendChild(a);
      }

      if (email) {
        const btnEmail = document.createElement("button");
        btnEmail.className = "icon-btn";
        btnEmail.type = "button";
        btnEmail.dataset.action = "email";
        btnEmail.textContent = t("veille.actionEmail", "Email");
        actions.appendChild(btnEmail);
      }

      const btnEdit = document.createElement("button");
      btnEdit.className = "icon-btn";
      btnEdit.type = "button";
      btnEdit.dataset.action = "edit";
      btnEdit.textContent = t("veille.actionEdit", "Éditer");
      actions.appendChild(btnEdit);

      row.appendChild(actions);
      dom.galleryList?.appendChild(row);
    });
  }

  function render() {
    const filtered = applyFilters(items);

    const archivedCount = items.filter((x) => x.archived).length;
    dom.stats.textContent = t("veille.stats", "{visible} / {total} fiches ({archived} archivées)", {
      visible: filtered.length,
      total: items.length,
      archived: archivedCount,
    });

    const isBoard = ui.view === "board";

    if (dom.list) dom.list.hidden = isBoard;
    if (dom.board) dom.board.hidden = !isBoard;

    if (dom.list) dom.list.innerHTML = "";
    if (dom.board) dom.board.innerHTML = "";
    dom.empty.hidden = filtered.length !== 0;

    if (dom.hint) {
      const showHint = isBoard && ui.sortBoard === "weekly";
      dom.hint.hidden = !showHint;
      if (showHint) {
        const next = (weekKey() + 1) * 604800000;
        dom.hint.textContent = t(
          "veille.weeklyHint",
          "Ordre renouvelé chaque semaine (prochaine mise à jour : {date}).",
          { date: fmtShortDate(next) }
        );
      }
    }

    filtered.forEach((x) => {
      if (isBoard) {
        const card = document.createElement("article");
        card.className = "veille-card";
        card.dataset.id = x.id;

        const cover = document.createElement("div");
        cover.className = "veille-cover";

        const badges = document.createElement("div");
        badges.className = "veille-badges";

        const bType = document.createElement("span");
        bType.className = "badge";
        bType.textContent = typeLabel(x.type);
        badges.appendChild(bType);

        const bStatus = document.createElement("span");
        bStatus.className = "badge " + statusBadgeClass(x.status);
        bStatus.textContent = statusLabel(x.status);
        badges.appendChild(bStatus);

        if (x.archived) {
          const arch = document.createElement("span");
          arch.className = "badge badge--dim";
          arch.textContent = t("veille.badgeArchived", "Archivé");
          badges.appendChild(arch);
        }

        cover.appendChild(badges);

        const ph = document.createElement("div");
        ph.className = "veille-cover__placeholder";
        ph.textContent = normStr(x.name).slice(0, 1).toUpperCase() || "•";

        const src = normImageUrl(x.image_url);
        if (src) {
          const img = document.createElement("img");
          img.className = "veille-cover__img";
          img.loading = "lazy";
          img.decoding = "async";
          img.alt = "";
          img.src = src;
          img.addEventListener(
            "error",
            () => {
              try {
                img.remove();
              } catch {}
              cover.classList.add("is-empty");
              cover.appendChild(ph);
            },
            { once: true }
          );
          cover.appendChild(img);
        } else {
          cover.classList.add("is-empty");
          cover.appendChild(ph);
        }

        card.appendChild(cover);

        const body = document.createElement("div");
        body.className = "veille-card__body";

        const title = document.createElement("div");
        title.className = "veille-card__title";
        title.textContent = x.name;
        body.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "muted veille-card__meta";
        const place = [x.city, x.country].filter(Boolean).join(", ");
        const metaParts = [];
        if (place) metaParts.push(place);
        if (x.contact) metaParts.push(x.contact);
        meta.textContent = metaParts.join(" • ");
        body.appendChild(meta);

        const next = [];
        if (x.next_action) next.push(t("veille.nextActionPrefix", "Prochaine action : ") + x.next_action);
        if (x.deadline) {
          const dateText = fmtDate(x.deadline);
          if (dateText) next.push(t("veille.deadlinePrefix", "Échéance : ") + dateText);
        }
        if (next.length) {
          const p = document.createElement("div");
          p.className = "muted veille-card__meta";
          p.textContent = next.join(" • ");
          body.appendChild(p);
        }

        if (Array.isArray(x.tags) && x.tags.length) {
          const tags = document.createElement("div");
          tags.className = "veille-tags";
          x.tags.slice(0, 24).forEach((tag) => {
            const b = document.createElement("span");
            b.className = "badge badge--dim";
            b.textContent = tag;
            tags.appendChild(b);
          });
          body.appendChild(tags);
        }

        card.appendChild(body);

        const footer = document.createElement("div");
        footer.className = "veille-card__footer";

        const links = document.createElement("div");
        links.className = "veille-card__links";

        const linkItems = [];
        const seenUrls = new Set();

        if (x.url) {
          const href = normUrl(x.url);
          if (href) {
            const key = href.toLowerCase();
            seenUrls.add(key);
            linkItems.push({ label: t("veille.linkSite", "Site"), url: href });
          }
        }

        parseLinks(x.links).forEach((l) => {
          if (!l?.url) return;
          const key = String(l.url).toLowerCase();
          if (seenUrls.has(key)) return;
          seenUrls.add(key);
          linkItems.push(l);
        });

        linkItems.slice(0, 6).forEach((l) => {
          const a = document.createElement("a");
          a.className = "veille-chip";
          a.href = l.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = l.label;
          links.appendChild(a);
        });

        footer.appendChild(links);

        const actions = document.createElement("div");
        actions.className = "veille-card__actions";

        const mail = itemEmail(x);
        if (mail) {
          const btnEmail = document.createElement("button");
          btnEmail.className = "icon-btn";
          btnEmail.type = "button";
          btnEmail.dataset.action = "email";
          btnEmail.textContent = t("veille.actionEmail", "Email");
          actions.appendChild(btnEmail);
        }

        const btnEdit = document.createElement("button");
        btnEdit.className = "icon-btn";
        btnEdit.type = "button";
        btnEdit.dataset.action = "edit";
        btnEdit.textContent = t("veille.actionEdit", "Éditer");
        actions.appendChild(btnEdit);

        const btnArch = document.createElement("button");
        btnArch.className = "icon-btn";
        btnArch.type = "button";
        btnArch.dataset.action = "archive";
        btnArch.textContent = x.archived
          ? t("veille.actionUnarchive", "Désarchiver")
          : t("veille.actionArchive", "Archiver");
        actions.appendChild(btnArch);

        const btnDel = document.createElement("button");
        btnDel.className = "icon-btn danger";
        btnDel.type = "button";
        btnDel.dataset.action = "delete";
        btnDel.textContent = t("veille.actionDelete", "Supprimer");
        actions.appendChild(btnDel);

        footer.appendChild(actions);
        card.appendChild(footer);
        dom.board?.appendChild(card);
        return;
      }

      const row = document.createElement("div");
      row.className = "item veille-item";
      row.dataset.id = x.id;

      const thumbSrc = normImageUrl(x.image_url);
      if (thumbSrc) {
        const thumb = document.createElement("img");
        thumb.className = "veille-thumb";
        thumb.loading = "lazy";
        thumb.decoding = "async";
        thumb.alt = "";
        thumb.src = thumbSrc;
        thumb.addEventListener(
          "error",
          () => {
            try {
              thumb.remove();
            } catch {}
          },
          { once: true }
        );
        row.appendChild(thumb);
      }

      const main = document.createElement("div");
      main.className = "veille-main";

      const titleRow = document.createElement("div");
      titleRow.className = "veille-titleRow";

      const name = document.createElement("div");
      name.className = "veille-name";
      name.textContent = x.name;
      titleRow.appendChild(name);

      const type = document.createElement("span");
      type.className = "badge";
      type.textContent = typeLabel(x.type);
      titleRow.appendChild(type);

      const status = document.createElement("span");
      status.className = "badge " + statusBadgeClass(x.status);
      status.textContent = statusLabel(x.status);
      titleRow.appendChild(status);

      if (x.archived) {
        const arch = document.createElement("span");
        arch.className = "badge badge--dim";
        arch.textContent = t("veille.badgeArchived", "Archivé");
        titleRow.appendChild(arch);
      }

      main.appendChild(titleRow);

      const meta = document.createElement("div");
      meta.className = "muted veille-meta";

      let had = false;
      const sep = () => {
        if (had) meta.appendChild(document.createTextNode(" • "));
        had = true;
      };
      const addText = (text) => {
        const s = normStr(text);
        if (!s) return;
        sep();
        meta.appendChild(document.createTextNode(s));
      };
      const addLink = (label, url) => {
        const s = normStr(url);
        if (!s) return;
        sep();
        const a = document.createElement("a");
        a.href = normUrl(s);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = label || s;
        meta.appendChild(a);
      };

      const place = [x.city, x.country].filter(Boolean).join(", ");
      addText(place);
      addText(x.contact);
      if (x.url) addLink(hostLabel(x.url), x.url);

      main.appendChild(meta);

      const next = [];
      if (x.next_action) next.push(t("veille.nextActionPrefix", "Prochaine action : ") + x.next_action);
      if (x.deadline) {
        const days = daysUntil(x.deadline);
        const dateText = fmtDate(x.deadline);
        if (days == null) next.push(t("veille.deadlinePrefix", "Échéance : ") + dateText);
        else {
          const suffix =
            days < 0
              ? t("veille.deadlineOverdue", " (en retard)")
              : days === 0
                ? t("veille.deadlineToday", " (aujourd’hui)")
                : t("veille.deadlineIn", " (dans {n} j)", { n: days });
          next.push(t("veille.deadlinePrefix", "Échéance : ") + dateText + suffix);
        }
      }

      if (next.length) {
        const p = document.createElement("div");
        p.className = "muted veille-meta";
        p.textContent = next.join(" • ");
        main.appendChild(p);
      }

      if (Array.isArray(x.tags) && x.tags.length) {
        const tags = document.createElement("div");
        tags.className = "veille-tags";
        x.tags.slice(0, 24).forEach((tag) => {
          const b = document.createElement("span");
          b.className = "badge badge--dim";
          b.textContent = tag;
          tags.appendChild(b);
        });
        main.appendChild(tags);
      }

      row.appendChild(main);

      const actions = document.createElement("div");
      actions.className = "veille-actions";

      if (x.url) {
        const a = document.createElement("a");
        a.className = "icon-btn";
        a.href = normUrl(x.url);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = t("veille.actionOpen", "Ouvrir");
        actions.appendChild(a);
      }

      const mail = itemEmail(x);
      if (mail) {
        const btnEmail = document.createElement("button");
        btnEmail.className = "icon-btn";
        btnEmail.type = "button";
        btnEmail.dataset.action = "email";
        btnEmail.textContent = t("veille.actionEmail", "Email");
        actions.appendChild(btnEmail);
      }

      const btnEdit = document.createElement("button");
      btnEdit.className = "icon-btn";
      btnEdit.type = "button";
      btnEdit.dataset.action = "edit";
      btnEdit.textContent = t("veille.actionEdit", "Éditer");
      actions.appendChild(btnEdit);

      const btnArch = document.createElement("button");
      btnArch.className = "icon-btn";
      btnArch.type = "button";
      btnArch.dataset.action = "archive";
      btnArch.textContent = x.archived
        ? t("veille.actionUnarchive", "Désarchiver")
        : t("veille.actionArchive", "Archiver");
      actions.appendChild(btnArch);

      const btnDel = document.createElement("button");
      btnDel.className = "icon-btn danger";
      btnDel.type = "button";
      btnDel.dataset.action = "delete";
      btnDel.textContent = t("veille.actionDelete", "Supprimer");
      actions.appendChild(btnDel);

      row.appendChild(actions);
      dom.list.appendChild(row);
    });

    renderGallerySection();
  }

  function upsertItemFromForm() {
    const fd = new FormData(dom.form);
    const id = normStr(fd.get("id"));

    const patch = {
      type: normStr(fd.get("type")) || "gallery",
      status: normStr(fd.get("status")) || "todo",
      name: normStr(fd.get("name")),
      city: normStr(fd.get("city")),
      country: normStr(fd.get("country")),
      url: normStr(fd.get("url")),
      image_url: normImageUrl(fd.get("image_url")),
      email: extractEmail(fd.get("email")),
      contact: normStr(fd.get("contact")),
      links: normStr(fd.get("links")),
      deadline: normStr(fd.get("deadline")),
      next_action: normStr(fd.get("next_action")),
      tags: parseTags(fd.get("tags")),
      notes: normStr(fd.get("notes")),
      archived: Boolean(dom.form.elements.archived?.checked),
    };

    if (!patch.name) return;

    const now = nowIso();

    if (id) {
      const idx = items.findIndex((x) => x.id === id);
      if (idx !== -1) items[idx] = { ...items[idx], ...patch, updatedAt: now };
      else items.unshift({ id, ...patch, createdAt: now, updatedAt: now });
    } else {
      items.unshift({ id: makeId(), ...patch, createdAt: now, updatedAt: now });
    }

    writeItems(items);
    render();
  }

  function deleteItem(id) {
    const idx = items.findIndex((x) => x.id === id);
    if (idx === -1) return;

    const ok = confirm(
      t("veille.confirmDelete", "Supprimer « {name} » ?", {
        name: items[idx].name || "",
      })
    );
    if (!ok) return;

    items.splice(idx, 1);
    writeItems(items);
    render();
  }

  function toggleArchive(id) {
    const idx = items.findIndex((x) => x.id === id);
    if (idx === -1) return;
    items[idx] = { ...items[idx], archived: !items[idx].archived, updatedAt: nowIso() };
    writeItems(items);
    render();
  }

  function exportJson() {
    const payload = { version: 1, exportedAt: nowIso(), items };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `veille-${stamp}.json`;
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(a.href);
      } catch {}
      a.remove();
    }, 0);
  }

  async function importJsonFile(file) {
    if (!file) return;
    let text = "";
    try {
      text = await file.text();
    } catch (e) {
      if (isAbort(e)) return;
      alert(t("veille.importError", "Impossible de lire le fichier."));
      return;
    }

    const data = safeJsonParse(text);
    const incoming = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
    if (!incoming) {
      alert(t("veille.importInvalid", "Format invalide."));
      return;
    }

    // Merge, keep existing; re-id collisions.
    const byId = new Map(items.map((x) => [x.id, x]));
    const add = [];

    incoming
      .filter((x) => x && typeof x === "object")
      .forEach((raw) => {
        const item = {
          id: normStr(raw.id) || makeId(),
          type: normStr(raw.type) || "gallery",
          name: normStr(raw.name),
          city: normStr(raw.city),
          country: normStr(raw.country),
          url: normStr(raw.url),
          email: extractEmail(normStr(raw.email ?? raw.mail ?? raw.e_mail ?? raw.eMail ?? "")) || extractEmail(normStr(raw.contact)),
          contact: normStr(raw.contact),
          image_url: normStr(raw.image_url ?? raw.imageUrl ?? raw.image ?? raw.cover ?? ""),
          links: normStr(raw.links),
          status: normStr(raw.status) || "todo",
          deadline: normStr(raw.deadline),
          next_action: normStr(raw.next_action),
          tags: Array.isArray(raw.tags) ? raw.tags.map((t) => normStr(t)).filter(Boolean) : [],
          notes: normStr(raw.notes),
          archived: Boolean(raw.archived),
          createdAt: normStr(raw.createdAt) || nowIso(),
          updatedAt: normStr(raw.updatedAt) || nowIso(),
        };
        if (!item.name) return;
        while (byId.has(item.id)) item.id = makeId();
        byId.set(item.id, item);
        add.push(item);
      });

    if (!add.length) return;
    items = [...add, ...items];
    writeItems(items);
    render();
  }

  function resetAll() {
    const ok = confirm(t("veille.confirmReset", "Tout effacer ? (cette action est irréversible)"));
    if (!ok) return;
    items = [];
    writeItems(items);
    render();
  }

  function wire() {
    dom.autoRefresh = qs("#btnAutoRefresh");
    dom.autoSearch = qs("#aSearch");
    dom.autoMinScore = qs("#aMinScore");
    dom.autoMeta = qs("#aMeta");
    dom.autoEmpty = qs("#aEmpty");
    dom.autoList = qs("#aList");

    dom.gallerySearch = qs("#gSearch");
    dom.galleryMeta = qs("#gMeta");
    dom.galleryEmpty = qs("#gEmpty");
    dom.galleryList = qs("#gList");
    dom.btnGalleryAdd = qs("#btnGalleryAdd");
    dom.btnGalleryShowAll = qs("#btnGalleryShowAll");

    dom.search = qs("#vSearch");
    dom.type = qs("#vType");
    dom.status = qs("#vStatus");
    dom.sort = qs("#vSort");
    dom.viewList = qs("#vViewList");
    dom.viewBoard = qs("#vViewBoard");
    dom.showArchived = qs("#vShowArchived");
    dom.stats = qs("#vStats");
    dom.hint = qs("#vHint");
    dom.empty = qs("#vEmpty");
    dom.list = qs("#vList");
    dom.board = qs("#vBoard");
    dom.btnAdd = qs("#btnAdd");
    dom.btnExport = qs("#btnExport");
    dom.btnImport = qs("#btnImport");
    dom.btnReset = qs("#btnReset");
    dom.importFile = qs("#importFile");

    dom.modal = qs("#veilleModal");
    dom.close = qs("#veilleClose");
    dom.form = qs("#veilleForm");
    dom.btnDelete = qs("#btnDelete");
    dom.btnCancel = qs("#btnCancel");
    dom.modalTitle = qs("#veilleModalTitle");

    items = readItems();

    syncControlsFromUi();
    render();

    loadAuto().catch(() => {});

    // Auto-refresh weekly sort even if the tab stays open.
    let lastWk = weekKey();
    setInterval(() => {
      const wk = weekKey();
      if (wk === lastWk) return;
      lastWk = wk;
      const activeSort = ui.view === "board" ? ui.sortBoard : ui.sortList;
      if (activeSort === "weekly") render();
    }, 30 * 60 * 1000);

    const onFilterChange = () => {
      syncUiFromControls();
      render();
    };

    dom.search.addEventListener("input", onFilterChange);
    dom.type.addEventListener("change", onFilterChange);
    dom.status.addEventListener("change", onFilterChange);
    dom.sort.addEventListener("change", onFilterChange);
    dom.showArchived.addEventListener("change", onFilterChange);

    const setView = (view) => {
      const v = view === "list" ? "list" : "board";
      if (ui.view === v) return;
      syncUiFromControls();
      ui = { ...ui, view: v };
      writeUi(ui);
      syncControlsFromUi();
      render();
    };

    dom.viewList?.addEventListener("click", () => setView("list"));
    dom.viewBoard?.addEventListener("click", () => setView("board"));

    dom.btnAdd.addEventListener("click", () => openModal(null));
    dom.btnExport.addEventListener("click", exportJson);
    dom.btnImport.addEventListener("click", () => dom.importFile.click());
    dom.btnReset.addEventListener("click", resetAll);

    dom.importFile.addEventListener("change", async () => {
      const file = dom.importFile.files?.[0];
      dom.importFile.value = "";
      await importJsonFile(file);
    });

    const onAutoFilter = () => renderAuto();
    dom.autoSearch?.addEventListener("input", onAutoFilter);
    dom.autoMinScore?.addEventListener("change", onAutoFilter);
    dom.autoRefresh?.addEventListener("click", () => loadAuto({ bustCache: true }));

    dom.autoList?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action !== "auto_add") return;
      const row = btn.closest("[data-auto-url]");
      const url = normStr(row?.dataset?.autoUrl);
      if (!url) return;
      const it = autoState.items.find((x) => x.url === url);
      if (!it) return;
      openAutoAsNewVeille(it);
    });

    dom.gallerySearch?.addEventListener("input", () => renderGallerySection());
    dom.btnGalleryAdd?.addEventListener("click", () => openModal({ type: "gallery" }));
    dom.btnGalleryShowAll?.addEventListener("click", () => {
      if (dom.type) dom.type.value = "gallery";
      syncUiFromControls();
      render();
      setTimeout(() => {
        const target = ui.view === "board" ? dom.board : dom.list;
        target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }, 0);
    });

    const onItemAction = (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const row = btn.closest("[data-id]");
      const id = row?.dataset?.id;
      if (!id) return;

      if (btn.dataset.action === "edit") {
        const item = items.find((x) => x.id === id);
        if (item) openModal(item);
      } else if (btn.dataset.action === "email") {
        const item = items.find((x) => x.id === id);
        if (item) sendEmailForItem(item);
      } else if (btn.dataset.action === "archive") {
        toggleArchive(id);
      } else if (btn.dataset.action === "delete") {
        deleteItem(id);
      }
    };

    dom.list.addEventListener("click", onItemAction);
    dom.board?.addEventListener("click", onItemAction);
    dom.galleryList?.addEventListener("click", onItemAction);

    dom.close.addEventListener("click", closeModal);
    dom.btnCancel.addEventListener("click", closeModal);

    dom.modal.addEventListener("click", (e) => {
      if (e.target === dom.modal) closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!dom.modal.hidden) closeModal();
    });

    dom.form.addEventListener("submit", (e) => {
      e.preventDefault();
      upsertItemFromForm();
      closeModal();
    });

    dom.btnDelete.addEventListener("click", () => {
      const id = normStr(dom.form.elements.id?.value);
      if (!id) return;
      deleteItem(id);
      closeModal();
    });

    window.addEventListener("i18n:changed", () => {
      setModalTitle(Boolean(editingId));
      render();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire, { once: true });
  } else {
    wire();
  }
})();
