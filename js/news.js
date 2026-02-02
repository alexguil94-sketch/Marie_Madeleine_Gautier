// js/news.js (v3)
// News + commentaires Supabase (modération)
// Tables attendues:
// - news_posts(id, published_at, title, body, media_type, media_url, media_poster, youtube_id, is_published)
// - news_comments(id, post_id, user_id, name, message, approved, created_at)
// - profiles(id, display_name, avatar_url)

(() => {
  "use strict";
  if (window.__MMG_NEWS_INIT__) return;
  window.__MMG_NEWS_INIT__ = true;

  const ROOT_ID = "newsRoot";
  const qs = (s, r = document) => r.querySelector(s);

  const t = (k) => (window.__t ? window.__t(k) : k);

  const safeText = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      const lang = (window.__lang?.() || "fr");
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

  async function ensureProfileRow(user) {
    const sb = getSB();
    if (!sb || !user) return null;
    const fallbackName = user.user_metadata?.name || (user.email ? user.email.split("@")[0] : null) || null;

    await sb.from("profiles").upsert({ id: user.id, display_name: fallbackName, avatar_url: null }, { onConflict: "id" });

    const { data } = await sb
      .from("profiles")
      .select("id,display_name,avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    return data || null;
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
      img.className = "news-media";
      img.src = media.src;
      img.alt = media.alt || "";
      img.loading = "lazy";
      img.decoding = "async";
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

  async function loadPosts() {
    const sb = getSB();
    if (!sb) return [];

    const { data, error } = await sb
      .from("news_posts")
      .select("id,published_at,title,body,media_type,media_url,media_poster,youtube_id")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(12);

    if (error) {
      console.warn("[MMG] Supabase news error", error);
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

  async function loadComments(postIds) {
    const sb = getSB();
    if (!sb || !postIds?.length) return {};

    // ✅ IMPORTANT : FK forcée ici
    const { data, error } = await sb
      .from("news_comments")
      .select(
        "post_id,message,created_at,name,user_id,profiles:profiles!news_comments_user_id_fkey(display_name,avatar_url)"
      )
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

  async function addComment(postId, user, message) {
    const sb = getSB();
    if (!sb) return { ok: false, msg: "Supabase non configuré." };
    if (!user) return { ok: false, msg: "Connecte-toi pour commenter." };

    // ✅ Assure la ligne profiles (sinon FK peut casser)
    const profile = await ensureProfileRow(user);
    const name = safeText(profile?.display_name || user.email?.split("@")[0] || "Utilisateur");

    const payload = {
      post_id: postId,
      user_id: user.id,
      name,
      message: safeText(message),
      approved: false,
    };

    const { error } = await sb.from("news_comments").insert(payload);
    if (error) {
      console.warn("[MMG] Supabase add comment error", error);
      return { ok: false, msg: "Erreur lors de l’envoi." };
    }
    return { ok: true, msg: "Merci ! Ton commentaire est en modération." };
  }

  function renderComments(container, postId, comments, user, profile) {
    container.innerHTML = "";

    const head = document.createElement("div");
    head.className = "news-comments__head";
    head.innerHTML = `<strong>${t("home.commentsTitle") || "Commentaires"}</strong>`;
    container.appendChild(head);

    const list = document.createElement("div");
    list.className = "news-comments__list";
    container.appendChild(list);

    const arr = comments || [];
    if (!arr.length) {
      const empty = document.createElement("div");
      empty.className = "news-comments__empty";
      empty.textContent = t("home.noComments") || "Aucun commentaire pour le moment.";
      list.appendChild(empty);
    } else {
      arr.forEach((c) => {
        const who = safeText(c?.profiles?.display_name || c.name || "—");
        const when = fmtDate(c.created_at || "");
        const msg = safeText(c.message || "");

        const avatarUrl = c?.profiles?.avatar_url || "";

        const item = document.createElement("div");
        item.className = "news-comment";
        item.innerHTML = `
          <div class="news-comment__row">
            <div class="news-comment__avatar">${avatarUrl ? `<img src="${avatarUrl}" alt="">` : ""}</div>
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

    // Form
    const box = document.createElement("div");
    box.className = "news-comments__form";
    container.appendChild(box);

    if (!user) {
      const back = encodeURIComponent(location.pathname + location.search);
      box.innerHTML = `
        <div class="news-comments__login">
          <p class="muted" style="margin:0 0 10px">${t("home.commentLoginHint") || "Connectez-vous pour commenter."}</p>
          <a class="btn" href="/login.html?redirect=${back}">${t("home.commentLogin") || "Se connecter"}</a>
        </div>
      `;
      return;
    }

    if (!profile?.display_name) {
      box.innerHTML = `
        <div class="news-comments__login">
          <p class="muted" style="margin:0 0 10px">Choisis ton pseudo avant de commenter.</p>
          <button class="btn" type="button" data-open-profile>Ouvrir mon profil</button>
        </div>
      `;
      box.querySelector("[data-open-profile]")?.addEventListener("click", () => window.MMGProfile?.open?.());
      return;
    }

    box.innerHTML = `
      <form class="comment-form" data-form>
        <input class="field" name="msg" placeholder="${t("home.commentMessage") || "Écrire un commentaire…"}" maxlength="240" required>
        <button class="btn" type="submit">${t("home.commentSend") || "Envoyer"}</button>
        <div class="news-comments__hint">${t("home.commentModerationHint") || "Les commentaires passent en modération avant publication."}</div>
      </form>
    `;

    const form = box.querySelector("[data-form]");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const msg = fd.get("msg");
      if (!msg) return;

      const hint = box.querySelector(".news-comments__hint");
      if (hint) hint.textContent = "Envoi…";

      const res = await addComment(postId, user, msg);
      if (hint) hint.textContent = res.msg;

      form.reset();
    });
  }

  let renderToken = 0;

  async function render() {
    const root = qs("#" + ROOT_ID);
    if (!root) return;

    const token = ++renderToken;

    root.innerHTML = "";
    const sb = getSB();
    const user = sb ? await getUser() : null;
    const profile = user ? await ensureProfileRow(user) : null;

    const posts = await loadPosts();
    if (token !== renderToken) return;

    const ids = posts.map((p) => p.id);
    const commentsMap = await loadComments(ids);
    if (token !== renderToken) return;

    posts.forEach((p) => {
      const card = document.createElement("article");
      card.className = "news-card";

      const m = mediaEl(p.media);
      if (m) card.appendChild(m);

      const body = document.createElement("div");
      body.className = "news-body";

      const meta = document.createElement("div");
      meta.className = "news-meta";
      meta.textContent = fmtDate(p.date);

      const h = document.createElement("h3");
      h.className = "news-title";
      h.textContent = p.title || "";

      const txt = document.createElement("p");
      txt.className = "news-text";
      txt.textContent = p.text || "";

      body.appendChild(meta);
      body.appendChild(h);
      body.appendChild(txt);
      card.appendChild(body);

      const comments = document.createElement("div");
      comments.className = "news-comments";
      renderComments(comments, p.id, commentsMap[p.id] || [], user, profile);
      card.appendChild(comments);

      root.appendChild(card);
    });
  }

  window.addEventListener("DOMContentLoaded", render);
  window.addEventListener("i18n:changed", render);
})();
