/* news.js (ou le fichier de la page Actus)
   - Anti double init
   - Supabase news_posts + news_comments (join profiles)
   - Pseudo + avatar
   - Fallback localStorage si Supabase indispo
*/

(() => {
  "use strict";

  // ---------------------------------------------------------
  // Anti double init (Netlify / double script)
  // ---------------------------------------------------------
  if (window.__MMG_NEWS_INITED__) {
    console.warn("[MMG] news already initialized, skip.");
    return;
  }
  window.__MMG_NEWS_INITED__ = true;

  // ---------------------------------------------------------
  // Config
  // ---------------------------------------------------------
  const ROOT_ID = "newsRoot";
  const KEY_PREFIX = "mmg_news_comments_"; // fallback localStorage
  const MAX_POSTS = 12;

  // Fallback demo items (used if Supabase not available)
  const FALLBACK_ITEMS = [
    {
      id: "n1",
      date: "2026-01-28",
      title: "Actualités",
      text: "Une fois Supabase configuré, vous pourrez publier des actus et gérer les images depuis /admin.",
      media: { type: "image", src: "assets/ui/hero-bg.png", alt: "Fond accueil" },
    },
  ];

  // i18n helper
  const t = (k) => (window.__t ? window.__t(k) : k);

  // ---------------------------------------------------------
  // Utils
  // ---------------------------------------------------------
  const qs = (sel, root = document) => root.querySelector(sel);

  const safeText = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      const lang = (window.__lang?.() || "fr").toLowerCase();
      return d.toLocaleDateString(lang === "zh-hant" ? "zh-Hant" : lang, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
    } catch {
      return iso || "";
    }
  };

  // ---------------------------------------------------------
  // Supabase helpers
  // ---------------------------------------------------------
  async function getSessionUser() {
    const sb = window.mmgSupabase;
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  // localStorage fallback
  const lsKey = (postId) => `${KEY_PREFIX}${postId}`;
  const lsLoad = (postId) => {
    try {
      return JSON.parse(localStorage.getItem(lsKey(postId)) || "[]");
    } catch {
      return [];
    }
  };
  const lsSave = (postId, arr) => localStorage.setItem(lsKey(postId), JSON.stringify(arr || []));

  // ---------------------------------------------------------
  // Load posts
  // ---------------------------------------------------------
  function normalizeMedia(row) {
    const type = row.media_type || "";
    if (type === "youtube" && row.youtube_id) return { type: "youtube", id: row.youtube_id };
    if (type === "video" && row.media_url) return { type: "video", src: row.media_url, poster: row.media_poster || "" };
    if (type === "image" && row.media_url) return { type: "image", src: row.media_url, alt: row.title || "" };
    return null;
  }

  async function loadPostsSupabase() {
    const sb = window.mmgSupabase;
    if (!sb) return null;

    const { data, error } = await sb
      .from("news_posts")
      .select("id,published_at,title,body,media_type,media_url,media_poster,youtube_id,is_published")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(MAX_POSTS);

    if (error) {
      console.warn("[MMG] Supabase news error", error);
      return null;
    }

    const items = (data || []).map((x) => ({
      id: x.id,
      date: x.published_at,
      title: x.title,
      text: x.body || "",
      media: normalizeMedia(x),
    }));

    return items.length ? items : [];
  }

  // ---------------------------------------------------------
  // Load comments (approved only) + profiles (pseudo/avatar)
  // NOTE: Join profiles via FK news_comments.user_id -> profiles.id
  // ---------------------------------------------------------
  async function loadCommentsSupabase(postIds) {
    const sb = window.mmgSupabase;
    if (!sb || !postIds?.length) return {};

    const { data, error } = await sb
      .from("news_comments")
      .select("post_id,message,created_at,profiles(display_name,avatar_url)")
      .eq("approved", true)
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[MMG] Supabase comments error", error);
      return {};
    }

    const map = {};
    (data || []).forEach((c) => {
      (map[c.post_id] ||= []).push(c);
    });
    return map;
  }

  async function addCommentSupabase(postId, user, message) {
    const sb = window.mmgSupabase;
    if (!sb) return { ok: false, msg: "Supabase non configuré" };
    if (!user) return { ok: false, msg: t("home.commentLoginHint") || "Connectez-vous pour commenter." };

    const payload = {
      post_id: postId,
      user_id: user.id,
      message,
      approved: false,
    };

    const { error } = await sb.from("news_comments").insert(payload);
    if (error) {
      console.warn("[MMG] Supabase add comment error", error);
      return { ok: false, msg: t("home.commentError") || "Erreur" };
    }
    return { ok: true, msg: t("home.commentModeration") || "Merci ! Votre commentaire est en modération." };
  }

  // ---------------------------------------------------------
  // Media renderer
  // ---------------------------------------------------------
  function mediaEl(media) {
    if (!media) return null;

    if (media.type === "image") {
      const img = document.createElement("img");
      img.src = media.src;
      img.alt = media.alt || "";
      img.loading = "lazy";
      img.decoding = "async";
      img.className = "news-media";
      return img;
    }

    if (media.type === "video") {
      const v = document.createElement("video");
      v.className = "news-media";
      v.controls = true;
      v.preload = "metadata";
      if (media.poster) v.poster = media.poster;
      const src = document.createElement("source");
      src.src = media.src;
      src.type = "video/mp4";
      v.appendChild(src);
      return v;
    }

    if (media.type === "youtube") {
      const wrap = document.createElement("div");
      wrap.className = "news-yt";
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${media.id}`;
      iframe.title = "YouTube video";
      iframe.loading = "lazy";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
      return wrap;
    }

    return null;
  }

  // ---------------------------------------------------------
  // Comments UI
  // ---------------------------------------------------------
  function renderComments(root, postId, comments, mode, user) {
    // Anti double render on same container
    if (root.dataset.inited === "1") root.innerHTML = "";
    root.dataset.inited = "1";

    const head = document.createElement("div");
    head.className = "news-comments__head";

    const title = document.createElement("strong");
    title.textContent = t("home.commentsTitle") || "Commentaires";
    head.appendChild(title);

    // Signed in meta only once
    if (mode === "supabase" && user) {
      const meta = document.createElement("div");
      meta.className = "news-comments__meta";
      meta.innerHTML = `
        <span class="muted small">${t("home.commentSignedInAs") || "Connecté :"} ${user.email || ""}</span>
        <button class="pill" type="button" data-signout>${t("home.commentSignOut") || "Se déconnecter"}</button>
      `;
      head.appendChild(meta);

      meta.querySelector("[data-signout]")?.addEventListener("click", async () => {
        try {
          await window.mmgSupabase?.auth?.signOut?.();
        } catch {}
        // rerender whole page
        scheduleRender();
      });
    }

    root.appendChild(head);

    const list = document.createElement("div");
    list.className = "news-comments__list";

    const arr = comments || [];
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.className = "news-comments__empty";
      empty.textContent = t("home.noComments") || "Aucun commentaire pour le moment.";
      list.appendChild(empty);
    } else {
      arr.forEach((c) => {
        const item = document.createElement("div");
        item.className = "news-comment";

        const prof = c.profiles || {};
        const pseudo = safeText(prof.display_name) || "Utilisateur";
        const avatar = safeText(prof.avatar_url) || "";
        const when = fmtDate(c.created_at || "");
        const msg = safeText(c.message || "");

        item.innerHTML = `
          <div class="news-comment__row">
            <div class="news-comment__avatar">${avatar ? `<img src="${avatar}" alt="" />` : ""}</div>
            <div class="news-comment__content">
              <div class="news-comment__meta">${pseudo} • ${when}</div>
              <div class="news-comment__text"></div>
            </div>
          </div>
        `;
        item.querySelector(".news-comment__text").textContent = msg;
        list.appendChild(item);
      });
    }

    root.appendChild(list);

    // Auth gate: must be signed-in on supabase mode
    if (mode === "supabase" && !user) {
      const box = document.createElement("div");
      box.className = "news-comments__login";
      const back = encodeURIComponent(location.href);
      box.innerHTML = `
        <p class="muted" style="margin:0 0 10px">${t("home.commentLoginHint") || "Connectez-vous pour commenter."}</p>
        <a class="btn" href="login.html?redirect=${back}">${t("home.commentLogin") || "Se connecter"}</a>
      `;
      root.appendChild(box);
      return;
    }

    // Form
    const form = document.createElement("form");
    form.className = "news-comments__form";
    form.innerHTML = `
      <input class="input" name="msg" placeholder="${t("home.commentMessage") || "Écrire un commentaire…"}" maxlength="240" required>
      <button class="btn" type="submit">${t("home.commentSend") || "Publier"}</button>
      <div class="news-comments__hint">${
        mode === "supabase"
          ? t("home.commentModerationHint") || "Les commentaires passent en modération avant publication."
          : t("home.commentNote") || "Note : les commentaires sont enregistrés sur votre appareil (démo)."
      }</div>
    `;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const msg = safeText(fd.get("msg"));
      if (!msg) return;

      // Supabase
      if (mode === "supabase") {
        const res = await addCommentSupabase(postId, user, msg);
        form.reset();
        const hint = form.querySelector(".news-comments__hint");
        if (hint) hint.textContent = res.msg || "";
        return;
      }

      // Local fallback
      const cur = lsLoad(postId);
      cur.push({ text: msg, date: new Date().toISOString() });
      lsSave(postId, cur);
      renderComments(root, postId, lsLoad(postId), "local", null);
      form.reset();
    });

    root.appendChild(form);
  }

  // ---------------------------------------------------------
  // Main render (debounced to avoid double render)
  // ---------------------------------------------------------
  let renderScheduled = false;
  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    queueMicrotask(async () => {
      renderScheduled = false;
      await render();
    });
  }

  async function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    // Clear root each time -> prevents duplicates
    root.replaceChildren();

    const itemsSupabase = await loadPostsSupabase();
    const mode = itemsSupabase ? "supabase" : "local";
    const user = mode === "supabase" ? await getSessionUser() : null;

    const items = itemsSupabase ?? FALLBACK_ITEMS;

    const ids = items.map((x) => x.id);
    const commentsMap =
      mode === "supabase"
        ? await loadCommentsSupabase(ids)
        : Object.fromEntries(ids.map((id) => [id, lsLoad(id)]));

    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "news-card";

      const m = mediaEl(item.media);
      if (m) card.appendChild(m);

      const body = document.createElement("div");
      body.className = "news-body";

      const meta = document.createElement("div");
      meta.className = "news-meta";
      meta.textContent = fmtDate(item.date);

      const h = document.createElement("h3");
      h.className = "news-title";
      h.textContent = item.title || "";

      const p = document.createElement("p");
      p.className = "news-text";
      p.textContent = item.text || "";

      body.appendChild(meta);
      body.appendChild(h);
      body.appendChild(p);
      card.appendChild(body);

      const comments = document.createElement("div");
      comments.className = "news-comments";
      renderComments(comments, item.id, commentsMap[item.id] || [], mode, user);
      card.appendChild(comments);

      root.appendChild(card);
    });
  }

  // ---------------------------------------------------------
  // Events
  // ---------------------------------------------------------
  window.addEventListener("DOMContentLoaded", scheduleRender);
  window.addEventListener("i18n:changed", scheduleRender);

})();
