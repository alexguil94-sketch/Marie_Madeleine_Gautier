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
    { id: "canal-brumes", name: "Canal des Brumes", hint: "Eau douce, lampes basses, conversations lentes." },
    { id: "serres-oracles", name: "Serres des Oracles", hint: "Des plantes rares : ici, les décisions mûrissent sous verre." },
    { id: "quai-lanternes", name: "Quai des Lanternes", hint: "La nuit y est douce : la lumière n’écrase personne." },
    { id: "mont-patines", name: "Mont des Patines", hint: "On y apprend à faire vieillir l’or sans l’abîmer." },
    { id: "atoll-echos", name: "Atoll des Échos", hint: "Îles sonores, marées d’accords, sel sur la peau." },
    { id: "dunes-vermeil", name: "Dunes de Vermeil", hint: "Un désert rouge qui réchauffe les voix et les pactes." },
    { id: "cite-bains", name: "Cité des Bains", hint: "Sources chaudes et seuils tranquilles : on s’y répare." },
    { id: "faubourg-fibres", name: "Faubourg des Fibres", hint: "Textiles, cordes, tissages : on fabrique des liens." },
    { id: "voute-minerale", name: "Voûte Minérale", hint: "Une ville-grotte : la pierre garde la mémoire des pas." },
    { id: "horizon-argent", name: "Horizon d’Argent", hint: "Un plateau clair : le ciel y prend toute la place." },
  ];

  // Cultures / politiques (choix “preset”)
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
    {
      id: "academie_rues",
      name: "Académie des Rues",
      desc: "L’éducation est partout : on apprend en marchant, en parlant, en faisant.",
      laws: ["Enseigner est un devoir joyeux.", "Nul ne garde le savoir pour soi.", "Le diplôme, c’est le geste."],
      palette: ["transmission", "rue", "atelier"],
    },
    {
      id: "tribunal_nuances",
      name: "Tribunal des Nuances",
      desc: "On juge rarement : on répare souvent. La nuance a un protocole.",
      laws: ["On écoute avant de condamner.", "Le conflit se soigne.", "On répare ce qu’on abîme."],
      palette: ["nuance", "justice", "réparation"],
    },
    {
      id: "cosmopolis_traductions",
      name: "Cosmopolis des Traductions",
      desc: "On vit en plusieurs langues : traduire est un acte politique.",
      laws: ["Traduire avant d’interdire.", "Chaque culture est invitée.", "Aucun mot n’est supérieur."],
      palette: ["langue", "traduction", "accueil"],
    },
    {
      id: "commune_refuges",
      name: "Commune des Refuges",
      desc: "On protège l’abri : maisons ouvertes, seuils sûrs, solidarités simples.",
      laws: ["Personne ne reste seul.", "Le refuge est prioritaire.", "La peur ne gouverne pas."],
      palette: ["refuge", "solidarité", "seuil"],
    },
    {
      id: "diplomatie_jardins",
      name: "Diplomatie des Jardins",
      desc: "On négocie comme on jardine : avec patience, compost et attention.",
      laws: ["La patience est une méthode.", "On soigne les relations.", "On préfère l’accord à la victoire."],
      palette: ["patience", "accord", "jardin"],
    },
  ];

  // Économie / échanges (choix)
  const ECONOMIES = [
    {
      id: "eco_don",
      name: "Économie du Don",
      desc: "La richesse se mesure à la qualité des liens, pas aux stocks.",
      laws: ["Donner sans humilier.", "Recevoir sans dette.", "Chacun a sa place."],
      palette: ["don", "lien", "hospitalité"],
      line: "L’échange circule comme une fête : on donne, on reçoit, on transmet.",
    },
    {
      id: "eco_banque_temps",
      name: "Banque de Temps",
      desc: "Une heure de soin vaut une heure de jardin : l’unité d’échange est le temps.",
      laws: ["Le temps appartient à tous.", "Aucun métier n’est “mineur”.", "Chaque heure a la même dignité."],
      palette: ["temps", "équité", "soin"],
      line: "Ici, la monnaie est une heure : le temps devient un commun.",
    },
    {
      id: "eco_ateliers",
      name: "Troc des Ateliers",
      desc: "On échange en fabriquant : la valeur est un geste partagé.",
      laws: ["Apprendre avant d’acheter.", "Réparer avant de remplacer.", "Tout outil se prête."],
      palette: ["atelier", "outil", "apprentissage"],
      line: "On échange en se mettant à l’établi : la valeur naît du faire.",
    },
    {
      id: "eco_communs",
      name: "Commun des Outils",
      desc: "Une bibliothèque d’objets : on emprunte, on rend, on prend soin.",
      laws: ["Posséder moins, partager plus.", "Entretenir est un honneur.", "Le commun est prioritaire."],
      palette: ["commun", "soin", "sobriété"],
      line: "Les outils circulent comme des livres : rien ne dort au fond d’un placard.",
    },
    {
      id: "eco_monnaie_poetique",
      name: "Monnaie Poétique",
      desc: "On paie aussi en récits : un poème vaut une course, une chanson vaut un repas.",
      laws: ["La beauté a une valeur réelle.", "Le geste compte autant que l’objet.", "On ne monnaye pas la détresse."],
      palette: ["poésie", "récit", "joie"],
      line: "Les mots deviennent des pièces : une phrase peut ouvrir une porte.",
    },
    {
      id: "eco_frugal",
      name: "Abondance Frugale",
      desc: "Peu de choses, mais justes : on vise le nécessaire et l’élégant.",
      laws: ["Le superflu se partage.", "La simplicité libère.", "Le luxe est dans la durée."],
      palette: ["durée", "justesse", "clarté"],
      line: "Ici, l’abondance ressemble à la simplicité : juste ce qu’il faut, vraiment.",
    },
    {
      id: "eco_coop_matiere",
      name: "Coopérative des Matières",
      desc: "Bois, argile, bronze, pierre : les matières sont gérées comme un bien commun.",
      laws: ["Tracer l’origine des matières.", "Régénérer ce qu’on prélève.", "Transformer sans détruire."],
      palette: ["matière", "trace", "origine"],
      line: "On se met d’accord sur la matière : d’où elle vient, où elle revient.",
    },
    {
      id: "eco_reparation",
      name: "Réparation joyeuse",
      desc: "Chaque objet a plusieurs vies : l’atelier de réparation est un lieu central.",
      laws: ["Tout se répare, ou se transforme.", "Réparer enseigne la patience.", "La casse n’est pas une honte."],
      palette: ["réparer", "patience", "seconde-vie"],
      line: "On célèbre la réparation : recoudre, ressouder, recommencer.",
    },
    {
      id: "eco_hospitalite",
      name: "Hospitalité circulaire",
      desc: "On accueille, puis on est accueilli : le voyage est une économie du lien.",
      laws: ["Personne ne dort dehors.", "On partage la table.", "L’étranger est un voisin en devenir."],
      palette: ["accueil", "table", "route"],
      line: "L’échange commence par l’hospitalité : ouvrir une porte, offrir un siège.",
    },
    {
      id: "eco_ressources_partagees",
      name: "Ressources partagées",
      desc: "Eau, énergie, ateliers : les ressources vitales sont mutualisées.",
      laws: ["Le vital est gratuit.", "La rareté se gère ensemble.", "On évite la spéculation."],
      palette: ["vital", "partage", "équilibre"],
      line: "Le vital se partage : eau, chaleur, lumière — personne n’est exclu.",
    },
    {
      id: "eco_artisanat",
      name: "Artisanat local",
      desc: "On fabrique près de chez soi : lentement, proprement, durablement.",
      laws: ["La proximité est une vertu.", "La qualité prime sur la quantité.", "Transmettre fait partie du prix."],
      palette: ["local", "qualité", "durable"],
      line: "On fabrique près, on garde longtemps : la main remplace la hâte.",
    },
    {
      id: "eco_saisons",
      name: "Marché des Saisons",
      desc: "On suit le rythme du vivant : l’économie respecte les cycles.",
      laws: ["Ne pas forcer la saison.", "Stocker sans gaspiller.", "Le repos est productif."],
      palette: ["saison", "cycle", "repos"],
      line: "On échange au rythme des saisons : le cycle devient la règle.",
    },
  ];

  // Environnement / énergie (choix)
  const ENVIRONMENTS = [
    {
      id: "env_eau_droit",
      name: "Eau commune",
      desc: "L’eau est un droit : on la protège comme un texte sacré.",
      laws: ["L’eau n’appartient à personne.", "On restaure les rivières.", "Le bassin versant décide."],
      palette: ["eau", "source", "soin"],
      line: "L’eau est tenue en commun : chaque goutte compte, chaque rive compte.",
    },
    {
      id: "env_foret_vote",
      name: "Forêt votante",
      desc: "La forêt siège au conseil : le vivant a une voix.",
      laws: ["Un arbre vaut une promesse.", "On plante plus qu’on ne coupe.", "La forêt a un vote."],
      palette: ["forêt", "vivant", "vote"],
      line: "Le vivant siège avec nous : la forêt parle, et on l’écoute.",
    },
    {
      id: "env_solaire",
      name: "Solaire partagé",
      desc: "L’énergie appartient à tous : la lumière se met en commun.",
      laws: ["L’énergie est un service public.", "On consomme avec élégance.", "Nul ne reste dans le froid."],
      palette: ["lumière", "chaleur", "partage"],
      line: "La lumière devient énergie : on partage le soleil comme on partage le pain.",
    },
    {
      id: "env_vent",
      name: "Vents chantants",
      desc: "Éoliennes discrètes, souffle respecté : le vent est un allié.",
      laws: ["Le vent ne se capture pas, il se négocie.", "La nuit reste noire.", "Le paysage est un droit."],
      palette: ["vent", "souffle", "paysage"],
      line: "On écoute le vent : on prend juste ce qu’il donne, sans le blesser.",
    },
    {
      id: "env_terre_commune",
      name: "Terre commune",
      desc: "Le sol est un patrimoine vivant : on régénère avant de produire.",
      laws: ["Le sol se repose.", "On nourrit sans épuiser.", "Le compost est une politique."],
      palette: ["sol", "humus", "patient"],
      line: "La terre est un commun : on la régénère, on la remercie, on la garde.",
    },
    {
      id: "env_amphibie",
      name: "Ville amphibie",
      desc: "Au rythme des eaux : des quartiers qui flottent, s’adaptent et s’entraident.",
      laws: ["Construire léger.", "Le rivage est un bien commun.", "Prévenir plutôt que réparer."],
      palette: ["marée", "souplesse", "eau"],
      line: "On vit avec l’eau : la ville devient souple, et la solidarité devient un réflexe.",
    },
    {
      id: "env_zero_extraction",
      name: "Zéro extraction",
      desc: "On cesse de creuser : on transforme l’existant, on récupère, on réemploie.",
      laws: ["Ne plus ouvrir de nouvelles blessures.", "Le recyclage est une création.", "Tout déchet est une ressource."],
      palette: ["réemploi", "trace", "réparer"],
      line: "On ne creuse plus : on invente à partir de ce qui est déjà là.",
    },
    {
      id: "env_serres",
      name: "Serres hautes",
      desc: "Des jardins suspendus : la ville respire par des canopées cultivées.",
      laws: ["Planter partout.", "Cultiver l’ombre.", "La verdure est une infrastructure."],
      palette: ["jardin", "canopée", "air"],
      line: "La ville respire : des serres en hauteur, des ponts de lierre, des îlots frais.",
    },
    {
      id: "env_pollinisateurs",
      name: "Refuge des pollinisateurs",
      desc: "On protège les petites vies : abeilles, papillons, bourdons — le monde tient à eux.",
      laws: ["Zéro pesticide.", "Fleurs pour tous.", "La moindre vie compte."],
      palette: ["fleur", "abeille", "fragile"],
      line: "On protège les minuscules : le monde se reconstruit par les petites ailes.",
    },
    {
      id: "env_nuit",
      name: "Nuit intacte",
      desc: "La nuit est un bien commun : on protège l’obscurité pour laisser vivre le ciel.",
      laws: ["Éclairer sans aveugler.", "Respecter les cycles.", "Le ciel est un patrimoine."],
      palette: ["nuit", "ciel", "silence"],
      line: "On garde la nuit noire : les étoiles reviennent, le sommeil revient.",
    },
    {
      id: "env_bains",
      name: "Bains publics",
      desc: "La chaleur est partagée : des bains, des sources, des lieux pour se réparer.",
      laws: ["Prendre soin est un service public.", "La chaleur n’est pas un luxe.", "On se retrouve sans pression."],
      palette: ["bain", "chaleur", "soin"],
      line: "On se répare ensemble : des bains pour délier, des sources pour recommencer.",
    },
    {
      id: "env_mineral",
      name: "Minéral patient",
      desc: "La pierre enseigne la lenteur : on construit durable, on écoute ce qui résiste.",
      laws: ["La matière a droit au temps.", "Ne pas forcer ce qui résiste.", "La trace raconte."],
      palette: ["pierre", "lenteur", "durée"],
      line: "On écoute le minéral : la lenteur devient une méthode, la durée devient une morale.",
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
    "Lanternes",
    "Pont",
    "Source",
    "Serre",
    "Bains",
    "Horloge",
    "Corail",
    "Vent",
    "Mosaïque",
    "Voûte",
    "Patine",
    "Écho",
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
    step: "country", // country | city | culture | economy | environment | result
    country: "",
    country_code: "",
    city: "",
    culture_id: "",
    economy_id: "",
    environment_id: "",
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
    state.economy_id = "";
    state.environment_id = "";
    state.mode = "preset";
    state.custom.world_name = "";
    state.custom.motto = "";
  }

  function resetAfterCityPick() {
    state.culture_id = "";
    state.economy_id = "";
    state.environment_id = "";
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
      economy_id: state.economy_id,
      environment_id: state.environment_id,
      mode: state.mode,
      custom: state.custom,
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
      if (typeof s.economy_id === "string") out.economy_id = s.economy_id;
      if (typeof s.environment_id === "string") out.environment_id = s.environment_id;
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
    if (out.country && out.city && out.culture_id) out.step = "economy";
    if (out.country && out.city && out.culture_id && out.economy_id) out.step = "environment";
    if (out.country && out.city && out.culture_id && out.economy_id && out.environment_id) out.step = "result";

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

  function economyById(id) {
    return ECONOMIES.find((c) => c.id === id) || null;
  }

  function environmentById(id) {
    return ENVIRONMENTS.find((c) => c.id === id) || null;
  }

  function autoWorldName() {
    const country = state.country || state.country_code || "Monde";
    const city = state.city || "Utopie";
    const seed = hash32([country, city, state.culture_id, state.economy_id, state.environment_id].join("|"));
    const rng = mulberry32(seed);
    const a = ["Nacre", "Argile", "Lumière", "Ocres", "Marée", "Constance", "Sillage", "Matière"];
    const b = ["Atelier", "Jardins", "Bibliothèque", "Rives", "Constellation", "Place", "Forêt", "Port"];
    return `${city} — ${pick(rng, a)} ${pick(rng, b)}`.replace(/\s+/g, " ").trim();
  }

  function buildManifesto() {
    const c = state.mode === "custom" ? null : cultureById(state.culture_id);
    const eco = economyById(state.economy_id);
    const env = environmentById(state.environment_id);
    const sliders = state.custom.sliders || {};
    const totems = uniq(state.custom.totems || []);

    const seedStr = [
      state.country,
      state.country_code,
      state.city,
      state.culture_id,
      state.economy_id,
      state.environment_id,
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

    const baseLaws = (() => {
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

    const laws = uniq([...(baseLaws || []), ...(eco?.laws || []), ...(env?.laws || [])]);

    const pickLaws = (() => {
      const src = laws.slice();
      const out = [];
      while (src.length && out.length < 3) {
        const idx = Math.floor(rng() * src.length);
        out.push(src.splice(idx, 1)[0]);
      }
      return out;
    })();

    const palette = uniq([
      ...(c?.palette || []),
      ...(eco?.palette || []),
      ...(env?.palette || []),
      ...totems.map((t) => t.toLowerCase()),
    ]).slice(0, 10);

    const lines = [];
    lines.push(pick(rng, openers));
    lines.push(`Dans ${place}, nous voulons ${pick(rng, verbs)} ${pick(rng, nouns)} — un monde à hauteur de main.`);
    if (eco?.line) lines.push(eco.line);
    if (env?.line) lines.push(env.line);
    if (palette.length) lines.push(`Couleurs du monde : ${palette.join(" • ")}.`);
    if (state.custom.motto) lines.push(`Devise : “${state.custom.motto.trim()}”.`);
    lines.push(pick(rng, signature));

    return { place, lines, laws: pickLaws };
  }

  function resultTitle() {
    if (String(state.custom.world_name || "").trim()) return state.custom.world_name.trim();
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
      state.economy_id,
      state.environment_id,
      state.mode,
      state.custom.world_name,
      state.custom.motto,
      JSON.stringify(sliders),
      totems.join(","),
    ].join("|");
  }

  function drawSigil(canvas, opts = {}) {
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect?.() || { width: 0, height: 0 };
    const w = Math.max(1, Number(opts.width) || rect.width || 0);
    const h = Math.max(1, Number(opts.height) || rect.height || 0);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 10 || h < 10) return;

    const dpr = clamp(Number(opts.dpr) || window.devicePixelRatio || 1, 1, 2.5);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme =
      opts.theme === "light" || opts.theme === "dark"
        ? opts.theme
        : document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark";
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

  function canvasToBlob(canvas, type = "image/png", quality = 0.92) {
    return new Promise((resolve, reject) => {
      if (!canvas?.toBlob) {
        reject(new Error("canvas.toBlob unavailable"));
        return;
      }
      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("blob empty"));
              return;
            }
            resolve(blob);
          },
          type,
          quality
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const rr = clamp(Number(r) || 0, 0, Math.min(w, h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function wrapLines(ctx, text, maxWidth) {
    const out = [];
    const src = String(text || "").replace(/\s+/g, " ").trim();
    if (!src) return out;

    const words = src.split(" ");
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
      } else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
    return out;
  }

  function drawShareCard(canvas) {
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return;

    const W = 1080;
    const H = 1350;
    canvas.width = W;
    canvas.height = H;

    const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

    const gold = "rgba(197,160,89,.98)";
    const text = theme === "light" ? "rgba(15,15,15,.92)" : "rgba(255,255,255,.92)";
    const muted = theme === "light" ? "rgba(15,15,15,.66)" : "rgba(255,255,255,.70)";
    const panel = theme === "light" ? "rgba(255,255,255,.78)" : "rgba(0,0,0,.30)";
    const stroke = theme === "light" ? "rgba(0,0,0,.10)" : "rgba(197,160,89,.30)";

    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, W, H);
    if (theme === "light") {
      bg.addColorStop(0, "rgba(255,255,255,1)");
      bg.addColorStop(1, "rgba(241,236,226,1)");
    } else {
      bg.addColorStop(0, "rgba(18,18,18,1)");
      bg.addColorStop(1, "rgba(9,9,9,1)");
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow1 = ctx.createRadialGradient(W * 0.22, H * 0.14, 0, W * 0.22, H * 0.14, W * 0.85);
    glow1.addColorStop(0, theme === "light" ? "rgba(197,160,89,.20)" : "rgba(197,160,89,.24)");
    glow1.addColorStop(1, "rgba(197,160,89,0)");
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, W, H);

    const glow2 = ctx.createRadialGradient(W * 0.86, H * 0.20, 0, W * 0.86, H * 0.20, W * 0.75);
    glow2.addColorStop(0, theme === "light" ? "rgba(0,0,0,.06)" : "rgba(255,255,255,.06)");
    glow2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    const pad = 78;
    const panelX = 48;
    const panelY = 48;
    const panelW = W - 96;
    const panelH = H - 96;

    roundRectPath(ctx, panelX, panelY, panelW, panelH, 56);
    ctx.fillStyle = panel;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    const c = state.mode === "custom" ? null : cultureById(state.culture_id);
    const eco = economyById(state.economy_id);
    const env = environmentById(state.environment_id);
    const man = buildManifesto();
    const title = resultTitle();
    const subtitle = state.mode === "custom" ? "Monde créé" : c?.name || "Monde";

    let x = pad;
    let y = pad + 18;
    const maxW = W - pad * 2;

    ctx.fillStyle = gold;
    ctx.font = '800 26px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillText(subtitle.toUpperCase(), x, y);
    y += 48;

    ctx.fillStyle = text;
    let titleSize = 64;
    ctx.font = `600 ${titleSize}px Cinzel, "Playfair Display", Georgia, serif`;
    let titleLines = wrapLines(ctx, title, maxW);
    if (titleLines.length > 2) {
      titleSize = 56;
      ctx.font = `600 ${titleSize}px Cinzel, "Playfair Display", Georgia, serif`;
      titleLines = wrapLines(ctx, title, maxW);
    }
    titleLines = titleLines.slice(0, 2);
    const titleLH = Math.round(titleSize * 1.12);
    titleLines.forEach((ln) => {
      ctx.fillText(ln, x, y);
      y += titleLH;
    });
    y += 10;

    ctx.fillStyle = muted;
    ctx.font = '650 30px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillText(man.place, x, y);
    y += 40;

    const meta = `${eco?.name || "—"} • ${env?.name || "—"}`;
    ctx.font = '650 26px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    const metaLines = wrapLines(ctx, meta, maxW).slice(0, 2);
    metaLines.forEach((ln) => {
      ctx.fillText(ln, x, y);
      y += 34;
    });
    y += 10;

    const excerpt = (man.lines || []).find(Boolean) || "";
    if (excerpt) {
      ctx.fillStyle = theme === "light" ? "rgba(15,15,15,.72)" : "rgba(255,255,255,.76)";
      ctx.font = '500 28px "Playfair Display", Georgia, serif';
      const ex = wrapLines(ctx, excerpt, maxW).slice(0, 2);
      ex.forEach((ln) => {
        ctx.fillText(ln, x, y);
        y += 36;
      });
      y += 12;
    }

    const sigilW = maxW;
    const sigilH = Math.round((sigilW * 10) / 16);
    const sigilY = Math.max(y, 430);

    roundRectPath(ctx, x, sigilY, sigilW, sigilH, 42);
    ctx.fillStyle = theme === "light" ? "rgba(255,255,255,.86)" : "rgba(0,0,0,.22)";
    ctx.fill();
    ctx.strokeStyle = theme === "light" ? "rgba(0,0,0,.08)" : "rgba(255,255,255,.10)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const inset = 14;
    const sig = document.createElement("canvas");
    drawSigil(sig, { width: sigilW - inset * 2, height: sigilH - inset * 2, dpr: 1, theme });
    ctx.drawImage(sig, x + inset, sigilY + inset, sigilW - inset * 2, sigilH - inset * 2);

    y = sigilY + sigilH + 40;

    ctx.fillStyle = gold;
    ctx.font = '800 26px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillText("Trois lois", x, y);
    y += 36;

    ctx.fillStyle = text;
    ctx.font = '500 30px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    const bullet = "•";
    const bulletW = ctx.measureText(bullet + " ").width;
    const lawMaxW = maxW - bulletW;
    const lawLH = 38;

    const laws = (man.laws || []).slice(0, 3);
    laws.forEach((law) => {
      const lines = wrapLines(ctx, law, lawMaxW).slice(0, 3);
      lines.forEach((ln, idx) => {
        if (idx === 0) ctx.fillText(`${bullet} ${ln}`, x, y);
        else ctx.fillText(ln, x + bulletW, y);
        y += lawLH;
      });
      y += 10;
    });

    const footerY = H - 70;
    ctx.fillStyle = theme === "light" ? "rgba(15,15,15,.58)" : "rgba(255,255,255,.62)";
    ctx.font = '700 22px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillText("Marie-Madeleine Gautier — Monde utopique", x, footerY);
  }

  // ---------- Rendering ----------
  function mainStepIndex() {
    if (state.step === "country") return 1;
    if (state.step === "city") return 2;
    if (state.step === "culture") return 3;
    if (state.step === "economy") return 4;
    return 5;
  }

  function totalSteps() {
    return 5;
  }

  function percent() {
    return clamp(Math.round((mainStepIndex() / totalSteps()) * 100), 0, 100);
  }

  function renderHeader() {
    const idx = mainStepIndex();
    const hint =
      state.step === "country"
        ? "Choisis un pays (tous les pays sont possibles)."
        : state.step === "city"
        ? `Choisis une ville (${CITY_CHOICES.length} propositions) ou écris la tienne.`
        : state.step === "culture"
        ? `Choisis une culture/politique (${CULTURES.length}) ou passe en mode création.`
        : state.step === "economy"
        ? "Choisis comment on échange : matières, temps, don, ateliers…"
        : state.step === "environment"
        ? "Choisis un pacte avec le vivant, puis signe ton monde."
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
          <span>Étape ${idx}/${totalSteps()}</span>
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
          <div class="utopia-stephead__t">Choisis une ville (${CITY_CHOICES.length} propositions) dans ${esc(titleCountry)}.</div>
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

  function renderEconomyStep() {
    const picks = ECONOMIES.map((c) => {
      const on = state.economy_id === c.id;
      return `
        <button class="utopia-pick ${on ? "is-on" : ""}" type="button" data-pick-economy="${esc(c.id)}">
          <div class="utopia-pick__t">${esc(c.name)}</div>
          <div class="utopia-pick__d muted">${esc(c.desc)}</div>
        </button>
      `;
    }).join("");

    const selected = economyById(state.economy_id);
    const info = selected
      ? `
        <div class="utopia-info">
          <div class="kicker">Sélection</div>
          <div class="utopia-info__title">${esc(selected.name)}</div>
          <div class="muted" style="margin-top:6px">${esc(selected.desc)}</div>
          <div class="utopia-laws">
            ${(selected.laws || [])
              .slice(0, 3)
              .map((x) => `<div class="utopia-law">• ${esc(x)}</div>`)
              .join("")}
          </div>
        </div>
      `
      : `
        <div class="utopia-info">
          <div class="kicker">Sélection</div>
          <div class="utopia-info__title">Choisis une économie</div>
          <div class="muted" style="margin-top:6px">Comment circule la valeur ? Le temps ? Les outils ?</div>
        </div>
      `;

    return `
      <div class="utopia-cardblock">
        <div class="utopia-stephead">
          <div class="utopia-stephead__k">4 — Économie / échanges</div>
          <div class="utopia-stephead__t">Comment circule la valeur dans ${esc(state.city || "ta ville")} ?</div>
        </div>

        <div class="utopia-two">
          <div class="utopia-grid utopia-grid--tight">
            ${picks}
          </div>
          ${info}
        </div>

        <div class="utopia-row" style="margin-top:14px">
          <button class="btn" type="button" data-continue-economy>Continuer</button>
          <button class="btn ghost" type="button" data-random-economy>Au hasard</button>
        </div>
      </div>
    `;
  }

  function renderEnvironmentStep() {
    const picks = ENVIRONMENTS.map((c) => {
      const on = state.environment_id === c.id;
      return `
        <button class="utopia-pick ${on ? "is-on" : ""}" type="button" data-pick-environment="${esc(c.id)}">
          <div class="utopia-pick__t">${esc(c.name)}</div>
          <div class="utopia-pick__d muted">${esc(c.desc)}</div>
        </button>
      `;
    }).join("");

    const selectedEnv = environmentById(state.environment_id);
    const envInfo = selectedEnv
      ? `
        <div class="utopia-info">
          <div class="kicker">Sélection</div>
          <div class="utopia-info__title">${esc(selectedEnv.name)}</div>
          <div class="muted" style="margin-top:6px">${esc(selectedEnv.desc)}</div>
          <div class="utopia-laws">
            ${(selectedEnv.laws || [])
              .slice(0, 3)
              .map((x) => `<div class="utopia-law">• ${esc(x)}</div>`)
              .join("")}
          </div>
        </div>
      `
      : `
        <div class="utopia-info">
          <div class="kicker">Sélection</div>
          <div class="utopia-info__title">Choisis un pacte avec le vivant</div>
          <div class="muted" style="margin-top:6px">Énergie, eau, nuit, forêt… quelle écologie porte ton monde ?</div>
        </div>
      `;

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
          <div class="utopia-stephead__k">5 — Environnement / signature</div>
          <div class="utopia-stephead__t">Quel pacte lie ${esc(state.city || "ta ville")} au vivant ?</div>
        </div>

        <div class="utopia-two" style="margin-top:10px">
          <div class="utopia-grid utopia-grid--tight">
            ${picks}
          </div>
          ${envInfo}
        </div>

        <div class="hr"></div>

        <form class="utopia-form" data-step="environment">
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
            <button class="btn ghost" type="button" data-random-environment>Pacte au hasard</button>
          </div>
        </form>
      </div>
    `;
  }

  function renderResultStep() {
    const c = state.mode === "custom" ? null : cultureById(state.culture_id);
    const eco = economyById(state.economy_id);
    const env = environmentById(state.environment_id);
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
      `Économie : ${eco?.name || "—"}`,
      `Pacte : ${env?.name || "—"}`,
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
              <div class="muted small-note" style="margin-top:6px">${esc(eco?.name || "—")} • ${esc(env?.name || "—")}</div>
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

          <div class="utopia-share" style="margin-top:12px">
            <div class="kicker">Carte à partager</div>
            <div class="muted small-note" style="margin-top:6px">Une image générée à partir de tes choix.</div>
            <canvas class="utopia-sharecard" data-share-card role="img" aria-label="Carte à partager"></canvas>
            <div class="utopia-row" style="margin-top:12px">
              <button class="btn ghost" type="button" data-download-card>Carte PNG</button>
              <button class="btn ghost" type="button" data-share-card-file>Partager</button>
            </div>
          </div>

          <div class="utopia-row" style="margin-top:12px">
            <button class="btn ghost" type="button" data-edit>Modifier</button>
            <button class="btn ghost" type="button" data-change-culture>Changer de culture</button>
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
    if (state.step === "economy") return renderEconomyStep();
    if (state.step === "environment") return renderEnvironmentStep();
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
      else if (state.step === "economy") state.step = "culture";
      else if (state.step === "environment") state.step = "economy";
      else if (state.step === "result") state.step = "environment";
      saveState();
      render();
    });

    const step = state.step;

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
          state.economy_id = "";
          state.environment_id = "";
          saveState();
          render();
        });
      });

      root.querySelector("[data-pick-custom]")?.addEventListener("click", () => {
        state.mode = "custom";
        state.culture_id = "custom";
        state.economy_id = "";
        state.environment_id = "";
        if (!String(state.custom.world_name || "").trim()) state.custom.world_name = autoWorldName();
        saveState();
        render();
      });

      root.querySelector("[data-continue-culture]")?.addEventListener("click", () => {
        if (state.mode !== "custom" && !String(state.culture_id || "").trim()) {
          toast("Choisis une culture/politique (ou “Créer mon monde”).", "error");
          return;
        }
        state.step = "economy";
        saveState();
        render();
      });

      root.querySelector("[data-random-culture]")?.addEventListener("click", () => {
        // Une touche de hasard : modèle (majoritaire) ou création.
        const roll = Math.random();
        if (roll < 0.22) {
          state.mode = "custom";
          state.culture_id = "custom";
          state.economy_id = "";
          state.environment_id = "";
          if (!String(state.custom.world_name || "").trim()) state.custom.world_name = autoWorldName();
          state.step = "economy";
          saveState();
          toast("Mode création : compose ton monde.");
          render();
          return;
        }

        const pickOne = CULTURES[Math.floor(Math.random() * CULTURES.length)];
        state.mode = "preset";
        state.culture_id = pickOne?.id || "";
        state.economy_id = "";
        state.environment_id = "";
        state.step = "economy";
        saveState();
        toast(`Culture : ${pickOne?.name || "—"}`);
        render();
      });
      return;
    }

    if (step === "economy") {
      root.querySelectorAll("[data-pick-economy]")?.forEach((b) => {
        b.addEventListener("click", () => {
          const id = String(b.getAttribute("data-pick-economy") || "").trim();
          if (!id) return;
          state.economy_id = id;
          state.environment_id = "";
          saveState();
          render();
        });
      });

      root.querySelector("[data-continue-economy]")?.addEventListener("click", () => {
        if (!String(state.economy_id || "").trim()) {
          toast("Choisis une économie (ou utilise “Au hasard”).", "error");
          return;
        }
        state.step = "environment";
        saveState();
        render();
      });

      root.querySelector("[data-random-economy]")?.addEventListener("click", () => {
        const pickOne = ECONOMIES[Math.floor(Math.random() * ECONOMIES.length)];
        state.economy_id = pickOne?.id || "";
        state.environment_id = "";
        state.step = "environment";
        saveState();
        toast(`Économie : ${pickOne?.name || "—"}`);
        render();
      });
      return;
    }

    if (step === "environment") {
      root.querySelectorAll("[data-pick-environment]")?.forEach((b) => {
        b.addEventListener("click", () => {
          const id = String(b.getAttribute("data-pick-environment") || "").trim();
          if (!id) return;
          state.environment_id = id;
          saveState();
          render();
        });
      });

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

      root.querySelector("[data-random-environment]")?.addEventListener("click", () => {
        const pickOne = ENVIRONMENTS[Math.floor(Math.random() * ENVIRONMENTS.length)];
        state.environment_id = pickOne?.id || "";
        saveState();
        toast(`Pacte : ${pickOne?.name || "—"}`);
        render();
      });

      root.querySelector('form[data-step="environment"]')?.addEventListener("submit", (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);

        if (!String(state.environment_id || "").trim()) {
          toast("Choisis un pacte avec le vivant (ou “Pacte au hasard”).", "error");
          return;
        }

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

    const shareCardCanvas = root.querySelector("[data-share-card]");
    if (shareCardCanvas) drawShareCard(shareCardCanvas);

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

    root.querySelector("[data-download-card]")?.addEventListener("click", async () => {
      const canvas = root.querySelector("[data-share-card]");
      if (!canvas) {
        toast("Carte indisponible.", "error");
        return;
      }
      try {
        drawShareCard(canvas);
        const name = safeFilename(resultTitle(), "monde-utopique");
        await downloadCanvasPng(canvas, `${name}-carte.png`);
        toast("Carte PNG téléchargée.");
      } catch (e) {
        toast("Impossible de télécharger la carte.", "error");
        if (!isAbort(e)) console.warn(e);
      }
    });

    root.querySelector("[data-share-card-file]")?.addEventListener("click", async () => {
      const canvas = root.querySelector("[data-share-card]");
      if (!canvas) {
        toast("Carte indisponible.", "error");
        return;
      }

      try {
        writeHashState(state);
        const url = location.href;
        drawShareCard(canvas);

        const blob = await canvasToBlob(canvas, "image/png", 0.92);
        const filename = `${safeFilename(resultTitle(), "monde-utopique")}-carte.png`;

        let didShare = false;
        if (typeof navigator.share === "function" && typeof File === "function") {
          const file = new File([blob], filename, { type: "image/png" });
          const can =
            typeof navigator.canShare !== "function" ? true : navigator.canShare({ files: [file] });
          if (can) {
            await navigator.share({
              title: resultTitle(),
              text: "Monde utopique",
              url,
              files: [file],
            });
            didShare = true;
          }
        }

        if (didShare) {
          toast("Carte partagée.");
          return;
        }

        // Fallback: download + copy link.
        await downloadCanvasPng(canvas, filename);
        try {
          await navigator.clipboard.writeText(url);
          toast("PNG téléchargé + lien copié.");
        } catch {
          toast("PNG téléchargé.");
        }
      } catch (e) {
        toast("Partage indisponible.", "error");
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
      state.step = "environment";
      saveState();
      render();
    });

    root.querySelector("[data-change-culture]")?.addEventListener("click", () => {
      state.step = "culture";
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
        const card = root.querySelector("[data-share-card]");
        if (card) drawShareCard(card);
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
