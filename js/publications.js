(function(){
  const ROOT_ID = 'publicationsRoot';

  // Fallback: keeps the site pretty even without Supabase
  const FALLBACK = [
    {
      title: 'Quand la matière devient silence',
      body: [
        'Dans l’atelier, tout commence par un souffle : la lumière, l’odeur des pigments, la patience des gestes.',
        'Je cherche moins la forme parfaite que l’émotion juste — celle qui reste quand on ne dit plus rien.',
        'Chaque courbe est une phrase, chaque tension une confidence tenue.',
        'Et quand enfin la pièce tient debout, elle ne “montre” pas : elle raconte.'
      ],
      images: ['assets/artist/post-1a.svg','assets/artist/post-1b.svg']
    },
    {
      title: 'Écrire : ouvrir un passage',
      body: [
        'Il y a des histoires qui ne tiennent pas dans un volume : elles demandent du temps, des voix, des saisons.',
        'J’écris pour donner une seconde vie aux émotions : les faire circuler, les rendre utiles.',
        'Un monde utopique n’est pas une fuite — c’est une boussole.',
        'Ce que j’invente n’est pas “loin” : c’est une manière d’habiter le réel autrement.'
      ],
      images: ['assets/artist/post-2a.svg']
    }
  ];

  function splitParas(text){
    const s = String(text || '').trim();
    if(!s) return [];
    return s.split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0, 8);
  }

  async function loadFromSupabase(){
    const sb = window.mmgSupabase;
    if(!sb) return null;

    const { data, error } = await sb
      .from('publications')
      .select('id,title,body,images,published_at,created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if(error){
      console.warn('[MMG] Publications error', error);
      return null;
    }

    return (data || []).map(p=>({
      id: p.id,
      title: p.title,
      body: splitParas(p.body),
      images: Array.isArray(p.images) ? p.images : [],
      date: p.published_at || p.created_at
    }));
  }

  function render(items){
    const root = document.getElementById(ROOT_ID);
    if(!root) return;

    root.innerHTML = '';
    (items || []).forEach(p=>{
      const art = document.createElement('article');
      art.className = 'post';

      const media = document.createElement('div');
      media.className = 'post__media';

      const imgs = (p.images || []).slice(0, 2);
      if(imgs.length){
        imgs.forEach(src=>{
          const img = document.createElement('img');
          img.src = src;
          img.alt = p.title || '';
          img.loading = 'lazy';
          img.decoding = 'async';
          media.appendChild(img);
        });
      }else{
        // If no image, keep layout stable
        const ph = document.createElement('div');
        ph.className = 'card card-pad';
        ph.style.borderRadius = '14px';
        ph.style.opacity = '.85';
        ph.innerHTML = '<div class="muted">—</div>';
        media.appendChild(ph);
      }

      const content = document.createElement('div');
      content.className = 'post__content';
      const h = document.createElement('h3');
      h.textContent = p.title || '';
      content.appendChild(h);

      (p.body || []).forEach(txt=>{
        const para = document.createElement('p');
        para.textContent = txt;
        content.appendChild(para);
      });

      art.appendChild(media);
      art.appendChild(content);
      root.appendChild(art);
    });
  }

  async function init(){
    const items = await loadFromSupabase();
    if(items === null){
      render(FALLBACK);
      return;
    }
    render(items.length ? items : FALLBACK);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
