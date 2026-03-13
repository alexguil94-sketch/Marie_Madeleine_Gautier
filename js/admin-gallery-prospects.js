(() => {
  "use strict";

  if (window.__MMG_GALLERY_PROSPECTION__) return;
  window.__MMG_GALLERY_PROSPECTION__ = true;

  const TABLE = "gallery_prospects";
  const STORAGE_KEY = "mmg-gallery-prospects-v1";
  const SORT_DEFAULT = "date_desc";
  const collator = new Intl.Collator("fr-FR", { sensitivity: "base", numeric: true });

  const STATUS = {
    a_contacter: { label: "A contacter", tone: "pending" },
    contacte: { label: "Contacte", tone: "contacted" },
    relance: { label: "Relance", tone: "followup" },
    reponse: { label: "Reponse", tone: "reply" },
    refus: { label: "Refus", tone: "refused" },
    collaboration: { label: "Collaboration", tone: "collab" },
  };

  const TYPES = {
    sculpture: "Sculpture",
    contemporain: "Contemporain",
    figuratif: "Figuratif",
  };

  const FALLBACK_ITEMS = [
    {
      name: "Galerie Lelong & Co.",
      city: "Paris",
      country: "France",
      address: "13 rue de Teheran, 75008 Paris",
      email: "info@galerie-lelong.com",
      website: "https://www.galerie-lelong.com",
      type: "contemporain",
      status: "a_contacter",
      notes: "Priorite haute. Bon angle pour un dossier sculpture.",
    },
    {
      name: "Galerie Claude Bernard",
      city: "Paris",
      country: "France",
      address: "7-9 rue des Beaux-Arts, 75006 Paris",
      email: "galerie@claude-bernard.com",
      website: "https://claude-bernard.com/",
      type: "figuratif",
      status: "relance",
      contactDate: "2026-02-24",
      notes: "Relance avec portfolio PDF et serie recente.",
    },
  ];

  const state = {
    bound: false,
    source: null,
    items: [],
    leadResults: [],
    filters: {
      search: "",
      city: "",
      country: "",
      status: "",
      type: "",
      sort: SORT_DEFAULT,
    },
  };

  const refs = {};
  const $ = (id) => document.getElementById(id);
  const txt = (v) => String(v ?? "").trim();
  const today = () => new Date().toISOString().slice(0, 10);
  const uuid = () => window.crypto?.randomUUID?.() || `gp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const seedUrl = () => new URL("../data/gallery-prospects.seed.json", window.location.href).toString();
  const err = (e) => e?.message || e?.details || e?.hint || String(e || "Erreur");

  const fixUrl = (v) => {
    const s = txt(v);
    if (!s) return "";
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
  };

  const fixDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(txt(v)) ? txt(v) : "");
  const fixStatus = (v) => (STATUS[txt(v)] ? txt(v) : "a_contacter");
  const fixType = (v) => (TYPES[txt(v)] ? txt(v) : "contemporain");

  const norm = (item = {}) => ({
    id: txt(item.id) || uuid(),
    name: txt(item.name || item.gallery_name),
    city: txt(item.city),
    country: txt(item.country),
    address: txt(item.address),
    email: txt(item.email).toLowerCase(),
    website: fixUrl(item.website),
    type: fixType(item.type || item.gallery_type),
    status: fixStatus(item.status),
    contactDate: fixDate(item.contactDate || item.contact_date),
    notes: txt(item.notes),
    createdAt: txt(item.createdAt || item.created_at) || new Date().toISOString(),
    updatedAt: txt(item.updatedAt || item.updated_at) || new Date().toISOString(),
  });

  const dbRow = (item) => {
    const v = norm(item);
    return {
      id: v.id,
      name: v.name,
      city: v.city,
      country: v.country,
      address: v.address || null,
      email: v.email || null,
      website: v.website || null,
      gallery_type: v.type,
      status: v.status,
      contact_date: v.contactDate || null,
      notes: v.notes || null,
    };
  };

  const fromDb = (row) =>
    norm({
      id: row.id,
      name: row.name,
      city: row.city,
      country: row.country,
      address: row.address,
      email: row.email,
      website: row.website,
      type: row.gallery_type,
      status: row.status,
      contactDate: row.contact_date,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });

  function readStore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(norm) : [];
    } catch {
      return [];
    }
  }

  function writeStore(items) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(norm)));
  }

  async function readSeed() {
    try {
      const res = await fetch(seedUrl(), { cache: "no-store" });
      if (!res.ok) throw new Error(`seed ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) && data.length ? data.map(norm) : FALLBACK_ITEMS.map(norm);
    } catch {
      return FALLBACK_ITEMS.map(norm);
    }
  }

  async function useSupabase(sb) {
    if (!sb?.from) return null;
    try {
      const { error } = await sb.from(TABLE).select("id").limit(1);
      if (error) return null;
    } catch {
      return null;
    }

    return {
      label: "Source active: Supabase / PostgreSQL",
      async list() {
        const { data, error } = await sb
          .from(TABLE)
          .select("*")
          .order("contact_date", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false });
        if (error) throw error;
        return (data || []).map(fromDb);
      },
      async save(item, id) {
        const row = dbRow(item);
        if (id) {
          delete row.id;
          const { data, error } = await sb.from(TABLE).update(row).eq("id", id).select().single();
          if (error) throw error;
          return fromDb(data);
        }
        const { data, error } = await sb.from(TABLE).insert(row).select().single();
        if (error) throw error;
        return fromDb(data);
      },
      async import(rows) {
        if (!rows.length) return 0;
        const { error } = await sb.from(TABLE).insert(rows.map(dbRow));
        if (error) throw error;
        return rows.length;
      },
    };
  }

  async function useLocal() {
    if (!readStore().length) writeStore(await readSeed());
    return {
      label: "Mode local: stockage navigateur",
      async list() {
        return readStore();
      },
      async save(item, id) {
        const items = readStore();
        if (id) {
          const next = items.map((entry) => (entry.id === id ? norm({ ...entry, ...item, id }) : entry));
          writeStore(next);
          return next.find((entry) => entry.id === id);
        }
        const created = norm(item);
        writeStore([created].concat(items));
        return created;
      },
      async import(rows) {
        const items = readStore();
        const prepared = rows.map((row) => norm({ ...row, id: uuid() }));
        writeStore(prepared.concat(items));
        return prepared.length;
      },
    };
  }

  function collect() {
    refs.view = $("view-galleries");
    refs.banner = $("galleryModeNotice");
    refs.msg = $("galleryStatusMsg");
    refs.leadForm = $("galleryLeadSearchForm");
    refs.leadQuery = $("galleryLeadQuery");
    refs.leadType = $("galleryLeadType");
    refs.leadLimit = $("galleryLeadLimit");
    refs.leadMsg = $("galleryLeadMsg");
    refs.leadResults = $("galleryLeadResults");
    refs.form = $("galleryForm");
    refs.formTitle = $("galleryFormTitle");
    refs.formMsg = $("galleryFormMsg");
    refs.formReset = $("galleryFormReset");
    refs.search = $("gallerySearch");
    refs.sort = $("gallerySort");
    refs.city = $("galleryCityFilter");
    refs.country = $("galleryCountryFilter");
    refs.status = $("galleryStatusFilter");
    refs.type = $("galleryTypeFilter");
    refs.body = $("galleryProspectsBody");
    refs.empty = $("galleryEmptyState");
    refs.exportBtn = $("galleryExportBtn");
    refs.importInput = $("galleryImportInput");
    refs.statTotal = $("galleryStatTotal");
    refs.statContacted = $("galleryStatContacted");
    refs.statPending = $("galleryStatPending");
    refs.statCollab = $("galleryStatCollab");
  }

  function setLine(el, message, isError = false) {
    if (!el) return;
    el.textContent = message || "";
    el.style.color = isError ? "#ffb4b4" : "";
  }

  function banner(message) {
    if (!refs.banner) return;
    refs.banner.hidden = !txt(message);
    refs.banner.textContent = message || "";
  }

  function textNode(className, value) {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = value;
    return el;
  }

  function cell(label, node) {
    const td = document.createElement("td");
    td.setAttribute("data-label", label);
    td.appendChild(node);
    return td;
  }

  function action(label, kind, id, disabled = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = label;
    btn.dataset.action = kind;
    btn.dataset.id = id;
    btn.disabled = disabled;
    return btn;
  }

  function options(items, key) {
    return Array.from(new Set(items.map((item) => txt(item[key])).filter(Boolean))).sort(collator.compare);
  }

  function syncSelect(el, values, allLabel, current, labelFn = (value) => value) {
    if (!el) return;
    el.innerHTML = [`<option value="">${allLabel}</option>`]
      .concat(values.map((value) => `<option value="${value}">${labelFn(value)}</option>`))
      .join("");
    el.value = current || "";
  }

  function leadKey(item) {
    return [txt(item.name), txt(item.city), txt(item.country), txt(item.website)]
      .map((value) =>
        value
          .toLocaleLowerCase("fr-FR")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
      )
      .join("|");
  }

  function findExistingLead(item) {
    const key = leadKey(item);
    return state.items.find((entry) => leadKey(entry) === key) || null;
  }

  function renderLeadResults() {
    if (!refs.leadResults) return;

    refs.leadResults.innerHTML = "";
    refs.leadResults.hidden = !state.leadResults.length;
    if (!state.leadResults.length) return;

    state.leadResults.forEach((lead, index) => {
      const card = document.createElement("article");
      card.className = "gallery-lead";

      const existing = findExistingLead(lead);

      const head = document.createElement("div");
      head.className = "gallery-lead__head";

      const meta = document.createElement("div");
      meta.className = "gallery-lead__meta";
      meta.appendChild(textNode("gallery-cell__title", lead.name));
      meta.appendChild(textNode("gallery-cell__muted", `${lead.city || "Ville ?"} - ${lead.country || "Pays ?"}`));
      meta.appendChild(textNode(lead.address ? "gallery-cell__title" : "gallery-cell__muted", lead.address || "Adresse non disponible"));
      if (lead.email) meta.appendChild(textNode("gallery-cell__muted", lead.email));
      if (lead.website) meta.appendChild(textNode("gallery-cell__muted", lead.website));

      const tags = document.createElement("div");
      tags.className = "gallery-lead__tags";

      const typeChip = document.createElement("span");
      typeChip.className = "gallery-chip";
      typeChip.textContent = TYPES[lead.type] || lead.type;
      tags.appendChild(typeChip);

      if (existing) {
        const existingChip = document.createElement("span");
        existingChip.className = "gallery-chip gallery-chip--reply";
        existingChip.textContent = "Deja dans la base";
        tags.appendChild(existingChip);
      }

      const actions = document.createElement("div");
      actions.className = "gallery-lead__actions";

      const addBtn = action(existing ? "Ouvrir la fiche" : "Ajouter a la base", "lead-add", String(index));
      actions.appendChild(addBtn);
      if (lead.website) actions.appendChild(action("Site", "lead-site", String(index)));
      if (lead.email) actions.appendChild(action("Email", "lead-mail", String(index)));

      head.appendChild(meta);
      card.appendChild(head);
      card.appendChild(tags);
      card.appendChild(actions);

      refs.leadResults.appendChild(card);
    });
  }

  function filters() {
    const search = state.filters.search.toLocaleLowerCase("fr-FR");

    return state.items
      .filter((item) => {
        if (search) {
          const haystack = [item.name, item.city, item.country, item.address, item.email, item.notes]
            .join(" ")
            .toLocaleLowerCase("fr-FR");
          if (!haystack.includes(search)) return false;
        }
        if (state.filters.city && item.city !== state.filters.city) return false;
        if (state.filters.country && item.country !== state.filters.country) return false;
        if (state.filters.status && item.status !== state.filters.status) return false;
        if (state.filters.type && item.type !== state.filters.type) return false;
        return true;
      })
      .sort((a, b) => {
        if (state.filters.sort === "name_asc") return collator.compare(a.name, b.name);
        if (state.filters.sort === "name_desc") return collator.compare(b.name, a.name);

        const av = a.contactDate ? Date.parse(a.contactDate) : state.filters.sort === "date_asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        const bv = b.contactDate ? Date.parse(b.contactDate) : state.filters.sort === "date_asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
        return state.filters.sort === "date_asc" ? av - bv : bv - av;
      });
  }

  function renderTable(items) {
    refs.body.innerHTML = "";
    refs.empty.hidden = !!items.length;
    if (!items.length) return;

    items.forEach((item) => {
      const tr = document.createElement("tr");

      const nameBox = document.createElement("div");
      nameBox.appendChild(textNode("gallery-cell__title", item.name || "Sans nom"));
      nameBox.appendChild(textNode("gallery-cell__muted", `${item.city || "Ville ?"} - ${item.country || "Pays ?"}`));

      const mailBox = document.createElement("div");
      if (item.email) {
        const link = document.createElement("a");
        link.className = "gallery-link";
        link.href = `mailto:${item.email}`;
        link.textContent = item.email;
        mailBox.appendChild(link);
      } else {
        mailBox.appendChild(textNode("gallery-cell__muted", "Sans email"));
      }

      const siteBox = document.createElement("div");
      if (item.website) {
        const link = document.createElement("a");
        link.className = "gallery-link";
        link.href = item.website;
        link.target = "_blank";
        link.rel = "noreferrer noopener";
        link.textContent = (() => {
          try { return new URL(item.website).hostname.replace(/^www\./i, ""); } catch { return item.website; }
        })();
        siteBox.appendChild(link);
      } else {
        siteBox.appendChild(textNode("gallery-cell__muted", "Sans site"));
      }

      const typeChip = document.createElement("span");
      typeChip.className = "gallery-chip";
      typeChip.textContent = TYPES[item.type] || item.type;

      const statusChip = document.createElement("span");
      statusChip.className = `gallery-chip gallery-chip--${STATUS[item.status]?.tone || "pending"}`;
      statusChip.textContent = STATUS[item.status]?.label || item.status;

      const note = document.createElement("div");
      const noteText = txt(item.notes);
      const noteNode = textNode(noteText ? "gallery-cell__title" : "gallery-cell__muted", noteText ? (noteText.length > 110 ? `${noteText.slice(0, 109).trimEnd()}...` : noteText) : "Aucune note");
      if (noteText) noteNode.title = noteText;
      note.appendChild(noteNode);

      const actions = document.createElement("div");
      actions.className = "gallery-actions";
      actions.appendChild(action("Modifier", "edit", item.id));
      actions.appendChild(action("Copier email", "copy", item.id, !item.email));
      actions.appendChild(action("Ouvrir site", "site", item.id, !item.website));
      actions.appendChild(action("Envoyer email", "mail", item.id, !item.email));
      actions.appendChild(action("Marquer contacte", "contacted", item.id));

      tr.appendChild(cell("Nom", nameBox));
      tr.appendChild(cell("Ville", textNode("gallery-cell__title", item.city || "-")));
      tr.appendChild(cell("Pays", textNode("gallery-cell__title", item.country || "-")));
      tr.appendChild(cell("Adresse", textNode(item.address ? "gallery-cell__title" : "gallery-cell__muted", item.address || "Non renseignee")));
      tr.appendChild(cell("Email", mailBox));
      tr.appendChild(cell("Site", siteBox));
      tr.appendChild(cell("Type", typeChip));
      tr.appendChild(cell("Statut", statusChip));
      tr.appendChild(cell("Date", textNode(item.contactDate ? "gallery-cell__title" : "gallery-cell__muted", item.contactDate || "Aucune")));
      tr.appendChild(cell("Notes", note));
      tr.appendChild(cell("Actions", actions));

      refs.body.appendChild(tr);
    });
  }

  function render() {
    syncSelect(refs.city, options(state.items, "city"), "Toutes les villes", state.filters.city);
    syncSelect(refs.country, options(state.items, "country"), "Tous les pays", state.filters.country);
    syncSelect(refs.status, Object.keys(STATUS), "Tous les statuts", state.filters.status, (value) => STATUS[value].label);
    syncSelect(refs.type, Object.keys(TYPES), "Tous les types", state.filters.type, (value) => TYPES[value]);

    const total = state.items.length;
    const contacted = state.items.filter((item) => item.status !== "a_contacter").length;
    const pending = state.items.filter((item) => item.status === "a_contacter" || item.status === "relance").length;
    const collab = state.items.filter((item) => item.status === "collaboration").length;
    refs.statTotal.textContent = String(total);
    refs.statContacted.textContent = String(contacted);
    refs.statPending.textContent = String(pending);
    refs.statCollab.textContent = String(collab);

    const list = filters();
    renderTable(list);
    renderLeadResults();
    setLine(refs.msg, `${list.length} galerie(s) affichee(s) sur ${total}.`);
  }

  function resetForm() {
    refs.form.reset();
    refs.form.elements.namedItem("id").value = "";
    refs.form.elements.namedItem("status").value = "a_contacter";
    refs.formTitle.textContent = "Ajouter une galerie";
    refs.formReset.hidden = true;
    setLine(refs.formMsg, "");
  }

  function fillForm(item) {
    refs.form.elements.namedItem("id").value = item.id;
    refs.form.elements.namedItem("name").value = item.name;
    refs.form.elements.namedItem("email").value = item.email;
    refs.form.elements.namedItem("website").value = item.website;
    refs.form.elements.namedItem("address").value = item.address;
    refs.form.elements.namedItem("city").value = item.city;
    refs.form.elements.namedItem("country").value = item.country;
    refs.form.elements.namedItem("type").value = item.type;
    refs.form.elements.namedItem("status").value = item.status;
    refs.form.elements.namedItem("contactDate").value = item.contactDate;
    refs.form.elements.namedItem("notes").value = item.notes;
    refs.formTitle.textContent = `Modifier: ${item.name}`;
    refs.formReset.hidden = false;
    setLine(refs.formMsg, "");
  }

  function payload() {
    const data = new FormData(refs.form);
    const out = norm({
      id: txt(data.get("id")) || uuid(),
      name: data.get("name"),
      email: data.get("email"),
      website: data.get("website"),
      address: data.get("address"),
      city: data.get("city"),
      country: data.get("country"),
      type: data.get("type"),
      status: data.get("status"),
      contactDate: data.get("contactDate"),
      notes: data.get("notes"),
    });

    if (!out.name || !out.city || !out.country) {
      throw new Error("Nom, ville et pays sont obligatoires.");
    }
    return out;
  }

  async function refresh() {
    setLine(refs.msg, "Chargement des galeries...");
    state.items = (await state.source.list()).map(norm);
    render();
  }

  function delim(text) {
    const head = String(text || "").split(/\r?\n/, 1)[0] || "";
    return (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ";" : ",";
  }

  function parseCsv(text) {
    const sep = delim(text);
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];
      if (quoted) {
        if (ch === "\"") {
          if (next === "\"") {
            field += "\"";
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === "\"") { quoted = true; continue; }
      if (ch === sep) { row.push(field); field = ""; continue; }
      if (ch === "\n") {
        row.push(field);
        if (row.some((part) => txt(part))) rows.push(row);
        row = [];
        field = "";
        continue;
      }
      if (ch !== "\r") field += ch;
    }
    row.push(field);
    if (row.some((part) => txt(part))) rows.push(row);
    return rows;
  }

  function mapHeader(value) {
    const key = txt(value)
      .toLocaleLowerCase("fr-FR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return {
      nom: "name",
      name: "name",
      ville: "city",
      city: "city",
      pays: "country",
      country: "country",
      adresse: "address",
      address: "address",
      email: "email",
      site: "website",
      site_web: "website",
      website: "website",
      type: "type",
      type_de_galerie: "type",
      statut: "status",
      status: "status",
      date: "contactDate",
      date_de_contact: "contactDate",
      contact_date: "contactDate",
      notes: "notes",
    }[key] || "";
  }

  function rowsFromCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map(mapHeader);
    return rows.slice(1).map((cols) => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) item[header] = cols[index] || "";
      });
      return norm(item);
    }).filter((item) => item.name);
  }

  function csv() {
    const keys = ["name", "city", "country", "address", "email", "website", "type", "status", "contactDate", "notes"];
    const esc = (value) => {
      const text = String(value ?? "");
      return /[;"\n\r,]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
    };
    return `\uFEFF${[keys.join(";")].concat(state.items.map((item) => keys.map((key) => esc(item[key])).join(";"))).join("\r\n")}`;
  }

  async function searchLeads(query, type, limit) {
    const res = await fetch("/.netlify/functions/gallery-search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, type, limit }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      throw new Error(body?.detail || body?.error || `Recherche ${res.status}`);
    }

    return {
      location: txt(body.location),
      results: Array.isArray(body.results) ? body.results.map(norm) : [],
    };
  }

  async function onLeadSearch(event) {
    event.preventDefault();

    const query = txt(refs.leadQuery?.value);
    const type = txt(refs.leadType?.value);
    const limit = Number.parseInt(refs.leadLimit?.value || "20", 10) || 20;

    if (!query) {
      setLine(refs.leadMsg, "Indique une ville, une zone ou un pays.", true);
      return;
    }

    setLine(refs.leadMsg, "Recherche externe en cours...");
    state.leadResults = [];
    renderLeadResults();

    try {
      const payload = await searchLeads(query, type, limit);
      state.leadResults = payload.results;
      renderLeadResults();
      setLine(
        refs.leadMsg,
        payload.results.length
          ? `${payload.results.length} resultat(s) trouves pour ${payload.location || query}.`
          : `Aucune galerie trouvee pour ${payload.location || query}.`,
        false
      );
    } catch (e) {
      setLine(refs.leadMsg, err(e), true);
    }
  }

  async function saveLead(lead) {
    const existing = findExistingLead(lead);
    if (existing) {
      fillForm(existing);
      refs.form.scrollIntoView({ behavior: "smooth", block: "start" });
      setLine(refs.formMsg, "Cette galerie existe deja dans la base.");
      return;
    }

    await state.source.save(
      {
        ...lead,
        status: "a_contacter",
        contactDate: "",
      },
      ""
    );

    await refresh();
    setLine(refs.leadMsg, `${lead.name} ajoutee a la base.`);
  }

  async function onLeadRow(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;

    const index = Number.parseInt(btn.dataset.id || "-1", 10);
    const lead = state.leadResults[index];
    if (!lead) return;

    try {
      if (btn.dataset.action === "lead-add") {
        await saveLead(lead);
        return;
      }
      if (btn.dataset.action === "lead-site") {
        window.open(lead.website, "_blank", "noopener,noreferrer");
        return;
      }
      if (btn.dataset.action === "lead-mail") {
        window.location.href = `mailto:${lead.email}`;
      }
    } catch (e) {
      setLine(refs.leadMsg, err(e), true);
    }
  }

  async function copy(value) {
    if (!txt(value)) throw new Error("Aucun email disponible.");
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }

  async function onSave(event) {
    event.preventDefault();
    const submit = refs.form.querySelector('button[type="submit"]');
    submit.disabled = true;
    setLine(refs.formMsg, "Enregistrement...");

    try {
      const data = payload();
      const id = txt(refs.form.elements.namedItem("id").value);
      await state.source.save(data, id || "");
      resetForm();
      await refresh();
    } catch (e) {
      setLine(refs.formMsg, err(e), true);
    } finally {
      submit.disabled = false;
    }
  }

  async function onRow(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;

    const item = state.items.find((entry) => entry.id === btn.dataset.id);
    if (!item) return;

    try {
      if (btn.dataset.action === "edit") {
        fillForm(item);
        refs.form.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (btn.dataset.action === "copy") {
        await copy(item.email);
        setLine(refs.msg, `Email copie: ${item.email}`);
        return;
      }
      if (btn.dataset.action === "site") {
        window.open(item.website, "_blank", "noopener,noreferrer");
        setLine(refs.msg, `Site ouvert: ${item.website}`);
        return;
      }
      if (btn.dataset.action === "mail") {
        window.location.href = `mailto:${item.email}`;
        setLine(refs.msg, `Ouverture du mail vers ${item.email}`);
        return;
      }
      if (btn.dataset.action === "contacted") {
        await state.source.save({ ...item, status: "contacte", contactDate: today() }, item.id);
        await refresh();
        setLine(refs.msg, `${item.name} marquee comme contactee.`);
      }
    } catch (e) {
      setLine(refs.msg, err(e), true);
    }
  }

  function onExport() {
    const blob = new Blob([csv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prospection-galeries-${today()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setLine(refs.msg, `Export CSV genere pour ${state.items.length} galeries.`);
  }

  async function onImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = rowsFromCsv(await file.text());
      if (!rows.length) throw new Error("Le CSV est vide ou les colonnes sont invalides.");
      const count = await state.source.import(rows);
      await refresh();
      setLine(refs.msg, `${count} galerie(s) importee(s).`);
    } catch (e) {
      setLine(refs.msg, err(e), true);
    } finally {
      event.target.value = "";
    }
  }

  function bind() {
    if (state.bound) return;
    refs.search.addEventListener("input", (event) => { state.filters.search = txt(event.target.value); render(); });
    refs.sort.addEventListener("change", (event) => { state.filters.sort = txt(event.target.value) || SORT_DEFAULT; render(); });
    refs.city.addEventListener("change", (event) => { state.filters.city = txt(event.target.value); render(); });
    refs.country.addEventListener("change", (event) => { state.filters.country = txt(event.target.value); render(); });
    refs.status.addEventListener("change", (event) => { state.filters.status = txt(event.target.value); render(); });
    refs.type.addEventListener("change", (event) => { state.filters.type = txt(event.target.value); render(); });
    refs.leadForm.addEventListener("submit", onLeadSearch);
    refs.leadResults.addEventListener("click", onLeadRow);
    refs.form.addEventListener("submit", onSave);
    refs.formReset.addEventListener("click", resetForm);
    refs.body.addEventListener("click", onRow);
    refs.exportBtn.addEventListener("click", onExport);
    refs.importInput.addEventListener("change", onImport);
    window.addEventListener("mmg:admin-logout", () => {
      state.items = [];
      state.leadResults = [];
      refs.body.innerHTML = "";
      refs.empty.hidden = true;
      setLine(refs.msg, "");
      setLine(refs.leadMsg, "");
      setLine(refs.formMsg, "");
      if (refs.leadResults) {
        refs.leadResults.innerHTML = "";
        refs.leadResults.hidden = true;
      }
    });
    state.bound = true;
  }

  async function boot(detail = {}) {
    collect();
    if (!refs.view) return;
    bind();

    try {
      const source = (await useSupabase(detail.sb || window.mmgSupabase || null)) || (await useLocal());
      state.source = source;
      state.leadResults = [];
      banner(source.label === "Mode local: stockage navigateur"
        ? "Mode local actif. Les donnees sont stockees dans ce navigateur tant que la table Supabase n'est pas disponible."
        : source.label);
      if (refs.leadResults) {
        refs.leadResults.innerHTML = "";
        refs.leadResults.hidden = true;
      }
      setLine(refs.leadMsg, "");
      resetForm();
      await refresh();
    } catch (e) {
      banner("Impossible de charger la prospection galeries.");
      setLine(refs.msg, err(e), true);
    }
  }

  window.addEventListener("mmg:admin-ready", (event) => {
    boot(event.detail || {}).catch((e) => setLine(refs.msg, err(e), true));
  });

  window.addEventListener("DOMContentLoaded", () => {
    const dash = $("dash");
    if (!dash?.hidden) {
      boot({ sb: window.mmgSupabase || null }).catch((e) => setLine(refs.msg, err(e), true));
    }
  });
})();
