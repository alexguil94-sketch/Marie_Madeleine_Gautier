(function () {
  "use strict";

  if (window.__MMG_UTOPIA_GAME_INIT__) return;
  window.__MMG_UTOPIA_GAME_INIT__ = true;

  const ROOT_ID = "utopiaRoot";
  const STORAGE_KEY = "mmg_utopia_game_v1";
  const HASH_PREFIX = "#utopia=";

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const isAbort = (e) =>
    e?.name === "AbortError" || /signal is aborted/i.test(String(e?.message || e || ""));

  const stripDiacritics = (s) => {
    try {
      return String(s ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    } catch {
      return String(s ?? "");
    }
  };

  const norm = (s) => stripDiacritics(String(s ?? "")).toLowerCase().trim();

  const prefersReducedMotion = (() => {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  })();

  // ---------- Toasts ----------
  let toastWrap = null;

  function ensureToastWrap() {
    if (toastWrap && document.body.contains(toastWrap)) return toastWrap;
    const el = document.createElement("div");
    el.className = "utopia-toasts";
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    document.body.appendChild(el);
    toastWrap = el;
    return el;
  }

  function toast(message, kind = "info") {
    const msg = String(message || "").trim();
    if (!msg) return;

    const wrap = ensureToastWrap();
    const el = document.createElement("div");
    el.className = `utopia-toast utopia-toast--${kind}`;
    el.textContent = msg;
    wrap.appendChild(el);

    if (!prefersReducedMotion) {
      // Let layout happen so CSS transition can play.
      requestAnimationFrame(() => el.classList.add("is-on"));
    } else {
      el.classList.add("is-on");
    }

    const ttl = kind === "error" ? 4200 : 2600;
    setTimeout(() => {
      el.classList.remove("is-on");
      setTimeout(() => el.remove(), prefersReducedMotion ? 0 : 260);
    }, ttl);
  }

  const getLocale = () => {
    const v = (typeof window.__lang === "function" && window.__lang()) || document.documentElement.lang;
    return String(v || navigator.language || "fr").trim() || "fr";
  };

  // ---------- Countries ----------
  const COMMON_COUNTRY_CODES = [
    "FR",
    "BE",
    "CH",
    "CA",
    "US",
    "GB",
    "IE",
    "ES",
    "PT",
    "IT",
    "DE",
    "NL",
    "SE",
    "NO",
    "DK",
    "FI",
    "PL",
    "CZ",
    "AT",
    "GR",
    "TR",
    "MA",
    "TN",
    "DZ",
    "EG",
    "ZA",
    "NG",
    "SN",
    "CI",
    "BR",
    "AR",
    "CL",
    "MX",
    "CO",
    "PE",
    "AU",
    "NZ",
    "JP",
    "KR",
    "CN",
    "TW",
    "HK",
    "SG",
    "TH",
    "VN",
    "IN",
    "ID",
    "PH",
    "RU",
    "UA",
    "IL",
    "SA",
    "AE",
    "QA",
  ];

  let countryCache = { locale: "", items: [] };

  function getCountryItems() {
    const locale = getLocale();
    if (countryCache.locale === locale && countryCache.items.length) return countryCache.items;

    let codes = [];
    try {
      if (typeof Intl.supportedValuesOf === "function") {
        codes = Intl.supportedValuesOf("region") || [];
      }
    } catch {}

    if (!Array.isArray(codes) || !codes.length) codes = COMMON_COUNTRY_CODES.slice();

    const dn =
      typeof Intl.DisplayNames === "function"
        ? new Intl.DisplayNames([locale], { type: "region" })
        : null;

    const seen = new Set();
    const items = [];
    codes.forEach((code) => {
      const c = String(code || "").trim();
      if (!c) return;
      const name = dn ? dn.of(c) : c;
      const n = String(name || c).trim();
      const key = (c + "||" + n).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ code: c, name: n });
    });

    items.sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" }));
    countryCache = { locale, items };
    return items;
  }

  function parseCountryInput(v) {
    const raw = String(v || "").trim();
    if (!raw) return { name: "", code: "" };

    // Accept "France (FR)" style as well as plain "France".
    const m = raw.match(/^(.*)\s+\(([A-Z0-9]{2,3})\)\s*$/i);
    if (m) {
      return { name: String(m[1] || "").trim() || raw, code: String(m[2] || "").toUpperCase() };
    }

    const locale = getLocale();
    const items = getCountryItems();
    const hit = items.find((it) => it.name.localeCompare(raw, locale, { sensitivity: "base" }) === 0);
    if (hit) return { name: hit.name, code: hit.code };

    return { name: raw, code: "" };
  }

  // ---------- Game data ----------
  const CITY_CHOICES = [
    { id: "atelier-lumiere", name: "Atelier-Lumière", hint: "Une ville où l’on fabrique le calme." },
    { id: "verre-foret", name: "Verre-Forêt", hint: "Une canopée de reflets, une patience de mousse." },
    { id: "port-etoile", name: "Port-Étoile", hint: "Un quai de constellations, des départs doux." },
    { id: "rives-ocres", name: "Rives Ocres", hint: "Des pigments dans l’air, des mains dans la matière." },
    { id: "bibliotheque-vive", name: "Bibliothèque Vive", hint: "Ici, les livres respirent, les mots guérissent." },
    { id: "jardins-hauts", name: "Jardins-Hauts", hint: "Des terrasses de plantes, des ponts de lierre." },
    { id: "cendre-bleue", name: "Cendre Bleue", hint: "Une cité volcanique, bleutée de silence." },
    { id: "plaine-argile", name: "Plaine d’Argile", hint: "On y sculpte l’eau et le temps." },
    { id: "sables-chantants", name: "Sables Chantants", hint: "Un désert musical, un vent qui raconte." },
    { id: "miroirs-nord", name: "Miroirs du Nord", hint: "Des nuits longues, des lumières qui veillent." },
    { id: "azur-rituel", name: "Azur Rituel", hint: "Une mer comme un oracle, des gestes simples." },
    { id: "pierre-douce", name: "Pierre Douce", hint: "Une ville de marbre chaud, sans angle blessant." },
    { id: "cite-nacre", name: "Cité Nacre", hint: "Tout y est nacré, même les décisions." },
    { id: "delta-atelier", name: "Delta Atelier", hint: "Des canaux, des ateliers flottants, des accords." },
    { id: "clairiere-suspendue", name: "Clairière Suspendue", hint: "Une place au milieu des nuages." },
  ];

  // 15 cultures / politiques (choix “preset”)
  const CULTURES = [
    {
      id: "republique_ateliers",
      name: "République des Ateliers",
      desc: "La politique est un geste : on décide en fabriquant ensemble.",
      laws: ["Le temps est un matériau.", "Toute voix a un espace.", "Réparer vaut célébrer."],
      palette: ["faire", "réparer", "partager"],
    },
    {
      id: "federation_reves",
      name: "Fédération des Rêves",
      desc: "Les récits deviennent des ponts : on vote avec des histoires.",
      laws: ["Raconter avant de trancher.", "Accueillir l’inédit.", "Ne pas humilier."],
      palette: ["récit", "écoute", "imagination"],
    },
    {
      id: "ecologie_sacree",
      name: "Écologie sacrée",
      desc: "La nature n’est pas un décor : c’est une personne morale.",
      laws: ["Régénérer plutôt qu’extraire.", "L’eau est un droit.", "La forêt a un vote."],
      palette: ["vivant", "eau", "sol"],
    },
    {
      id: "democratie_silence",
      name: "Démocratie du Silence",
      desc: "On protège le silence comme on protège une œuvre en cours.",
      laws: ["Le calme est un service public.", "Le conflit se soigne.", "Chaque décision respire."],
      palette: ["silence", "soin", "lenteur"],
    },
    {
      id: "communes_lumiere",
      name: "Communes de la Lumière",
      desc: "Transparence douce, énergie partagée, ombres respectées.",
      laws: ["L’énergie appartient à tous.", "Nul n’éblouit volontairement.", "La clarté n’est pas la violence."],
      palette: ["lumière", "partage", "mesure"],
    },
    {
      id: "bibliotheque_civique",
      name: "Bibliothèque civique",
      desc: "Le savoir circule comme une rivière : libre, généreux, vivant.",
      laws: ["Tout apprendre, tout transmettre.", "Protéger les nuances.", "Douter est une force."],
      palette: ["savoir", "nuance", "curiosité"],
    },
    {
      id: "economie_don",
      name: "Économie du Don",
      desc: "La richesse se mesure à la qualité des liens, pas aux stocks.",
      laws: ["Donner sans humilier.", "Recevoir sans dette.", "Chacun a sa place."],
      palette: ["don", "lien", "hospitalité"],
    },
    {
      id: "matriarcat_jardins",
      name: "Matriarcat des Jardins",
      desc: "Une culture du soin : nourrir, protéger, faire grandir.",
      laws: ["La tendresse est politique.", "La terre est commune.", "La joie se planifie."],
      palette: ["jardin", "soin", "joie"],
    },
    {
      id: "technopoesie",
      name: "Technopoésie",
      desc: "La technologie est un artisanat : utile, beau, responsable.",
      laws: ["La machine sert le vivant.", "Le code se relit à voix haute.", "La beauté n’est pas optionnelle."],
      palette: ["tech", "poésie", "responsabilité"],
    },
    {
      id: "conseil_enfants",
      name: "Conseil des Enfants",
      desc: "On écoute d’abord ceux qui héritent : l’avenir siège au premier rang.",
      laws: ["Préférer le futur au prestige.", "Simplifier avant d’ajouter.", "Protéger le jeu."],
      palette: ["avenir", "jeu", "simplicité"],
    },
    {
      id: "plurivers",
      name: "Pluralisme des Mondes",
      desc: "Plusieurs cultures cohabitent sans se dissoudre : un accord polyphonique.",
      laws: ["Traduire plutôt qu’abolir.", "Célébrer les différences.", "Aucun centre unique."],
      palette: ["pluralité", "traduction", "respect"],
    },
    {
      id: "cites_marees",
      name: "Cités des Marées",
      desc: "Des villes amphibies : souples, solidaires, au rythme des eaux.",
      laws: ["Le rivage est un bien commun.", "S’entraider est normal.", "Construire léger."],
      palette: ["eau", "souplesse", "entraide"],
    },
    {
      id: "accords_matiere",
      name: "Accords de Matière",
      desc: "Une culture sculpturale : on écoute les matériaux avant de décider.",
      laws: ["La matière a droit au temps.", "Ne pas forcer ce qui résiste.", "La trace raconte."],
      palette: ["matière", "écoute", "trace"],
    },
    {
      id: "assemblee_artisans",
      name: "Assemblée des Artisans",
      desc: "Le pouvoir est tournant : chacun sert, puis retourne au geste.",
      laws: ["Le mandat est une parenthèse.", "On dirige en servant.", "L’humilité est un protocole."],
      palette: ["service", "rotation", "humilité"],
    },
    {
      id: "utopie_errante",
      name: "Utopie Errante",
      desc: "Un peuple en mouvement : on change de place pour changer de regard.",
      laws: ["Ne pas s’installer dans l’habitude.", "Voyager léger.", "Faire de la route une école."],
      palette: ["mouvement", "regard", "route"],
    },
  ];

  const TOTEMS = [
    "Atelier",
    "Jardin",
    "Forêt",
    "Mer",
    "Bibliothèque",
    "Place",
    "Constellation",
    "Musée",
    "Four",
    "Argile",
    "Marbre",
    "Pigment",
  ];

  const SLIDERS = [
    { key: "lumiere", label: "Lumière", hint: "Clarté / ombre" },
    { key: "silence", label: "Silence", hint: "Calme / tumulte" },
    { key: "matiere", label: "Matière", hint: "Dense / aérien" },
    { key: "nature", label: "Nature", hint: "Minéral / végétal" },
    { key: "rituel", label: "Rituel", hint: "Spontané / cérémoniel" },
  ];

  // ---------- State ----------
  const blankState = () => ({
    step: "country", // country | city | culture | builder | result
    country: "",
    country_code: "",
    city: "",
    culture_id: "",
    mode: "preset", // preset | custom
    custom: {
      world_name: "",
      motto: "",
      sliders: { lumiere: 70, silence: 55, matiere: 65, nature: 60, rituel: 45 },
      totems: [],
    },
  });

  function resetAfterCountryPick() {
    state.city = "";
    state.culture_id = "";
    state.mode = "preset";
    state.custom.world_name = "";
    state.custom.motto = "";
  }

  function resetAfterCityPick() {
    state.culture_id = "";
    state.mode = "preset";
    state.custom.world_name = "";
    state.custom.motto = "";
  }

  function safeJsonParse(s) {
    try {
      return JSON.parse(String(s || ""));
    } catch {
      return null;
    }
  }

  function encodeB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  function decodeB64(b64) {
    const bin = atob(String(b64 || ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function readHashState() {
    const h = String(location.hash || "");
    if (!h.startsWith(HASH_PREFIX)) return null;
    const raw = h.slice(HASH_PREFIX.length);
    if (!raw) return null;
    try {
      const json = decodeB64(decodeURIComponent(raw));
      return safeJsonParse(json);
    } catch {
      return null;
    }
  }

  function publicState(state) {
    return {
      country: state.country,
      country_code: state.country_code,
      city: state.city,
      culture_id: state.culture_id,
      mode: state.mode,
      custom: state.mode === "custom" ? state.custom : null,
    };
  }

  function loadState() {
    const fromHash = readHashState();
    const fromLS = safeJsonParse(localStorage.getItem(STORAGE_KEY));
    const s = fromHash || fromLS;
    const out = blankState();

    if (s && typeof s === "object") {
      if (typeof s.country === "string") out.country = s.country;
      if (typeof s.country_code === "string") out.country_code = s.country_code;
      if (typeof s.city === "string") out.city = s.city;
      if (typeof s.culture_id === "string") out.culture_id = s.culture_id;
      if (s.mode === "custom") out.mode = "custom";

      if (s.custom && typeof s.custom === "object") {
        if (typeof s.custom.world_name === "string") out.custom.world_name = s.custom.world_name;
        if (typeof s.custom.motto === "string") out.custom.motto = s.custom.motto;
        if (s.custom.sliders && typeof s.custom.sliders === "object") {
          SLIDERS.forEach((sl) => {
            const v = Number(s.custom.sliders[sl.key]);
            if (Number.isFinite(v)) out.custom.sliders[sl.key] = clamp(Math.round(v), 0, 100);
          });
        }
        if (Array.isArray(s.custom.totems)) {
          out.custom.totems = s.custom.totems.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6);
        }
      }
    }

    if (out.country) out.step = "city";
    if (out.country && out.city) out.step = "culture";
    if (out.country && out.city && out.culture_id) out.step = out.mode === "custom" ? "builder" : "result";
    if (out.step === "builder" && out.mode !== "custom") out.step = "result";

    return out;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(publicState(state)));
    } catch {}
  }

  function writeHashState(state) {
    try {
      const json = JSON.stringify(publicState(state));
      const b64 = encodeB64(json);
      const next = HASH_PREFIX + encodeURIComponent(b64);
      history.replaceState(null, "", next);
    } catch {}
  }

  let state = loadState();

  // ---------- RNG + manifesto ----------
  function hash32(str) {
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) {
    if (!arr?.length) return "";
    const i = Math.floor(rng() * arr.length);
    return arr[i];
  }

  function uniq(arr) {
    const out = [];
    const seen = new Set();
    (arr || []).forEach((x) => {
      const v = String(x || "").trim();
      if (!v) return;
      const k = v.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(v);
    });
    return out;
  }

  function cultureById(id) {
    return CULTURES.find((c) => c.id === id) || null;
  }

  function autoWorldName() {
    const country = state.country || state.country_code || "Monde";
    const city = state.city || "Utopie";
    const seed = hash32([country, city, state.culture_id].join("|"));
    const rng = mulberry32(seed);
    const a = ["Nacre", "Argile", "Lumière", "Ocres", "Marée", "Constance", "Sillage", "Matière"];
    const b = ["Atelier", "Jardins", "Bibliothèque", "Rives", "Constellation", "Place", "Forêt", "Port"];
    return `${city} — ${pick(rng, a)} ${pick(rng, b)}`.replace(/\s+/g, " ").trim();
  }

  function buildManifesto() {
    const c = state.mode === "custom" ? null : cultureById(state.culture_id);
    const sliders = state.custom.sliders || {};
    const totems = uniq(state.custom.totems || []);

    const seedStr = [
      state.country,
      state.country_code,
      state.city,
      state.culture_id,
      state.mode,
      state.custom.world_name,
      state.custom.motto,
      JSON.stringify(sliders),
      totems.join(","),
    ].join("|");
    const rng = mulberry32(hash32(seedStr));

    const place = `${state.city || "—"}, ${state.country || state.country_code || "—"}`.replace(/\s+,/g, ",");

    const openers = [
      "Ici, la matière a le droit au temps.",
      "Ici, l’utopie n’est pas une fuite : c’est une boussole.",
      "Ici, on construit comme on sculpte : par écoute.",
      "Ici, la beauté est une responsabilité collective.",
      "Ici, le calme est un atelier ouvert.",
      "Ici, la nuance vaut mieux que la vitesse.",
    ];

    const verbs = ["accueillir", "réparer", "relier", "cultiver", "apprendre", "prendre soin", "façonner", "apaiser"];
    const nouns = ["le silence", "la lumière", "la trace", "la terre", "les récits", "les liens", "le vivant", "la lenteur"];

    const signature = [
      "— une signature où la matière rencontre l’utopie.",
      "— un monde qui respire avant de parler.",
      "— un atelier de formes, de textes et de constellations.",
    ];

    const laws = (() => {
      if (state.mode !== "custom") return c?.laws || [];

      const lum = Number(sliders.lumiere);
      const sil = Number(sliders.silence);
      const mat = Number(sliders.matiere);
      const nat = Number(sliders.nature);
      const rit = Number(sliders.rituel);

      const out = [];
      out.push(sil >= 70 ? "Le silence est un droit, jamais une punition." : "On parle peu, mais on écoute beaucoup.");
      out.push(lum >= 70 ? "La lumière se partage : aucune zone ne reste invisible." : "Les ombres sont respectées : on n’exige pas la clarté.");
      out.push(mat >= 70 ? "Tout projet commence par toucher la matière." : "On construit léger : la trace suffit.");
      out.push(nat >= 70 ? "Le vivant siège au conseil : arbres, rivières, sols." : "Le minéral enseigne la patience : rien ne se brusque.");
      out.push(rit >= 70 ? "On protège des rituels simples pour tenir le lien." : "La spontanéité est une fête : on laisse la place à l’imprévu.");
      return out;
    })();

    const pickLaws = (() => {
      const src = laws.slice();
      const out = [];
      while (src.length && out.length < 3) {
        const idx = Math.floor(rng() * src.length);
        out.push(src.splice(idx, 1)[0]);
      }
      return out;
    })();

    const palette = uniq([...(c?.palette || []), ...totems.map((t) => t.toLowerCase())]).slice(0, 8);

    const lines = [];
    lines.push(pick(rng, openers));
    lines.push(`Dans ${place}, nous voulons ${pick(rng, verbs)} ${pick(rng, nouns)} — un monde à hauteur de main.`);
    if (palette.length) lines.push(`Couleurs du monde : ${palette.join(" • ")}.`);
    if (state.custom.motto) lines.push(`Devise : “${state.custom.motto.trim()}”.`);
    lines.push(pick(rng, signature));

    return { place, lines, laws: pickLaws };
  }

  function resultTitle() {
    if (state.mode === "custom" && String(state.custom.world_name || "").trim()) return state.custom.world_name.trim();
    const c = cultureById(state.culture_id);
    const base = c?.name || "Monde utopique";
    return `${base} — ${state.city || "Utopie"}`.replace(/\s+/g, " ").trim();
  }

  // ---------- Sigil (canvas) ----------
  function safeFilename(input, fallback = "monde-utopique") {
    const base = stripDiacritics(String(input || "").trim())
      .replace(/['"]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60);
    return base || fallback;
  }

  function sigilSeedString() {
    const sliders = state.custom.sliders || {};
    const totems = uniq(state.custom.totems || []);
    return [
      state.country,
      state.country_code,
      state.city,
      state.culture_id,
      state.mode,
      state.custom.world_name,
      state.custom.motto,
      JSON.stringify(sliders),
      totems.join(","),
    ].join("|");
  }

  function drawSigil(canvas) {
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 10 || h < 10) return;

    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    const seedStr = sigilSeedString();
    const rng = mulberry32(hash32(seedStr + "|sigil"));

    ctx.clearRect(0, 0, w, h);

    // Background wash
    const bg = ctx.createLinearGradient(0, 0, w, h);
    if (theme === "light") {
      bg.addColorStop(0, "rgba(255,255,255,.92)");
      bg.addColorStop(1, "rgba(246,242,232,.78)");
    } else {
      bg.addColorStop(0, "rgba(0,0,0,.26)");
      bg.addColorStop(1, "rgba(0,0,0,.08)");
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.26, h * 0.20, 0, w * 0.26, h * 0.20, Math.max(w, h) * 0.95);
    glow.addColorStop(0, theme === "light" ? "rgba(197,160,89,.16)" : "rgba(197,160,89,.22)");
    glow.addColorStop(1, "rgba(197,160,89,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Stars count influenced by the “palette”
    const sliders = state.custom.sliders || {};
    const lum = clamp(Number(sliders.lumiere ?? 60), 0, 100);
    const nat = clamp(Number(sliders.nature ?? 55), 0, 100);
    const sil = clamp(Number(sliders.silence ?? 55), 0, 100);
    const mat = clamp(Number(sliders.matiere ?? 65), 0, 100);
    const starCount = clamp(Math.round(18 + (lum + nat) / 12 + (100 - sil) / 30), 16, 46);

    const pad = 14;
    const pts = [];
    for (let i = 0; i < starCount; i++) {
      pts.push({
        x: pad + rng() * (w - pad * 2),
        y: pad + rng() * (h - pad * 2),
        r: 0.9 + rng() * (1.8 + mat / 120),
      });
    }

    // Connections (nearest neighbor)
    const maxD = Math.min(w, h) * 0.38;
    const edges = new Set();
    for (let i = 0; i < pts.length; i++) {
      let bestJ = -1;
      let bestD = Infinity;
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d = Math.hypot(dx, dy);
        if (d < bestD) {
          bestD = d;
          bestJ = j;
        }
      }
      if (bestJ >= 0 && bestD <= maxD) {
        const a = Math.min(i, bestJ);
        const b = Math.max(i, bestJ);
        edges.add(a + "-" + b);
      }
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = theme === "light" ? "rgba(0,0,0,.16)" : "rgba(255,255,255,.14)";
    ctx.beginPath();
    edges.forEach((key) => {
      const [aStr, bStr] = key.split("-");
      const a = Number(aStr);
      const b = Number(bStr);
      const pa = pts[a];
      const pb = pts[b];
      if (!pa || !pb) return;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    });
    ctx.stroke();

    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme === "light" ? "rgba(197,160,89,.22)" : "rgba(197,160,89,.18)";
    ctx.beginPath();
    edges.forEach((key) => {
      const [aStr, bStr] = key.split("-");
      const a = Number(aStr);
      const b = Number(bStr);
      const pa = pts[a];
      const pb = pts[b];
      if (!pa || !pb) return;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    });
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";

    // Star points
    for (const p of pts) {
      ctx.beginPath();
      ctx.fillStyle = theme === "light" ? "rgba(0,0,0,.52)" : "rgba(255,255,255,.86)";
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = theme === "light" ? "rgba(197,160,89,.55)" : "rgba(197,160,89,.62)";
      ctx.arc(p.x, p.y, Math.max(0.6, p.r * 0.55), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function downloadCanvasPng(canvas, filename) {
    return new Promise((resolve, reject) => {
      if (!canvas?.toBlob) {
        reject(new Error("canvas.toBlob unavailable"));
        return;
      }
      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("PNG blob empty"));
              return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1200);
            resolve();
          },
          "image/png",
          0.92
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  // ---------- Rendering ----------
  function mainStepIndex() {
    if (state.step === "country") return 1;
    if (state.step === "city") return 2;
    return 3;
  }

  function percent() {
    return clamp(Math.round((mainStepIndex() / 3) * 100), 0, 100);
  }

  function renderHeader() {
    const idx = mainStepIndex();
    const hint =
      state.step === "country"
        ? "Choisis un pays (tous les pays sont possibles)."
        : state.step === "city"
        ? "Choisis une ville (15 propositions) ou écris la tienne."
        : state.step === "culture"
        ? "Choisis une culture/politique (15) ou passe en mode création."
        : state.step === "builder"
        ? "Ajuste ton monde : nom, devise, intensités, totems."
        : "Voici ton monde — tu peux copier ou partager le manifeste.";

    return `
      <div class="utopia-top">
        <div class="utopia-top__left">
          <div class="kicker">Jeu imaginaire</div>
          <h2 class="utopia-h2">Cartographier une utopie</h2>
          <p class="muted" style="margin:6px 0 0">${esc(hint)}</p>
        </div>
        <div class="utopia-top__right">
          ${state.step !== "country" ? `<button class="btn ghost" type="button" data-back>← Retour</button>` : ""}
          <button class="btn ghost" type="button" data-reset>Recommencer</button>
        </div>
      </div>

      <div class="utopia-progress" role="progressbar" aria-valuenow="${percent()}" aria-valuemin="0" aria-valuemax="100">
        <div class="utopia-progress__bar" style="width:${percent()}%"></div>
        <div class="utopia-progress__meta">
          <span>Étape ${idx}/3</span>
          <span class="muted">${esc(state.country || "—")} • ${esc(state.city || "—")}</span>
        </div>
      </div>
    `;
  }

  function renderCountryStep() {
    return `
      <div class="utopia-cardblock">
        <div class="utopia-stephead">
          <div class="utopia-stephead__k">1 — Pays</div>
          <div class="utopia-stephead__t">Où naît ton monde ?</div>
        </div>

        <form class="utopia-form" data-step="country">
          <label class="utopia-label" for="utopiaCountry">Pays</label>
          <div class="utopia-countrybox">
            <input
              id="utopiaCountry"
              class="input utopia-input"
              name="country"
              placeholder="Tape quelques lettres… ou choisis dans la liste"
              value="${esc(state.country)}"
              autocomplete="off"
              required
            />
            <div class="utopia-suggest" data-country-suggest hidden>
              <div class="utopia-suggest__meta">
                <span class="muted">Tous les pays</span>
                <span class="muted" data-country-suggest-count></span>
              </div>
              <div class="utopia-suggest__list" role="listbox" aria-label="Pays"></div>
            </div>
          </div>

          <div class="utopia-row">
            <button class="btn" type="submit">Continuer</button>
            <button class="btn ghost" type="button" data-random-country>Au hasard</button>
          </div>

          <p class="muted utopia-help">
            Astuce : tu peux écrire n’importe quel pays (même inventé).
          </p>
        </form>
      </div>
    `;
  }

  function renderCityStep() {
    const titleCountry = state.country || state.country_code || "ton pays";

    const cards = CITY_CHOICES.map((c) => {
      const on = state.city === c.name;
      return `
        <button class="utopia-pick ${on ? "is-on" : ""}" type="button" data-pick-city="${esc(c.name)}">
          <div class="utopia-pick__t">${esc(c.name)}</div>
          <div class="utopia-pick__d muted">${esc(c.hint)}</div>
        </button>
      `;
    }).join("");

    return `
      <div class="utopia-cardblock">
        <div class="utopia-stephead">
          <div class="utopia-stephead__k">2 — Ville</div>
          <div class="utopia-stephead__t">Choisis une ville (15 propositions) dans ${esc(titleCountry)}.</div>
        </div>

        <div class="utopia-grid">${cards}</div>

        <form class="utopia-form" data-step="city" style="margin-top:14px">
          <div class="utopia-split">
            <div>
              <label class="utopia-label" for="utopiaCityCustom">Ou écris ta ville</label>
              <input
                id="utopiaCityCustom"
                class="input utopia-input"
                name="custom_city"
                placeholder="Ex: Combrit Sainte‑Marine, Marseille, Tokyo…"
                autocomplete="off"
              />
            </div>
            <div class="utopia-row" style="align-items:flex-end">
              <button class="btn ghost" type="button" data-use-custom-city>Utiliser</button>
              <button class="btn ghost" type="button" data-random-city>Au hasard</button>
              <button class="btn" type="submit">Continuer</button>
            </div>
          </div>
          <p class="muted utopia-help">La ville peut être réelle… ou entièrement inventée.</p>
        </form>
      </div>
    `;
  }

  function renderCultureStep() {
    const picks = CULTURES.map((c) => {
      const on = state.culture_id === c.id && state.mode === "preset";
      return `
        <button class="utopia-pick ${on ? "is-on" : ""}" type="button" data-pick-culture="${esc(c.id)}">
          <div class="utopia-pick__t">${esc(c.name)}</div>
          <div class="utopia-pick__d muted">${esc(c.desc)}</div>
        </button>
      `;
    }).join("");

    const onCustom = state.mode === "custom";
    const customCard = `
      <button class="utopia-pick utopia-pick--custom ${onCustom ? "is-on" : ""}" type="button" data-pick-custom>
        <div class="utopia-pick__t">Créer mon monde</div>
        <div class="utopia-pick__d muted">Nom, devise, intensités, totems — tu composes ta propre utopie.</div>
      </button>
    `;

    const selected = state.mode === "custom" ? null : cultureById(state.culture_id);
    const info = selected
      ? `
        <div class="utopia-info">
          <div class="kicker">Sélection</div>
          <div class="utopia-info__title">${esc(selected.name)}</div>
          <div class="muted" style="margin-top:6px">${esc(selected.desc)}</div>
          <div class="utopia-laws">
            ${selected.laws
              .slice(0, 3)
              .map((x) => `<div class="utopia-law">• ${esc(x)}</div>`)
              .join("")}
          </div>
        </div>
      `
      : `
        <div class="utopia-info">
          <div class="kicker">Sélection</div>
          <div class="utopia-info__title">${onCustom ? "Mode création" : "Choisis une culture/politique"}</div>
          <div class="muted" style="margin-top:6px">Tu peux partir d’un modèle… ou inventer ton monde.</div>
        </div>
      `;

    return `
      <div class="utopia-cardblock">
        <div class="utopia-stephead">
          <div class="utopia-stephead__k">3 — Culture / politique</div>
          <div class="utopia-stephead__t">Quelle atmosphère gouverne ${esc(state.city || "ta ville")} ?</div>
        </div>

        <div class="utopia-two">
          <div class="utopia-grid utopia-grid--tight">
            ${customCard}
            ${picks}
          </div>
          ${info}
        </div>

        <div class="utopia-row" style="margin-top:14px">
          <button class="btn" type="button" data-continue-culture>Continuer</button>
          <button class="btn ghost" type="button" data-random-culture>Au hasard</button>
        </div>
      </div>
    `;
  }

  function renderBuilderStep() {
    const worldName = state.custom.world_name || autoWorldName();
    const motto = state.custom.motto || "";

    const sliders = SLIDERS.map((sl) => {
      const v = clamp(Number(state.custom.sliders?.[sl.key] ?? 50), 0, 100);
      return `
        <div class="utopia-slider">
          <div class="utopia-slider__row">
            <div>
              <strong>${esc(sl.label)}</strong>
              <span class="muted"> — ${esc(sl.hint)}</span>
            </div>
            <span class="utopia-slider__val" data-slider-val="${esc(sl.key)}">${v}</span>
          </div>
          <input class="utopia-range" type="range" name="${esc(sl.key)}" min="0" max="100" value="${v}" />
        </div>
      `;
    }).join("");

    const chosen = new Set((state.custom.totems || []).map((x) => String(x || "").toLowerCase()));
    const chips = TOTEMS.map((t) => {
      const on = chosen.has(String(t).toLowerCase());
      return `
        <label class="utopia-chip">
          <input type="checkbox" name="totems" value="${esc(t)}" ${on ? "checked" : ""} />
          <span>${esc(t)}</span>
        </label>
      `;
    }).join("");

    return `
      <div class="utopia-cardblock">
        <div class="utopia-stephead">
          <div class="utopia-stephead__k">Création — ton monde</div>
          <div class="utopia-stephead__t">Compose une utopie “à la matière” : simple, sensible, vivante.</div>
        </div>

        <form class="utopia-form" data-step="builder">
          <div class="utopia-two">
            <div>
              <label class="utopia-label" for="utopiaWorldName">Nom du monde</label>
              <input id="utopiaWorldName" class="input utopia-input" name="world_name" value="${esc(worldName)}" maxlength="72" required />

              <label class="utopia-label" for="utopiaMotto" style="margin-top:10px">Devise (optionnel)</label>
              <input id="utopiaMotto" class="input utopia-input" name="motto" value="${esc(motto)}" maxlength="90" placeholder="Ex: “La douceur est une force.”" />

              <div class="utopia-subcard" style="margin-top:12px">
                <div class="kicker">Totems</div>
                <div class="muted" style="margin:8px 0 10px">Choisis jusqu’à 6 symboles.</div>
                <div class="utopia-chips">${chips}</div>
              </div>
            </div>

            <div>
              <div class="utopia-subcard">
                <div class="kicker">Intensités</div>
                <div class="muted" style="margin:8px 0 10px">Une palette pour guider le texte du manifeste.</div>
                ${sliders}
              </div>
            </div>
          </div>

          <div class="utopia-row" style="margin-top:14px">
            <button class="btn" type="submit">Générer le manifeste</button>
            <button class="btn ghost" type="button" data-reroll-name>Proposer un autre nom</button>
            <button class="btn ghost" type="button" data-randomize-world>Palette au hasard</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderResultStep() {
    const c = state.mode === "custom" ? null : cultureById(state.culture_id);
    const title = resultTitle();
    const subtitle = state.mode === "custom" ? "Monde créé" : c?.name || "Monde";
    const man = buildManifesto();

    const laws = (man.laws || []).map((x) => `<li>${esc(x)}</li>`).join("");
    const lines = (man.lines || []).map((x) => `<p class="utopia-manif__p">${esc(x)}</p>`).join("");

    const txt = [
      title,
      subtitle,
      "",
      `Pays : ${state.country || state.country_code || "—"}`,
      `Ville : ${state.city || "—"}`,
      state.mode === "custom" ? "Culture : (personnalisée)" : `Culture : ${c?.name || "—"}`,
      "",
      ...(man.lines || []),
      "",
      "Trois lois :",
      ...(man.laws || []).map((x) => `- ${x}`),
    ].join("\n");

    return `
      <div class="utopia-cardblock">
        <div class="utopia-poster">
          <div class="utopia-poster__head">
            <div>
              <div class="kicker">${esc(subtitle)}</div>
              <div class="utopia-poster__title">${esc(title)}</div>
              <div class="muted" style="margin-top:6px">${esc(man.place)}</div>
            </div>
            <div class="utopia-row">
              <button class="btn" type="button" data-copy>Copier</button>
              <button class="btn ghost" type="button" data-share>Lien</button>
              <button class="btn ghost" type="button" data-download-png>PNG</button>
              <button class="btn ghost" type="button" data-download>TXT</button>
            </div>
          </div>

          <div class="utopia-poster__body">
            <div class="utopia-manif">
              <div class="kicker">Manifeste</div>
              ${lines}
            </div>
            <div class="utopia-rightcol">
              <div class="utopia-sigilcard">
                <div class="kicker">Constellation</div>
                <canvas class="utopia-sigil" data-sigil role="img" aria-label="Constellation générée"></canvas>
                <div class="muted utopia-sigil__meta">Une trace générée à partir de tes choix.</div>
              </div>
              <div class="utopia-lawsbox">
                <div class="kicker">Trois lois</div>
                <ul class="utopia-lawslist">${laws}</ul>
              </div>
            </div>
          </div>

          <div class="utopia-row" style="margin-top:12px">
            <button class="btn ghost" type="button" data-edit>${state.mode === "custom" ? "Modifier" : "Changer de culture"}</button>
            <button class="btn ghost" type="button" data-reset>Rejouer</button>
          </div>
        </div>

        <textarea class="utopia-sr" aria-hidden="true" tabindex="-1" data-result-text>${esc(txt)}</textarea>
      </div>
    `;
  }

  function renderStep() {
    if (state.step === "country") return renderCountryStep();
    if (state.step === "city") return renderCityStep();
    if (state.step === "culture") return renderCultureStep();
    if (state.step === "builder") return renderBuilderStep();
    return renderResultStep();
  }

  function render() {
    root.innerHTML = `
      <div class="utopia-game">
        ${renderHeader()}
        ${renderStep()}
      </div>
    `;

    // global actions
    root.querySelector("[data-reset]")?.addEventListener("click", () => {
      state = blankState();
      saveState();
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch {}
      render();
    });

    root.querySelector("[data-back]")?.addEventListener("click", () => {
      if (state.step === "city") state.step = "country";
      else if (state.step === "culture") state.step = "city";
      else if (state.step === "builder") state.step = "culture";
      else if (state.step === "result") state.step = state.mode === "custom" ? "builder" : "culture";
      saveState();
      render();
    });

    const step = root.querySelector("[data-step]")?.getAttribute("data-step") || "";

    if (step === "country") {
      const items = getCountryItems();
      const commonSet = new Set(COMMON_COUNTRY_CODES);
      const input = root.querySelector("#utopiaCountry");
      const suggest = root.querySelector("[data-country-suggest]");
      const suggestList = suggest?.querySelector(".utopia-suggest__list");
      const suggestCount = root.querySelector("[data-country-suggest-count]");

      const renderSuggest = () => {
        if (!suggest || !suggestList) return;
        const q = input?.value || "";
        const nq = norm(q);

        let out = [];
        if (!items.length) out = [];
        else if (!nq) {
          const common = items.filter((it) => commonSet.has(it.code));
          const rest = items.filter((it) => !commonSet.has(it.code));
          out = [...common, ...rest];
        } else {
          out = items.filter((it) => norm(it.name).includes(nq) || norm(it.code).includes(nq));
        }

        if (suggestCount) suggestCount.textContent = `${out.length}/${items.length}`;

        if (!out.length) {
          suggestList.innerHTML = `<div class="utopia-suggest__empty muted">Aucun résultat — tu peux écrire ton pays librement.</div>`;
          return;
        }

        suggestList.innerHTML = out
          .map(
            (it) => `
              <button
                class="utopia-suggest__opt"
                type="button"
                role="option"
                data-country-pick="${esc(it.name)}"
                data-country-code="${esc(it.code)}"
              >
                <span>${esc(it.name)}</span>
                <span class="muted utopia-suggest__code">${esc(it.code)}</span>
              </button>
            `
          )
          .join("");
      };

      const showSuggest = () => {
        if (!suggest) return;
        suggest.hidden = false;
        renderSuggest();
      };

      const hideSuggest = () => {
        if (!suggest) return;
        suggest.hidden = true;
      };

      if (suggest && input) {
        input.addEventListener("focus", showSuggest);
        input.addEventListener("input", showSuggest);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Escape") hideSuggest();
        });
        input.addEventListener("blur", () => setTimeout(hideSuggest, 180));

        suggest.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-country-pick]");
          if (!btn) return;
          const name = String(btn.getAttribute("data-country-pick") || "").trim();
          const code = String(btn.getAttribute("data-country-code") || "").trim();
          if (!name) return;
          const changed = norm(name) !== norm(state.country);
          state.country = name;
          state.country_code = code;
          if (changed) resetAfterCountryPick();
          state.step = "city";
          saveState();
          toast(`Pays : ${name}`);
          render();
        });
      }

      root.querySelector("[data-random-country]")?.addEventListener("click", () => {
        if (!items.length) return;
        const pickOne = items[Math.floor(Math.random() * items.length)];
        const changed = norm(pickOne.name) !== norm(state.country);
        state.country = pickOne.name;
        state.country_code = pickOne.code || "";
        if (changed) resetAfterCountryPick();
        state.step = "city";
        saveState();
        toast(`Pays au hasard : ${state.country}`);
        render();
      });

      root.querySelector('form[data-step="country"]')?.addEventListener("submit", (e) => {
        e.preventDefault();
        const parsed = parseCountryInput(input?.value || "");
        if (!parsed.name) {
          toast("Choisis un pays pour continuer.", "error");
          input?.focus();
          return;
        }
        const changed = norm(parsed.name) !== norm(state.country);
        state.country = parsed.name;
        state.country_code = parsed.code || "";
        if (changed) resetAfterCountryPick();
        state.step = "city";
        saveState();
        render();
      });
      return;
    }

    if (step === "city") {
      root.querySelectorAll("[data-pick-city]")?.forEach((b) => {
        b.addEventListener("click", () => {
          const v = b.getAttribute("data-pick-city");
          const next = String(v || "").trim();
          const changed = norm(next) !== norm(state.city);
          state.city = next;
          if (changed) resetAfterCityPick();
          saveState();
          render();
        });
      });

      root.querySelector("[data-use-custom-city]")?.addEventListener("click", () => {
        const v = root.querySelector("#utopiaCityCustom")?.value || "";
        const name = String(v || "").trim();
        if (!name) {
          toast("Écris une ville, puis “Utiliser”.", "error");
          root.querySelector("#utopiaCityCustom")?.focus();
          return;
        }
        const changed = norm(name) !== norm(state.city);
        state.city = name;
        if (changed) resetAfterCityPick();
        saveState();
        render();
      });

      root.querySelector("[data-random-city]")?.addEventListener("click", () => {
        if (!CITY_CHOICES.length) return;
        const pickOne = CITY_CHOICES[Math.floor(Math.random() * CITY_CHOICES.length)];
        const changed = norm(pickOne.name) !== norm(state.city);
        state.city = pickOne.name;
        if (changed) resetAfterCityPick();
        saveState();
        toast(`Ville au hasard : ${state.city}`);
        render();
      });

      root.querySelector('form[data-step="city"]')?.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!String(state.city || "").trim()) {
          const v = root.querySelector("#utopiaCityCustom")?.value || "";
          const name = String(v || "").trim();
          if (name) state.city = name;
        }
        if (!String(state.city || "").trim()) {
          toast("Choisis une ville (ou écris-la) pour continuer.", "error");
          return;
        }
        state.step = "culture";
        saveState();
        render();
      });
      return;
    }

    if (step === "culture") {
      root.querySelectorAll("[data-pick-culture]")?.forEach((b) => {
        b.addEventListener("click", () => {
          const id = String(b.getAttribute("data-pick-culture") || "").trim();
          if (!id) return;
          state.mode = "preset";
          state.culture_id = id;
          saveState();
          render();
        });
      });

      root.querySelector("[data-pick-custom]")?.addEventListener("click", () => {
        state.mode = "custom";
        state.culture_id = "custom";
        if (!String(state.custom.world_name || "").trim()) state.custom.world_name = autoWorldName();
        saveState();
        render();
      });

      root.querySelector("[data-continue-culture]")?.addEventListener("click", () => {
        if (state.mode === "custom") {
          state.step = "builder";
          saveState();
          render();
          return;
        }
        if (!String(state.culture_id || "").trim()) {
          toast("Choisis une culture/politique (ou “Créer mon monde”).", "error");
          return;
        }
        state.step = "result";
        saveState();
        render();
      });

      root.querySelector("[data-random-culture]")?.addEventListener("click", () => {
        // Une touche de hasard : modèle (majoritaire) ou création.
        const roll = Math.random();
        if (roll < 0.22) {
          state.mode = "custom";
          state.culture_id = "custom";
          if (!String(state.custom.world_name || "").trim()) state.custom.world_name = autoWorldName();
          state.step = "builder";
          saveState();
          toast("Mode création : compose ton monde.");
          render();
          return;
        }

        const pickOne = CULTURES[Math.floor(Math.random() * CULTURES.length)];
        state.mode = "preset";
        state.culture_id = pickOne?.id || "";
        state.step = "result";
        saveState();
        toast(`Culture : ${pickOne?.name || "—"}`);
        render();
      });
      return;
    }

    if (step === "builder") {
      root.querySelectorAll(".utopia-range").forEach((range) => {
        range.addEventListener("input", () => {
          const key = range.getAttribute("name") || "";
          const v = clamp(Number(range.value), 0, 100);
          const out = root.querySelector(`[data-slider-val="${key}"]`);
          if (out) out.textContent = String(v);
        });
      });

      root.querySelector("[data-reroll-name]")?.addEventListener("click", () => {
        const current = state.custom.world_name || "";
        const next = autoWorldName();
        state.custom.world_name = next === current ? autoWorldName() : next;
        saveState();
        render();
      });

      root.querySelector("[data-randomize-world]")?.addEventListener("click", () => {
        const sliders = {};
        SLIDERS.forEach((sl) => {
          sliders[sl.key] = clamp(Math.round(18 + Math.random() * 74), 0, 100);
        });

        const shuffled = TOTEMS.slice().sort(() => Math.random() - 0.5);
        const count = clamp(3 + Math.floor(Math.random() * 4), 1, 6);

        state.custom.sliders = sliders;
        state.custom.totems = shuffled.slice(0, count);
        if (!String(state.custom.world_name || "").trim()) state.custom.world_name = autoWorldName();

        saveState();
        toast("Palette renouvelée.");
        render();
      });

      root.querySelector('form[data-step="builder"]')?.addEventListener("submit", (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);

        const world_name = String(fd.get("world_name") || "").trim().slice(0, 72);
        const motto = String(fd.get("motto") || "").trim().slice(0, 90);
        if (!world_name) {
          toast("Donne un nom à ton monde.", "error");
          return;
        }

        const sliders = {};
        SLIDERS.forEach((sl) => {
          const v = clamp(Number(fd.get(sl.key)), 0, 100);
          sliders[sl.key] = Number.isFinite(v) ? Math.round(v) : 50;
        });

        const totems = Array.from(fd.getAll("totems"))
          .map((x) => String(x || "").trim())
          .filter(Boolean)
          .slice(0, 6);

        state.custom.world_name = world_name;
        state.custom.motto = motto;
        state.custom.sliders = sliders;
        state.custom.totems = totems;

        state.step = "result";
        saveState();
        render();
      });
      return;
    }

    // result step events
    const sigilCanvas = root.querySelector("[data-sigil]");
    if (sigilCanvas) drawSigil(sigilCanvas);

    root.querySelector("[data-copy]")?.addEventListener("click", async () => {
      const t = root.querySelector("[data-result-text]")?.value || "";
      try {
        await navigator.clipboard.writeText(String(t || ""));
        toast("Manifeste copié.");
      } catch (e) {
        toast("Copie bloquée par le navigateur.", "error");
        if (!isAbort(e)) console.warn(e);
      }
    });

    root.querySelector("[data-download]")?.addEventListener("click", () => {
      const t = root.querySelector("[data-result-text]")?.value || "";
      const blob = new Blob([String(t || "")], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "monde-utopique.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1200);
      toast("TXT téléchargé.");
    });

    root.querySelector("[data-download-png]")?.addEventListener("click", async () => {
      const canvas = root.querySelector("[data-sigil]");
      if (!canvas) {
        toast("PNG indisponible.", "error");
        return;
      }
      try {
        drawSigil(canvas);
        const name = safeFilename(resultTitle());
        await downloadCanvasPng(canvas, `${name}.png`);
        toast("PNG téléchargé.");
      } catch (e) {
        toast("Impossible de télécharger le PNG.", "error");
        if (!isAbort(e)) console.warn(e);
      }
    });

    root.querySelector("[data-share]")?.addEventListener("click", async () => {
      writeHashState(state);
      const url = location.href;
      try {
        await navigator.clipboard.writeText(url);
        toast("Lien copié.");
      } catch (e) {
        toast("Copie du lien bloquée par le navigateur.", "error");
        if (!isAbort(e)) console.warn(e);
      }
    });

    root.querySelector("[data-edit]")?.addEventListener("click", () => {
      state.step = state.mode === "custom" ? "builder" : "culture";
      saveState();
      render();
    });
  }

  window.addEventListener("i18n:changed", () => {
    countryCache = { locale: "", items: [] };
    render();
  });

  // Keep the sigil crisp on resize / theme toggles.
  const requestSigilRedraw = (() => {
    let raf = 0;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const canvas = root.querySelector("[data-sigil]");
        if (canvas) drawSigil(canvas);
      });
    };
  })();

  window.addEventListener("resize", requestSigilRedraw);
  try {
    const mo = new MutationObserver(() => requestSigilRedraw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  } catch {}

  render();
})();
