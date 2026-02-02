// js/news.js
// MMG News + Comments (Supabase)
// - Loads published posts
// - Loads approved comments
// - Inserts comment (pending moderation)
// NOTE: No PostgREST join to profiles (avoids schema-cache FK issues)

(() => {
  "use strict";

  if (window.__MMG_NEWS_INIT__) return;
  window.__MMG_NEWS_INIT__ = true;

  const ROOT_ID = "newsRoot";
  const POSTS_LIMIT = 12;

  const qs = (s, r = document) => r.querySelector(s);

  const t = (k) => (window.__t ? window.__t(k) : k);

  function safeText(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      const lang = (window.__lang && window.__lang()) || "fr";
      return d.toLocaleDateString(lang, { year: "numeric", month: "short", day: "2-digit" });
    } catch {
      return iso || "";
    }
  }

  function getSB() {
    return window.mmgSupabase || window.mmg_supabase || null;
  }

  async function getUser() {
    const sb = getSB();
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  // -----------------------
  // Load posts
  // -----------------------
  async function loadPostsSupabase() {
    const sb = getSB();
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from("news_posts")
        .select("id,published_at,title,body,media_type,media_url,media_poster,youtube_id")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(POSTS_LIMIT);

      if (error) {
        console.warn("[MMG] Supabase posts error", error);
        return null;
      }

      return (data || []).map((x) => ({
        id: x.id,
        date: x.published_at,
        title: x.title,
        text: x.body || "",
        media: normalizeMedia(x),
      }));
    } catch (e) {
      console.warn("[MMG] Supabase posts exception", e);
      return null;
    }
  }

  function normalizeMedia(row) {
    const type = row.media_type || "";
    if (type === "youtube" && row.youtube_id) return { type: "youtube", id: row.youtube_id };
    if (type === "video" && row.media_url) return { type: "video", src: row.media_url, poster: row.media_poster || "" };
    if (type === "image" && row.media_url) return { type: "image", src: row.media_url, alt: row.title || "" };
    return null;
  }

  // -----------------------
  // Load comments (approved) - NO JOIN
  // -----------------------
  async function loadCommentsSupabase(postIds) {
    const sb = getSB();
    if (!sb || !postIds?.length) return {};

    try {
      const { data, error } = await sb
        .from("news_comments")
        .select("post_id,user_id,message,created_at")
        .eq("approved", true)
        .in("post_id", postIds)
        .order("created_at", { ascending: true });

      if (error) {
        console.warn("[MMG] Supabase comments error", error);
        return {};
      }

      const rows = data || [];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));

      // Load profiles for these users (if table/RLS allows select)
      let profilesMap = {};
      if (userIds.length) {
        const { data: profs, error: pErr } = await sb
          .from("profiles")
          .select("id,display_name,avatar_url")
          .in("id", userIds);

        if (!pErr && Array.isArray(profs)) {
          profilesMap = Object.fromEntries(profs.map((p) => [p.id, p]));
        }
      }

      const map = {};
      for (const c of rows) {
        const prof = profilesMap[c.user_id] || null;
        (map[c.post_id] ||= []).push({
          user_id: c.user_id,
          name: prof?.display_name || "Utilisateur",
          avatar_url: prof?.avatar_url || "",
          message: c.message,
          created_at: c.created_at,
        });
      }
      return map;
    } catch (e) {
      console.warn("[MMG] Supabase comments exception", e);
      return {};
    }
  }

  // -----------------------
  // Add comment (pending)
  // -----------------------
  async function addCommentSupabase(postId, user, message) {
    const sb = getSB();
    if (!sb) return { ok: false, msg: "Supabase non configuré" };
    if (!user) return { ok: false, msg: t("home.commentLoginHint") || "Connectez-vous pour commenter." };

    const payload = {
      post_id: postId,
      user_id: user.id,
      message: safeText(message),
      approved: false,
    };

    try {
      const { error } = await sb.from("news_comments").insert(payload);
      if (error) {
        console.warn("[MMG] Supabase add comment error", error);
        // message utile
        return { ok: false, msg: error.message || "Erreur ajout commentaire" };
      }
      return { ok: true, msg: t("home.commentModeration") || "Merci ! Votre commentaire est en modération." };
    } catch (e) {
      console.warn("[MMG] Supabase add comment exception", e);
      return { ok: false, msg: e?.message || "Erreur ajout commentaire" };
    }
  }

  // -----------------------
  // UI helpers
  // -----------------------
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

  function renderComments(container, postId, comments, user) {
    container.innerHTML = "";

    const head = document.createElement("div");
    head.className = "news-comments__head";

    const title = document.createElement("strong");
    title.textContent = t("home.commentsTitle") || "Commentaires";
    head.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "news-comments__meta";

    if (user) {
      meta.innerHTML = `
        <span class="muted small">${t("home.commentSignedInAs") || "Connecté :"} ${user.email || ""}</span>
        <a class="pill" href="login.html?redirect=${encodeURIComponent(location.pathname)}">Compte</a>
      `;
    } else {
      meta.innerHTML = `<a class="pill" href="login.html?redirect=${encodeURIComponent(location.pathname)}">Se connecter</a>`;
    }

    head.appendChild(meta);
    container.appendChild(head);

    const list = document.createElement("div");
    list.className = "news-comments__list";

    if (!comments?.length) {
      const empty = document.createElement("div");
      empty.className = "news-comments__empty";
      empty.textContent = t("home.noComments") || "Aucun commentaire pour le moment.";
      list.appendChild(empty);
    } else {
      for (const c of comments) {
        const item = document.createElement("div");
        item.className = "news-comment";

        // avatar + content
        item.innerHTML = `
          <div class="news-comment__row">
            <div class="news-comment__avatar">${c.avatar_url ? `<img src="${c.avatar_url}" alt="">` : ""}</div>
            <div class="news-comment__content">
              <div class="news-comment__meta">${safeText(c.name)} • ${fmtDate(c.created_at)}</div>
              <div class="news-comment__text"></div>
            </div>
          </div>
        `;

        item.querySelector(".news-comment__text").textContent = safeText(c.message);
        list.appendChild(item);
      }
    }

    container.appendChild(list);

    // Form (only if logged)
    if (!user) {
      const box = document.createElement("div");
      box.className = "news-comments__login";
      box.innerHTML = `
        <p class="muted" style="margin:10px 0 0">${t("home.commentLoginHint") || "Connectez-vous pour commenter."}</p>
      `;
      container.appendChild(box);
      return;
    }

    const form = document.createElement("form");
    form.className = "news-comments__form";
    form.innerHTML = `
      <input class="input" name="msg" placeholder="${t("home.commentMessage") || "Écrire un commentaire…"}" maxlength="240" required>
      <button class="btn" type="submit">${t("home.commentSend") || "Publier"}</button>
      <div class="news-comments__hint">${t("home.commentModerationHint") || "Les commentaires passent en modération avant publication."}</div>
    `;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const msg = safeText(fd.get("msg"));
      if (!msg) return;

      const hint = form.querySelector(".news-comments__hint");
      hint.textContent = "Envoi…";

      const res = await addCommentSupabase(postId, user, msg);
      hint.textContent = res.msg || "";
      if (res.ok) form.reset();
    });

    container.appendChild(form);
  }

  // -----------------------
  // Render
  // -----------------------
  async function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    root.innerHTML = "";

    const sb = getSB();
    if (!sb) {
      root.innerHTML = `<div class="muted">Supabase non configuré.</div>`;
      return;
    }

    const posts = await loadPostsSupabase();
    if (!posts || !posts.length) {
      root.innerHTML = `<div class="muted">Aucune actualité.</div>`;
      return;
    }

    const user = await getUser();
    const ids = posts.map((p) => p.id);
    const commentsMap = await loadCommentsSupabase(ids);

    for (const post of posts) {
      const card = document.createElement("article");
      card.className = "news-card";

      const media = mediaEl(post.media);
      if (media) card.appendChild(media);

      const body = document.createElement("div");
      body.className = "news-body";

      const meta = document.createElement("div");
      meta.className = "news-meta";
      meta.textContent = fmtDate(post.date);

      const h = document.createElement("h3");
      h.className = "news-title";
      h.textContent = post.title || "";

      const p = document.createElement("p");
      p.className = "news-text";
      p.textContent = post.text || "";

      body.appendChild(meta);
      body.appendChild(h);
      body.appendChild(p);
      card.appendChild(body);

      const comments = document.createElement("div");
      comments.className = "news-comments";
      renderComments(comments, post.id, commentsMap[post.id] || [], user);
      card.appendChild(comments);

      root.appendChild(card);
    }
  }

  window.addEventListener("DOMContentLoaded", render);
  window.addEventListener("i18n:changed", render);

  // If partials are injected (layout.js), rerender after header/footer injection
  document.addEventListener("partials:loaded", render);
})();
