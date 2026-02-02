// js/news.js (v3) — sans embed profiles(...)
// Posts: news_posts (is_published=true)
// Comments: news_comments (approved=true) + profiles via 2e requête

(() => {
  "use strict";
  if (window.__MMG_NEWS_INIT__) return;
  window.__MMG_NEWS_INIT__ = true;

  const ROOT_ID = "newsRoot";
  const FALLBACK_ITEMS = [
    {
      id: "demo",
      published_at: "2026-01-28",
      title: "Actualités",
      body: "Une fois Supabase configuré, vous pourrez publier des actus et gérer les images depuis /admin.",
      media: { type: "image", url: "assets/ui/hero-bg.png" },
    },
  ];

  const qs = (s, r = document) => r.querySelector(s);
  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;

  const isAbort = (e) =>
    e?.name === "AbortError" || String(e?.message || "").toLowerCase().includes("aborted");

  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "2-digit" });
    } catch {
      return iso || "";
    }
  };

  const safeText = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  async function getUser() {
    const sb = getSB();
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  async function loadPostsSupabase(signal) {
    const sb = getSB();
    if (!sb) return null;

    const q = sb
      .from("news_posts")
      .select("id,published_at,title,body,media_type,media_url,media_poster,youtube_id")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(12);

    if (q.abortSignal) q.abortSignal(signal);

    const { data, error } = await q;
    if (error) {
      if (!isAbort(error)) console.warn("[MMG] Supabase news error", error);
      return null;
    }
    return (data || []).map((x) => ({
      id: x.id,
      published_at: x.published_at,
      title: x.title,
      body: x.body || "",
      media: normalizeMedia(x),
    }));
  }

  function normalizeMedia(row) {
    const t = row.media_type || "";
    if (t === "youtube" && row.youtube_id) return { type: "youtube", id: row.youtube_id };
    if (t === "video" && row.media_url) return { type: "video", url: row.media_url, poster: row.media_poster || "" };
    if (t === "image" && row.media_url) return { type: "image", url: row.media_url };
    return null;
  }

  function mediaNode(media, title) {
    if (!media) return null;

    if (media.type === "image") {
      const img = document.createElement("img");
      img.src = media.url;
      img.alt = title || "";
      img.loading = "lazy";
      img.decoding = "async";
      return img;
    }

    if (media.type === "video") {
      const v = document.createElement("video");
      v.controls = true;
      v.preload = "metadata";
      if (media.poster) v.poster = media.poster;
      const s = document.createElement("source");
      s.src = media.url;
      s.type = "video/mp4";
      v.appendChild(s);
      return v;
    }

    if (media.type === "youtube") {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube-nocookie.com/embed/${media.id}`;
      iframe.title = title || "YouTube video";
      iframe.loading = "lazy";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      return iframe;
    }

    return null;
  }

  async function loadApprovedComments(postIds, signal) {
    const sb = getSB();
    if (!sb || !postIds.length) return {};

    const q = sb
      .from("news_comments")
      .select("id,post_id,user_id,name,message,created_at")
      .eq("approved", true)
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    if (q.abortSignal) q.abortSignal(signal);

    const { data, error } = await q;
    if (error) {
      if (!isAbort(error)) console.warn("[MMG] Supabase comments error", error);
      return {};
    }

    const rows = data || [];
    const userIds = Array.from(new Set(rows.map((c) => c.user_id).filter(Boolean)));

    // charge profils à part (évite l’embed qui cause ton 400)
    let profilesMap = {};
    if (userIds.length) {
      const qp = sb.from("profiles").select("id,display_name,avatar_url").in("id", userIds);
      if (qp.abortSignal) qp.abortSignal(signal);
      const { data: profs } = await qp;
      (profs || []).forEach((p) => (profilesMap[p.id] = p));
    }

    const map = {};
    rows.forEach((c) => {
      const p = c.user_id ? profilesMap[c.user_id] : null;
      (map[c.post_id] ||= []).push({
        id: c.id,
        who: p?.display_name || c.name || "—",
        avatar: p?.avatar_url || "",
        message: c.message,
        created_at: c.created_at,
      });
    });

    return map;
  }

  async function addComment(postId, user, message) {
    const sb = getSB();
    if (!sb) return { ok: false, msg: "Supabase non configuré" };
    if (!user) return { ok: false, msg: "Connecte-toi pour commenter." };

    // name fallback (le vrai affichage viendra de profiles)
    const name = user.email || "Utilisateur";

    const { error } = await sb.from("news_comments").insert({
      post_id: postId,
      user_id: user.id,
      name,
      message,
      // approved doit rester false par défaut côté DB (modération)
    });

    if (error) {
      console.warn("[MMG] Supabase add comment error", error);
      return { ok: false, msg: error.message || "Erreur" };
    }
    return { ok: true, msg: "Merci ! Ton commentaire est en modération." };
  }

  function renderComments(box, postId, comments, user) {
    box.innerHTML = "";

    const head = document.createElement("div");
    head.className = "news-comments__head";
    head.innerHTML = `<strong>Commentaires</strong>`;
    box.appendChild(head);

    // Gate
    if (!user) {
      const gate = document.createElement("div");
      gate.className = "news-comments__login";
      const back = encodeURIComponent(location.pathname + location.search);
      gate.innerHTML = `
        <p class="muted" style="margin:0 0 10px">Connecte-toi pour commenter.</p>
        <a class="btn" href="login.html?redirect=${back}">Se connecter</a>
      `;
      box.appendChild(gate);
      return;
    }

    const list = document.createElement("div");
    list.className = "news-comments__list";
    const arr = comments || [];

    if (!arr.length) {
      const empty = document.createElement("div");
      empty.className = "news-comments__empty";
      empty.textContent = "Aucun commentaire pour le moment.";
      list.appendChild(empty);
    } else {
      arr.forEach((c) => {
        const item = document.createElement("div");
        item.className = "news-comment";

        item.innerHTML = `
          <div class="news-comment__row">
            <div class="news-comment__avatar">${c.avatar ? `<img src="${c.avatar}" alt="">` : ""}</div>
            <div class="news-comment__content">
              <div class="news-comment__meta">${safeText(c.who)} • ${fmtDate(c.created_at)}</div>
              <div class="news-comment__text"></div>
            </div>
          </div>
        `;

        item.querySelector(".news-comment__text").textContent = safeText(c.message);
        list.appendChild(item);
      });
    }

    box.appendChild(list);

    const form = document.createElement("form");
    form.className = "news-comments__form";
    form.innerHTML = `
      <input class="input" name="msg" placeholder="Votre commentaire…" maxlength="240" required>
      <button class="btn" type="submit">Publier</button>
      <div class="news-comments__hint">Les commentaires passent en modération avant publication.</div>
    `;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = safeText(new FormData(form).get("msg"));
      if (!msg) return;

      const hint = form.querySelector(".news-comments__hint");
      hint.textContent = "Envoi…";

      const res = await addComment(postId, user, msg);
      hint.textContent = res.msg;

      if (res.ok) form.reset();
    });

    box.appendChild(form);
  }

  let abortCtrl = null;

  async function render() {
    const root = qs(`#${ROOT_ID}`);
    if (!root) return;

    // abort render précédent (évite spam AbortError)
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    const signal = abortCtrl.signal;

    root.innerHTML = "";

    const user = await getUser();
    const posts = (await loadPostsSupabase(signal)) || FALLBACK_ITEMS;

    const ids = posts.map((p) => p.id);
    const commentsMap = getSB()
      ? await loadApprovedComments(ids, signal)
      : Object.fromEntries(ids.map((id) => [id, []]));

    posts.forEach((p) => {
      const card = document.createElement("article");
      card.className = "news-card";

      const mWrap = document.createElement("div");
      mWrap.className = "news-media";
      const node = mediaNode(p.media, p.title);
      if (node) mWrap.appendChild(node);
      else mWrap.style.display = "none";
      card.appendChild(mWrap);

      const body = document.createElement("div");
      body.className = "news-body";

      const meta = document.createElement("div");
      meta.className = "news-meta";
      meta.textContent = fmtDate(p.published_at);

      const h = document.createElement("h3");
      h.className = "news-title";
      h.textContent = p.title || "";

      const text = document.createElement("p");
      text.className = "news-text";
      text.textContent = p.body || "";

      body.appendChild(meta);
      body.appendChild(h);
      body.appendChild(text);
      card.appendChild(body);

      const commentsBox = document.createElement("div");
      commentsBox.className = "news-comments";
      renderComments(commentsBox, p.id, commentsMap[p.id] || [], user);

      card.appendChild(commentsBox);
      root.appendChild(card);
    });
  }

  window.addEventListener("DOMContentLoaded", render);
  window.addEventListener("i18n:changed", render);
})();
