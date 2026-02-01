/* admin/admin.js
   - Dashboard admin (works / news / publications / moderation)
   - Dépend de: ../js/supabase-client.js qui expose window.mmgSupabase
   - Optionnel: ./guard.js (recommandé) pour bloquer l'accès si non-admin
*/

(() => {
  const sb = window.mmgSupabase;
  const cfg = window.MMG_SUPABASE || {};
  const bucket = cfg.bucket || "media";

  // Helpers DOM
  const $ = (id) => document.getElementById(id);
  const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const loginCard = $("loginCard");
  const dash = $("dash");
  const adminUser = $("adminUser");
  const btnSignOut = $("btnSignOut");

  const loginForm = $("loginForm");
  const loginMsg = $("loginMsg");

  const workForm = $("workForm");
  const workMsg = $("workMsg");

  const newsForm = $("newsForm");
  const newsMsg = $("newsMsg");
  const mediaTypeSel = newsForm?.elements?.mediaType;
  const mediaImageWrap = $("mediaImageWrap");
  const mediaYoutubeWrap = $("mediaYoutubeWrap");

  const pubForm = $("pubForm");
  const pubMsg = $("pubMsg");
  const pubList = $("pubList");

  const moderationList = $("moderationList");
  const modMsg = $("modMsg");

  const navBtns = qa(".admin-nav__btn");

  // ---------- utils ----------
  const setMsg = (el, text) => { if (el) el.textContent = text || ""; };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));

  const notConfigured = () => {
    setMsg(loginMsg, "Supabase n’est pas configuré. Ouvre ../js/supabase-config.js et colle l’URL + anon key.");
  };

  const showAuthed = (isAuthed) => {
    if (loginCard) loginCard.hidden = !!isAuthed;
    if (dash) dash.hidden = !isAuthed;
  };

  const safeName = (fileName) =>
    String(fileName || "image")
      .normalize("NFKD")
      .replace(/[^a-z0-9._-]/gi, "-")
      .replace(/-+/g, "-")
      .slice(0, 120);

  const makeId = () =>
    (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function parseYoutubeId(input) {
    const s = String(input || "").trim();
    if (!s) return "";
    if (/^[a-zA-Z0-9_-]{8,}$/.test(s) && !s.includes("http")) return s;
    const m1 = s.match(/[?&]v=([a-zA-Z0-9_-]{8,})/);
    if (m1) return m1[1];
    const m2 = s.match(/youtu\.be\/([a-zA-Z0-9_-]{8,})/);
    if (m2) return m2[1];
    const m3 = s.match(/embed\/([a-zA-Z0-9_-]{8,})/);
    if (m3) return m3[1];
    return "";
  }

  async function uploadImages(files, folder) {
    const urls = [];
    for (const file of files) {
      const name = safeName(file.name);
      const path = `${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`;
      const { error } = await sb.storage.from(bucket).upload(path, file, {
        cacheControl: "31536000",
        upsert: false,
        contentType: file.type || undefined,
      });
      if (error) throw error;

      const { data } = sb.storage.from(bucket).getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  }

  // ---------- Navigation (sidebar views) ----------
  function setView(name) {
    const views = ["works", "news", "publications", "comments"];
    const active = views.includes(name) ? name : "works";

    navBtns.forEach((b) =>
      b.classList.toggle("is-active", b.getAttribute("data-view") === active)
    );

    views.forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.hidden = v !== active;
    });

    if (location.hash !== `#${active}`) location.hash = `#${active}`;
  }

  function initNav() {
    navBtns.forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
    });

    const fromHash = (location.hash || "").replace("#", "");
    setView(fromHash || "works");

    window.addEventListener("hashchange", () => {
      const v = (location.hash || "").replace("#", "");
      if (v) setView(v);
    });
  }

  // ---------- Dropzones ----------
  function setInputFiles(input, files) {
    const dt = new DataTransfer();
    Array.from(files || []).forEach((f) => dt.items.add(f));
    input.files = dt.files;
  }

  function removeFileAt(input, idx) {
    const cur = Array.from(input.files || []);
    cur.splice(idx, 1);
    setInputFiles(input, cur);
  }

  function bytes(n) {
    const v = Number(n || 0);
    if (v < 1024) return `${v} o`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} Ko`;
    return `${(v / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function bindDropzone({ inputId, dropId, previewId, metaId, maxFiles = 10, multiple = true }) {
    const input = document.getElementById(inputId);
    const drop = document.getElementById(dropId);
    const preview = document.getElementById(previewId);
    const meta = metaId ? document.getElementById(metaId) : null;
    if (!input || !drop) return;

    input.multiple = !!multiple;

    const render = () => {
      if (!preview) return;
      preview.innerHTML = "";

      const files = Array.from(input.files || []);
      const total = files.reduce((a, f) => a + (f.size || 0), 0);
      if (meta) meta.textContent = files.length ? `${files.length} fichier(s) • ${bytes(total)}` : "";

      files.forEach((file, idx) => {
        const url = URL.createObjectURL(file);

        const box = document.createElement("div");
        box.className = "dz-thumb";
        box.innerHTML = `<img alt="" loading="lazy" decoding="async"><button type="button" aria-label="Retirer">×</button>`;

        box.querySelector("img").src = url;
        box.querySelector("button").addEventListener("click", () => {
          URL.revokeObjectURL(url);
          removeFileAt(input, idx);
          render();
        });

        preview.appendChild(box);
      });
    };

    const acceptIncoming = (incoming) => {
      const cur = Array.from(input.files || []);
      let next = multiple ? cur.concat(incoming) : incoming.slice(0, 1);
      next = next.filter(Boolean).slice(0, maxFiles);
      setInputFiles(input, next);
      render();
    };

    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });

    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (files.length > maxFiles) setInputFiles(input, files.slice(0, maxFiles));
      render();
    });

    const over = (e) => { e.preventDefault(); drop.classList.add("is-over"); };
    const leave = () => drop.classList.remove("is-over");

    drop.addEventListener("dragover", over);
    drop.addEventListener("dragenter", over);
    drop.addEventListener("dragleave", leave);

    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      leave();
      const incoming = Array.from(e.dataTransfer?.files || []).filter((f) => (f.type || "").startsWith("image/"));
      if (!incoming.length) return;
      acceptIncoming(incoming);
    });

    render();
  }

  // ---------- Moderation ----------
  async function refreshModeration() {
    if (!moderationList) return;
    moderationList.innerHTML = "";

    const { data, error } = await sb
      .from("news_comments")
      .select("id,post_id,name,message,created_at,approved")
      .eq("approved", false)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      console.warn(error);
      setMsg(modMsg, "Impossible de charger la modération (RLS ?).");
      return;
    }

    if (!data?.length) {
      moderationList.innerHTML = `<div class="small-note">Aucun commentaire en attente.</div>`;
      return;
    }

    for (const c of data) {
      const item = document.createElement("div");
      item.className = "admin-item";
      const when = new Date(c.created_at).toLocaleString("fr-FR");

      item.innerHTML = `
        <div>
          <div class="admin-item__meta">${esc(c.name)} • ${esc(when)}</div>
          <div class="admin-item__text"></div>
        </div>
        <div class="admin-actions">
          <button class="btn" data-approve="${c.id}" type="button">Approuver</button>
          <button class="pill" data-delete="${c.id}" type="button">Supprimer</button>
        </div>
      `;

      item.querySelector(".admin-item__text").textContent = c.message;
      moderationList.appendChild(item);
    }
  }

  async function approveComment(id) {
    const { error } = await sb.from("news_comments").update({ approved: true }).eq("id", id);
    if (error) throw error;
  }

  async function deleteComment(id) {
    const { error } = await sb.from("news_comments").delete().eq("id", id);
    if (error) throw error;
  }

  // ---------- Publications ----------
  async function refreshPublications() {
    if (!pubList) return;
    pubList.innerHTML = "";

    const { data, error } = await sb
      .from("publications")
      .select("id,title,published_at,is_published,created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.warn(error);
      pubList.innerHTML = `<div class="small-note">Impossible de charger les publications (table manquante ?). Lance le SQL schema.</div>`;
      return;
    }

    if (!data?.length) {
      pubList.innerHTML = `<div class="small-note">Aucune publication pour le moment.</div>`;
      return;
    }

    data.forEach((p) => {
      const item = document.createElement("div");
      item.className = "admin-item";
      const when = p.published_at || (p.created_at ? String(p.created_at).slice(0, 10) : "");
      const badge = p.is_published ? "Publié" : "Brouillon";

      item.innerHTML = `
        <div>
          <div class="admin-item__meta">${esc(when)} • <strong>${esc(badge)}</strong></div>
          <div class="admin-item__text">${esc(p.title || "")}</div>
        </div>
        <div class="admin-actions">
          <button class="pill" type="button" data-toggle-pub="${p.id}" data-next="${p.is_published ? "0" : "1"}">
            ${p.is_published ? "Dépublier" : "Publier"}
          </button>
          <button class="pill" type="button" data-del-pub="${p.id}">Supprimer</button>
        </div>
      `;
      pubList.appendChild(item);
    });
  }

  async function togglePublication(id, next) {
    const { error } = await sb.from("publications").update({ is_published: !!next }).eq("id", id);
    if (error) throw error;
  }

  async function deletePublication(id) {
    const { error } = await sb.from("publications").delete().eq("id", id);
    if (error) throw error;
  }

  // ---------- Init ----------
  async function init() {
    if (!sb) { notConfigured(); return; }

    initNav();

    // Dropzones
    bindDropzone({ inputId: "workImages", dropId: "workDrop", previewId: "workPreview", metaId: "workDropMeta", maxFiles: 10, multiple: true });
    bindDropzone({ inputId: "pubImages", dropId: "pubDrop", previewId: "pubPreview", metaId: "pubDropMeta", maxFiles: 6, multiple: true });
    bindDropzone({ inputId: "newsImage", dropId: "newsDrop", previewId: "newsPreview", metaId: "newsDropMeta", maxFiles: 1, multiple: false });

    // Toggle media fields
    if (mediaTypeSel) {
      const update = () => {
        const v = mediaTypeSel.value;
        if (v === "youtube") {
          if (mediaImageWrap) mediaImageWrap.style.display = "none";
          if (mediaYoutubeWrap) mediaYoutubeWrap.style.display = "";
        } else {
          if (mediaImageWrap) mediaImageWrap.style.display = "";
          if (mediaYoutubeWrap) mediaYoutubeWrap.style.display = "none";
        }
      };
      mediaTypeSel.addEventListener("change", update);
      update();
    }

    // Session
    const { data } = await sb.auth.getSession();
    const session = data?.session || null;
    showAuthed(!!session);
    if (session) adminUser.textContent = session.user?.email || session.user?.id || "Admin";

    // Listen auth changes
    sb.auth.onAuthStateChange((_evt, s) => {
      showAuthed(!!s);
      if (s) adminUser.textContent = s.user?.email || s.user?.id || "Admin";
      if (s) { refreshModeration(); refreshPublications(); }
    });

    // Prime lists
    if (session) {
      await refreshModeration();
      await refreshPublications();
    }
  }

  // ---------- Auth (optionnel si tu utilises login global) ----------
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) return notConfigured();

    setMsg(loginMsg, "Connexion…");
    const fd = new FormData(loginForm);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(loginMsg, "Erreur : " + (error.message || "connexion impossible"));
      return;
    }
    setMsg(loginMsg, "");
  });

  btnSignOut?.addEventListener("click", async () => {
    try { await sb?.auth?.signOut?.(); } catch {}
  });

  // ---------- Works submit ----------
  workForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) return notConfigured();

    setMsg(workMsg, "Upload…");

    const fd = new FormData(workForm);
    const title = String(fd.get("title") || "").trim();
    const year = parseInt(String(fd.get("year") || "").trim(), 10);
    const category = String(fd.get("category") || "").trim();
    const description = String(fd.get("description") || "").trim();

    // published checkbox (si présent)
    const published = !!fd.get("published");

    const input = workForm.querySelector("#workImages");
    const files = Array.from(input?.files || []);

    try {
      if (!title) throw new Error("Titre manquant");
      if (!files.length) throw new Error("Ajoute au moins 1 image");
      if (files.length > 10) throw new Error("Max 10 images");

      // dossier stable par oeuvre
      const workId = makeId();
      const folder = `works/${workId}`;
      const urls = await uploadImages(files, folder);

      const payload = {
        id: workId, // ok si ta colonne id est uuid/text. Sinon enlève cette ligne.
        title,
        year: Number.isFinite(year) ? year : null,
        category: category || null,
        description: description || null,
        cover_url: urls[0],
        thumb_url: urls[0],
        images: urls,
        is_published: published ? true : false,
      };

      const { error } = await sb.from("works").insert(payload);
      if (error) throw error;

      setMsg(workMsg, "✅ Œuvre enregistrée.");
      workForm.reset();
      input?.dispatchEvent(new Event("change"));
    } catch (err) {
      console.warn(err);
      setMsg(workMsg, "❌ " + (err.message || "Erreur"));
    }
  });

  // ---------- News submit ----------
  newsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) return notConfigured();

    setMsg(newsMsg, "Publication…");

    const fd = new FormData(newsForm);
    const title = String(fd.get("title") || "").trim();
    const body = String(fd.get("body") || "").trim();
    const date = String(fd.get("date") || "").trim();
    const mediaType = String(fd.get("mediaType") || "image");

    try {
      if (!title) throw new Error("Titre manquant");

      let media_url = null, youtube_id = null;

      if (mediaType === "youtube") {
        youtube_id = parseYoutubeId(fd.get("youtube"));
        if (!youtube_id) throw new Error("YouTube : mets un ID ou une URL valide");
      } else {
        const input = document.getElementById("newsImage");
        const file = input?.files?.[0] || null;
        if (file) {
          const folder = `news/${new Date().toISOString().slice(0, 10)}`;
          const [url] = await uploadImages([file], folder);
          media_url = url;
        }
      }

      const payload = {
        title,
        body: body || null,
        media_type: mediaType,
        media_url,
        youtube_id,
        is_published: true,
      };
      if (date) payload.published_at = date;

      const { error } = await sb.from("news_posts").insert(payload);
      if (error) throw error;

      setMsg(newsMsg, "✅ Actu publiée.");
      newsForm.reset();
      document.getElementById("newsImage")?.dispatchEvent(new Event("change"));
      await refreshModeration();
    } catch (err) {
      console.warn(err);
      setMsg(newsMsg, "❌ " + (err.message || "Erreur"));
    }
  });

  // ---------- Publications submit ----------
  pubForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!sb) return notConfigured();

    setMsg(pubMsg, "Publication…");

    const fd = new FormData(pubForm);
    const title = String(fd.get("title") || "").trim();
    const body = String(fd.get("body") || "").trim();
    const date = String(fd.get("date") || "").trim();
    const published = !!fd.get("published");
    const input = document.getElementById("pubImages");
    const files = Array.from(input?.files || []);

    try {
      if (!title) throw new Error("Titre manquant");
      if (files.length > 6) throw new Error("Max 6 photos");

      const pubId = makeId();
      const folder = `publications/${pubId}`;
      const urls = files.length ? await uploadImages(files, folder) : [];

      const payload = {
        id: pubId,
        title,
        body: body || null,
        images: urls,
        is_published: published,
      };
      if (date) payload.published_at = date;

      const { error } = await sb.from("publications").insert(payload);
      if (error) throw error;

      setMsg(pubMsg, "✅ Publication créée.");
      pubForm.reset();
      document.getElementById("pubImages")?.dispatchEvent(new Event("change"));
      await refreshPublications();
    } catch (err) {
      console.warn(err);
      setMsg(pubMsg, "❌ " + (err.message || "Erreur"));
    }
  });

  // ---------- Click handlers (lists) ----------
  moderationList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const approveId = btn.getAttribute("data-approve");
    const deleteId = btn.getAttribute("data-delete");

    try {
      if (approveId) {
        await approveComment(approveId);
        setMsg(modMsg, "Commentaire approuvé.");
      }
      if (deleteId) {
        await deleteComment(deleteId);
        setMsg(modMsg, "Commentaire supprimé.");
      }
      await refreshModeration();
    } catch (err) {
      console.warn(err);
      setMsg(modMsg, "❌ " + (err.message || "Erreur (RLS ?)"));
    }
  });

  pubList?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const delId = btn.getAttribute("data-del-pub");
    const toggleId = btn.getAttribute("data-toggle-pub");
    const next = btn.getAttribute("data-next");

    try {
      if (toggleId) {
        await togglePublication(toggleId, next === "1");
        await refreshPublications();
      }
      if (delId) {
        if (confirm("Supprimer cette publication ?")) {
          await deletePublication(delId);
          await refreshPublications();
        }
      }
    } catch (err) {
      console.warn(err);
      setMsg(pubMsg, "❌ " + (err.message || "Erreur"));
    }
  });

  // GO
  init();
})();
