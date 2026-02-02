/* js/news.js
   MMG News + Comments (Supabase)
   - Renders posts in #newsRoot
   - Comments: read approved, insert as pending moderation
   - Shows profile display_name + avatar_url when available
   Requires:
     - window.mmgSupabase initialized (supabase-client.js)
*/

(() => {
  "use strict";

  // ---------------------------
  // Anti double init
  // ---------------------------
  if (window.__MMG_NEWS_INIT__) {
    console.warn("[MMG] news already initialized, skip.");
    return;
  }
  window.__MMG_NEWS_INIT__ = true;

  // ---------------------------
  // Config
  // ---------------------------
  const ROOT_ID = "newsRoot";
  const POSTS_LIMIT = 12;
  const MAX_COMMENT_LEN = 240;
  const MAX_NAME_LEN = 40;

  const qs = (s, r = document) => r.querySelector(s);

  const t = (k) => (window.__t ? window.__t(k) : k);

  const safeText = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      const lang = (window.__lang?.() || "fr") === "zh-Hant" ? "zh-Hant" : (window.__lang?.() || "fr");
      return d.toLocaleDateString(lang, { year: "numeric", month: "short", day: "2-digit" });
    } catch {
      return iso || "";
    }
  };

  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;

  async function getUser() {
    const sb = getSB();
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  // ---------------------------
  // Media
  // ---------------------------
  function normalizeMedia(row) {
    const type = row.media_type || "";
    if (type === "youtube" && row.youtube_id) return { type: "youtube", id: row.youtube_id };
    if (type === "video" && row.media_url) return { type: "video", src: row.media_url, poster: row.media_poster || "" };
    if (type === "image" && row.media_url) return { type: "image", src: row.media_url, alt: row.title || "" };
    return null;
  }

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

  // ---------------------------
  // Supabase: Posts
  // ---------------------------
  async function loadPostsSupabase() {
    const sb = getSB();
    if (!sb) return [];

    const { data, error } = await sb
      .from("news_posts")
      .select("id,published_at,title,body,media_type,media_url,media_poster,youtube_id,is_published")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(POSTS_LIMIT);

    if (error) {
      console.warn("[MMG] Supabase posts error", error);
      return [];
    }

    return (data || []).map((x) => ({
      id: x.id,
      date: x.published_at,
      title: x.title,
      text: x.body || "",
      media: normalizeMedia(x),
    }));
  }

  // ---------------------------
  // Supabase: Comments
  // ---------------------------

  // A) Try joined query (needs FK news_comments.user_id -> profiles.id)
  async function loadCommentsJoined(postIds) {
    const sb = getSB();
    if (!sb || !postIds?.length) return { ok: true, map: {} };

    const { data, error } = await sb
      .from("news_comments")
      .select("post_id,message,created_at,profiles(display_name,avatar_url)")
      .eq("approved", true)
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (error) return { ok: false, error };

    const map = {};
    (data || []).forEach((c) => {
      (map[c.post_id] ||= []).push({
        message: c.message,
        created_at: c.created_at,
        display_name: c.profiles?.display_name || null,
        avatar_url: c.profiles?.avatar_url || null,
      });
    });
    return { ok: true, map };
  }

  // B) Fallback if join fails: query comments + profiles separately
  async function loadCommentsFallback(postIds) {
    const sb = getSB();
    if (!sb || !postIds?.length) return {};

    const { data: comments, error: cErr } = await sb
      .from("news_comments")
      .select("post_id,user_id,message,created_at")
      .eq("approved", true)
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (cErr) {
      console.warn("[MMG] Supabase comments error", cErr);
      return {};
    }

    const userIds = Array.from(new Set((comments || []).map((c) => c.user_id).filter(Boolean)));
    let profilesById = {};

    if (userIds.length) {
      const { data: profs, error: pErr } = await sb
        .from("profiles")
        .select("id,display_name,avatar_url")
        .in("id", userIds);

      if (!pErr && Array.isArray(profs)) {
        profilesById = Object.fromEntries(profs.map((p) => [p.id, p]));
      }
    }

    const map = {};
    (comments || []).forEach((c) => {
      const p = profilesById[c.user_id] || null;
      (map[c.post_id] ||= []).push({
        message: c.message,
        created_at: c.created_at,
        display_name: p?.display_name || null,
        avatar_url: p?.avatar_url || null,
      });
    });

    return map;
  }

  async function loadCommentsSupabase(postIds) {
    const joined = await loadCommentsJoined(postIds);

    if (joined.ok) return joined.map;

    // common: PGRST200 "no relationship in schema cache"
    console.warn("[MMG] comments join failed, fallback", joined.error);

    return await loadCommentsFallback(postIds);
  }

  async function ensureProfileRow(user, displayName) {
    const sb = getSB();
    if (!sb || !user) return;

    const name = safeText(displayName) || user.email?.split("@")[0] || "Utilisateur";
    // upsert minimal to avoid FK fail if you have the constraint
    await sb.from("profiles").upsert({ id: user.id, display_name: name }, { onConflict: "id" });
  }

  async function addCommentSupabase(postId, user, displayName, message) {
    const sb = getSB();
    if (!sb) return { ok: false, msg: "Supabase non configuré" };
    if (!user) return { ok: false, msg: t("home.commentLoginHint") || "Connecte-toi pour commenter." };

    const name = safeText(displayName).slice(0, MAX_NAME_LEN);
    const msg = safeText(message).slice(0, MAX_COMMENT_LEN);

    if (!msg) return { ok: false, msg: "Message vide." };

    try {
      await ensureProfileRow(user, name);

      const payload = {
        post_id: postId,
        user_id: user.id,
        message: msg,
        approved: false,
      };

      const { error } = await sb.from("news_comments").insert(payload);

      if (error) {
        console.warn("[MMG] Supabase add comment error", error);
        console.warn("[MMG] payload", payload);
        return { ok: false, msg: error.message || "Erreur ajout commentaire" };
      }

      return { ok: true, msg: t("home.commentModeration") || "Merci ! Votre commentaire est en modération." };
    } catch (e) {
      console.warn("[MMG] add comment exception", e);
      return { ok: false, msg: e?.message || "Erreur ajout commentaire" };
    }
  }

  // ---------------------------
  // Rendering
  // ---------------------------
  function renderComments(root, postId, comments, user) {
    root.innerHTML = "";

    const head = document.createElement("div");
    head.className = "news-comments__head";
    head.innerHTML = `<strong>${t("home.commentsTitle") || "Commentaires"}</strong>`;

    // Signed-in meta
    if (user) {
      const meta = document.createElement("div");
      meta.className = "news-comments__meta";
      meta.innerHTML = `
        <span class="muted small">${t("home.commentSignedInAs") || "Connecté :"} ${user.email || ""}</span>
        <button class="pill" type="button" data-signout>${t("home.commentSignOut") || "Se déconnecter"}</button>
      `;
      head.appendChild(meta);

      meta.querySelector("[data-signout]")?.addEventListener("click", async () => {
        try {
          await getSB()?.auth?.signOut?.();
        } catch {}
        // re-render whole feed
        render();
      });
    }

    root.appendChild(head);

    // list
    const list = document.createElement("div");
    list.className = "news-comments__list";

    const arr = Array.isArray(comments) ? comments : [];
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.className = "news-comments__empty";
      empty.textContent = t("home.noComments") || "Aucun commentaire pour le moment.";
      list.appendChild(empty);
    } else {
      arr.forEach((c) => {
        const item = document.createElement("div");
        item.className = "news-comment";

        const who = safeText(c.display_name || "—");
        const when = fmtDate(c.created_at || "");
        const msg = safeText(c.message || "");

        item.innerHTML = `
          <div class="news-comment__row">
            <div class="news-comment__avatar"></div>
            <div class="news-comment__content">
              <div class="news-comment__meta">${who} • ${when}</div>
              <div class="news-comment__text"></div>
            </div>
          </div>
        `;

        const av = item.querySelector(".news-comment__avatar");
        if (c.avatar_url) {
          av.innerHTML = `<img src="${c.avatar_url}" alt="">`;
        }

        item.querySelector(".news-comment__text").textContent = msg;
        list.appendChild(item);
      });
    }

    root.appendChild(list);

    // Auth gate: if not logged in, show login CTA
    if (!user) {
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

    // form
    const form = document.createElement("form");
    form.className = "news-comments__form";

    const prefillName = user.email ? user.email.split("@")[0] : "";

    form.innerHTML = `
      <input class="input" name="name" value="${prefillName}" placeholder="${t("home.commentName") || "Pseudo"}" maxlength="${MAX_NAME_LEN}" required>
      <input class="input" name="msg" placeholder="${t("home.commentMessage") || "Écrire un commentaire…"}" maxlength="${MAX_COMMENT_LEN}" required>
      <button class="btn" type="submit">${t("home.commentSend") || "Envoyer"}</button>
      <div class="news-comments__hint">${t("home.commentModerationHint") || "Les commentaires passent en modération avant publication."}</div>
    `;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const fd = new FormData(form);
      const name = safeText(fd.get("name")).slice(0, MAX_NAME_LEN);
      const msg = safeText(fd.get("msg")).slice(0, MAX_COMMENT_LEN);

      const hint = form.querySelector(".news-comments__hint");
      if (hint) hint.textContent = "Envoi…";

      const res = await addCommentSupabase(postId, user, name, msg);

      if (hint) hint.textContent = res.msg || "";
      if (res.ok) form.reset();
    });

    root.appendChild(form);
  }

  function renderPostCard(item, commentsForPost, user) {
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
    renderComments(comments, item.id, commentsForPost || [], user);
    card.appendChild(comments);

    return card;
  }

  // ---------------------------
  // Main render
  // ---------------------------
  async function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const sb = getSB();
    if (!sb) {
      root.innerHTML = `<p class="muted">Supabase non configuré.</p>`;
      return;
    }

    root.innerHTML = "";

    const items = await loadPostsSupabase();
    if (!items.length) {
      root.innerHTML = `<p class="muted">Aucune actualité pour le moment.</p>`;
      return;
    }

    const user = await getUser();
    const ids = items.map((x) => x.id);

    const commentsMap = await loadCommentsSupabase(ids);

    const frag = document.createDocumentFragment();
    items.forEach((item) => {
      frag.appendChild(renderPostCard(item, commentsMap[item.id] || [], user));
    });

    root.appendChild(frag);
  }

  // Re-render on:
  // - DOMContentLoaded
  // - i18n language change
  // - auth state change
  window.addEventListener("DOMContentLoaded", render);
  window.addEventListener("i18n:changed", render);

  const sb = getSB();
  sb?.auth?.onAuthStateChange?.(() => render());
})();
