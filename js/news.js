// js/news.js (v3)
// News + commentaires (Supabase) + fallback localStorage
// - Robuste (anti double init, anti multi-render, pas d'AbortError bloquant)
// - Join explicite vers profiles via FK: profiles!news_comments_user_id_fkey
// Requiert: supabase.js + supabase-config.js + supabase-client.js

(() => {
  "use strict";
  if (window.__MMG_NEWS_INIT__) return;
  window.__MMG_NEWS_INIT__ = true;

  const ROOT_ID = "newsRoot";
  const KEY_PREFIX = "mmg_news_comments_"; // fallback localStorage
  const PAGE_SIZE = 12;

  const FALLBACK_ITEMS = [
    {
      id: "n1",
      date: "2026-01-28",
      title: "Actualités",
      text: "Une fois Supabase configuré, vous pourrez publier des actus et gérer les images depuis /admin.",
      media: { type: "image", src: "assets/ui/hero-bg.png", alt: "Fond accueil" },
    },
  ];

  const qs = (s, r = document) => r.querySelector(s);
  const t = (k) => (window.__t ? window.__t(k) : k);

  function safeText(v) {
    return String(v ?? "").replace(/\s+/g, " ").trim();
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      const lang = window.__lang?.() || "fr";
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

  function lsKey(postId) {
    return `${KEY_PREFIX}${postId}`;
  }
  function lsLoad(postId) {
    try {
      return JSON.parse(localStorage.getItem(lsKey(postId)) || "[]");
    } catch {
      return [];
    }
  }
  function lsSave(postId, arr) {
    localStorage.setItem(lsKey(postId), JSON.stringify(arr || []));
  }

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
  // SUPABASE LOADERS
  // ---------------------------
  async function loadPostsSupabase() {
    const sb = getSB();
    if (!sb) return null;

    const { data, error } = await sb
      .from("news_posts")
      .select("id,published_at,title,body,media_type,media_url,media_poster,youtube_id")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.warn("[MMG] Supabase news error", error);
      return null;
    }

    return (data || []).map((x) => ({
      id: x.id,
      date: x.published_at,
      title: x.title,
      text: x.body || "",
      media: normalizeMedia(x),
    }));
  }

  async function loadCommentsSupabase(postIds) {
    const sb = getSB();
    if (!sb || !postIds?.length) return {};

    // ✅ Join explicite vers profiles via le nom de FK
    const { data, error } = await sb
      .from("news_comments")
      .select("post_id,message,created_at,name,user_id,profiles!news_comments_user_id_fkey(display_name,avatar_url)")
      .eq("approved", true)
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[MMG] Supabase comments error", error);
      return {};
    }

    const map = {};
    (data || []).forEach((c) => {
      const prof = c.profiles || null;
      const display = safeText(prof?.display_name || c.name || "—");
      const avatar = safeText(prof?.avatar_url || "");
      (map[c.post_id] ||= []).push({
        name: display,
        avatar_url: avatar,
        message: c.message,
        created_at: c.created_at,
      });
    });

    return map;
  }

  async function getMyProfileForName(user) {
    const sb = getSB();
    if (!sb || !user) return { display_name: "", avatar_url: "" };

    const { data } = await sb.from("profiles").select("display_name,avatar_url").eq("id", user.id).maybeSingle();
    return {
      display_name: safeText(data?.display_name || ""),
      avatar_url: safeText(data?.avatar_url || ""),
    };
  }

  async function addCommentSupabase(postId, user, message) {
    const sb = getSB();
    if (!sb) return { ok: false, msg: "Supabase non configuré." };
    if (!user) return { ok: false, msg: t("home.commentLoginHint") || "Connectez-vous pour commenter." };

    const prof = await getMyProfileForName(user);
    const fallbackName = prof.display_name || user.email || "—";

    const payload = {
      post_id: postId,
      user_id: user.id,
      name: fallbackName, // snapshot (utile même si profile change)
      message,
      approved: false,
    };

    const { error } = await sb.from("news_comments").insert(payload);
    if (error) {
      console.warn("[MMG] Supabase add comment error", error);
      return { ok: false, msg: t("home.commentError") || "Erreur lors de l’envoi." };
    }
    return { ok: true, msg: t("home.commentModeration") || "Merci ! Votre commentaire est en modération." };
  }

  // ---------------------------
  // UI RENDER
  // ---------------------------
  function renderComments(root, postId, comments, mode, user) {
    root.innerHTML = "";

    const head = document.createElement("div");
    head.className = "news-comments__head";
    head.innerHTML = `<strong>${t("home.commentsTitle") || "Commentaires"}</strong>`;
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

        const who = safeText(c.name || "—");
        const when = fmtDate(c.created_at || "");
        const msg = safeText(c.message || "");

        item.innerHTML = `
          <div class="news-comment__row">
            <div class="news-comment__avatar">${c.avatar_url ? `<img src="${c.avatar_url}" alt="">` : ""}</div>
            <div class="news-comment__content">
              <div class="news-comment__meta">${who} • ${when}</div>
              <div class="news-comment__text"></div>
            </div>
          </div>
        `;
        item.querySelector(".news-comment__text").textContent = msg;
        list.appendChild(item);
      });
    }

    root.appendChild(list);

    // Auth gate
    if (mode === "supabase" && !user) {
      const box = document.createElement("div");
      box.className = "news-comments__login";
      const back = encodeURIComponent(location.pathname + location.search);
      box.innerHTML = `
        <p class="muted" style="margin:0 0 10px">${t("home.commentLoginHint") || "Connectez-vous pour commenter."}</p>
        <a class="btn" href="login.html?redirect=${back}">${t("home.commentLogin") || "Se connecter"}</a>
      `;
      root.appendChild(box);
      return;
    }

    const form = document.createElement("form");
    form.className = "news-comments__form";

    form.innerHTML = `
      <input class="input" name="msg" placeholder="${t("home.commentMessage") || "Écrire un commentaire…"}" maxlength="240" required>
      <button class="btn" type="submit">${t("home.commentSend") || "Envoyer"}</button>
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

      if (mode === "supabase") {
        const res = await addCommentSupabase(postId, user, msg);
        form.reset();
        const hint = form.querySelector(".news-comments__hint");
        if (hint) hint.textContent = res.msg || "";
        return;
      }

      const cur = lsLoad(postId);
      cur.push({ name: "Local", message: msg, created_at: new Date().toISOString(), avatar_url: "" });
      lsSave(postId, cur);
      renderComments(root, postId, lsLoad(postId), "local", null);
      form.reset();
    });

    root.appendChild(form);
  }

  let renderToken = 0;

  async function render() {
    const token = ++renderToken;
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    root.innerHTML = "";

    let items = await loadPostsSupabase();
    const mode = items ? "supabase" : "local";
    const user = mode === "supabase" ? await getUser() : null;
    if (!items) items = FALLBACK_ITEMS;

    if (token !== renderToken) return;

    const ids = items.map((x) => x.id);

    const commentsMap =
      mode === "supabase"
        ? await loadCommentsSupabase(ids)
        : Object.fromEntries(ids.map((id) => [id, lsLoad(id)]));

    if (token !== renderToken) return;

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

  window.addEventListener("DOMContentLoaded", render);
  document.addEventListener("partials:loaded", render);
  window.addEventListener("i18n:changed", render);
  getSB()?.auth?.onAuthStateChange?.(() => render());
})();
