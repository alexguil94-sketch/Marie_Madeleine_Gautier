(function(){
  const ROOT_ID = 'newsRoot';
  const KEY_PREFIX = 'mmg_news_comments_'; // fallback localStorage

  // Fallback demo items (used if Supabase is not configured)
  const FALLBACK_ITEMS = [
    {
      id: 'n1',
      date: '2026-01-28',
      title: 'Actualités',
      text: 'Une fois Supabase configuré, vous pourrez publier des actus et gérer les images depuis /admin.',
      media: { type: 'image', src: 'assets/ui/hero-bg.png', alt: 'Fond accueil' }
    }
  ];

  const t = (k)=> (window.__t ? window.__t(k) : k);

  function safeText(s){
    return String(s ?? '').replace(/\s+/g, ' ').trim();
  }

  function fmtDate(iso){
    try{
      const d = new Date(iso);
      const lang = window.__lang?.() || 'fr';
      return d.toLocaleDateString(lang==='zh-Hant' ? 'zh-Hant' : lang, { year:'numeric', month:'short', day:'2-digit' });
    }catch{
      return iso || '';
    }
  }

  

async function getSessionUser(){
  const sb = window.mmgSupabase;
  if(!sb || !sb.auth) return null;
  const { data } = await sb.auth.getSession();
  return data?.session?.user || null;
}

function lsKey(postId){ return `${KEY_PREFIX}${postId}`; }
  function lsLoad(postId){ return JSON.parse(localStorage.getItem(lsKey(postId)) || '[]'); }
  function lsSave(postId, arr){ localStorage.setItem(lsKey(postId), JSON.stringify(arr)); }

  async function loadFromSupabase(){
    const sb = window.mmgSupabase;
    if(!sb) return null;

    const { data, error } = await sb
      .from('news_posts')
      .select('id,published_at,title,body,media_type,media_url,media_poster,youtube_id')
      .eq('is_published', true)
      .order('published_at', { ascending: false })
      .limit(12);

    if(error){
      console.warn('[MMG] Supabase news error', error);
      return null;
    }

    const items = (data || []).map(x => ({
      id: x.id,
      date: x.published_at,
      title: x.title,
      text: x.body || '',
      media: normalizeMedia(x)
    }));

    return items.length ? items : [];
  }

  function normalizeMedia(row){
    const type = row.media_type || '';
    if(type === 'youtube' && row.youtube_id){
      return { type:'youtube', id: row.youtube_id };
    }
    if(type === 'video' && row.media_url){
      return { type:'video', src: row.media_url, poster: row.media_poster || '' };
    }
    if(type === 'image' && row.media_url){
      return { type:'image', src: row.media_url, alt: row.title || '' };
    }
    return null;
  }

  async function loadCommentsSupabase(postIds){
    const sb = window.mmgSupabase;
    if(!sb || !postIds?.length) return {};

    const { data, error } = await sb
      .from('news_comments')
      .select('post_id,name,message,created_at')
      .eq('approved', true)
      .in('post_id', postIds)
      .order('created_at', { ascending: true });

    if(error){
      console.warn('[MMG] Supabase comments error', error);
      return {};
    }
    const map = {};
    (data || []).forEach(c=>{
      (map[c.post_id] ||= []).push(c);
    });
    return map;
  }

  async function addCommentSupabase(postId, user, name, message){
    const sb = window.mmgSupabase;
    if(!sb) return { ok:false, msg:'Supabase non configuré' };

        if(!user) return { ok:false, msg: t('home.commentLoginHint') || 'Connectez-vous pour commenter.' };

    const payload = { post_id: postId, user_id: user.id, name, message, approved: false };
    const { error } = await sb.from('news_comments').insert(payload);
    if(error){
      console.warn('[MMG] Supabase add comment error', error);
      return { ok:false, msg: t('home.commentError') || 'Erreur' };
    }
    return { ok:true, msg: t('home.commentModeration') || 'Merci ! Votre commentaire est en modération.' };
  }

  function mediaEl(media){
    if(!media) return null;

    if(media.type === 'image'){
      const img = document.createElement('img');
      img.src = media.src;
      img.alt = media.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.className = 'news-media';
      return img;
    }

    if(media.type === 'video'){
      const v = document.createElement('video');
      v.className = 'news-media';
      v.controls = true;
      v.preload = 'metadata';
      if(media.poster) v.poster = media.poster;
      const src = document.createElement('source');
      src.src = media.src;
      src.type = 'video/mp4';
      v.appendChild(src);
      return v;
    }

    if(media.type === 'youtube'){
      const wrap = document.createElement('div');
      wrap.className = 'news-yt';
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${media.id}`;
      iframe.title = 'YouTube video';
      iframe.loading = 'lazy';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
      return wrap;
    }

    return null;
  }

  function renderComments(root, postId, comments, mode, user){
    root.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'news-comments__head';
    
head.innerHTML = `<strong>${t('home.commentsTitle') || 'Commentaires'}</strong>`;
if(mode === 'supabase' && user){
  const meta = document.createElement('div');
  meta.className = 'news-comments__meta';
  meta.innerHTML = `
    <span class="muted small">${t('home.commentSignedInAs') || 'Connecté :'} ${user.email || ''}</span>
    <button class="pill" type="button" data-signout>${t('home.commentSignOut') || 'Se déconnecter'}</button>
  `;
  head.appendChild(meta);
  meta.querySelector('[data-signout]')?.addEventListener('click', async ()=>{
    try{ await window.mmgSupabase?.auth?.signOut?.(); }catch{}
    render();
  });
}

    root.appendChild(head);

    const list = document.createElement('div');
    list.className = 'news-comments__list';

    const arr = comments || [];
    if(arr.length === 0){
      const empty = document.createElement('div');
      empty.className = 'news-comments__empty';
      empty.textContent = t('home.noComments') || 'Aucun commentaire pour le moment.';
      list.appendChild(empty);
    }else{
      arr.forEach(c=>{
        const item = document.createElement('div');
        item.className = 'news-comment';
        const who = safeText(c.name || '—');
        const when = fmtDate(c.created_at || c.date || '');
        const msg = safeText(c.message || c.text || '');
        item.innerHTML = `<div class="news-comment__meta">${who} • ${when}</div><div class="news-comment__text"></div>`;
        item.querySelector('.news-comment__text').textContent = msg;
        list.appendChild(item);
      });
    }
    root.appendChild(list);

    const form = document.createElement('form');

// Auth gate (Supabase): only signed-in users can comment
if(mode === 'supabase' && !user){
  const box = document.createElement('div');
  box.className = 'news-comments__login';
  const back = encodeURIComponent(location.href);
  box.innerHTML = `
    <p class="muted" style="margin:0 0 10px">${t('home.commentLoginHint') || 'Connectez-vous pour commenter.'}</p>
    <a class="btn" href="login.html?redirect=${back}">${t('home.commentLogin') || 'Se connecter'}</a>
  `;
  root.appendChild(box);
  return;
}


    form.className = 'news-comments__form';
    form.innerHTML = `
      <input class="input" name="name" value="${(user && user.email) ? user.email : ""}" placeholder="${t('home.commentName') || 'Nom'}" maxlength="40" required>
      <input class="input" name="msg" placeholder="${t('home.commentMessage') || 'Écrire un commentaire…'}" maxlength="240" required>
      <button class="btn" type="submit">${t('home.commentSend') || 'Envoyer'}</button>
      <div class="news-comments__hint">${mode === 'supabase'
        ? (t('home.commentModerationHint') || 'Les commentaires passent en modération avant publication.')
        : (t('home.commentNote') || 'Note : les commentaires sont enregistrés sur votre appareil (démo).')
      }</div>
    `;
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const name = safeText(fd.get('name'));
      const msg = safeText(fd.get('msg'));
      if(!name || !msg) return;

      // Supabase mode
      if(mode === 'supabase'){
                const res = await addCommentSupabase(postId, user, name, msg);
        form.reset();
        const hint = form.querySelector('.news-comments__hint');
        if(hint) hint.textContent = res.msg || '';
        return;
      }

      // Fallback localStorage mode
      const cur = lsLoad(postId);
      cur.push({ name, text: msg, date: new Date().toISOString() });
      lsSave(postId, cur);
      renderComments(root, postId, lsLoad(postId), 'local');
      form.reset();
    });

    root.appendChild(form);
  }

  async function render(){
    const root = document.getElementById(ROOT_ID);
    if(!root) return;

    root.innerHTML = '';
    let items = await loadFromSupabase();

    const mode = items ? 'supabase' : 'local';
    const user = (mode === 'supabase') ? await getSessionUser() : null;
    if(!items) items = FALLBACK_ITEMS;

    const ids = items.map(x=>x.id);
    const commentsMap = mode === 'supabase'
      ? await loadCommentsSupabase(ids)
      : Object.fromEntries(ids.map(id=>[id, lsLoad(id)]));

    items.forEach(item=>{
      const card = document.createElement('article');
      card.className = 'news-card';

      const m = mediaEl(item.media);
      if(m) card.appendChild(m);

      const body = document.createElement('div');
      body.className = 'news-body';

      const meta = document.createElement('div');
      meta.className = 'news-meta';
      meta.textContent = fmtDate(item.date);

      const h = document.createElement('h3');
      h.className = 'news-title';
      h.textContent = item.title || '';

      const p = document.createElement('p');
      p.className = 'news-text';
      p.textContent = item.text || '';

      body.appendChild(meta);
      body.appendChild(h);
      body.appendChild(p);

      card.appendChild(body);

      const comments = document.createElement('div');
      comments.className = 'news-comments';
      renderComments(comments, item.id, commentsMap[item.id] || [], mode, user);
      card.appendChild(comments);

      root.appendChild(card);
    });
  }

  window.addEventListener('DOMContentLoaded', render);
  window.addEventListener('i18n:changed', render);
})();
