(async function(){
  const grid = document.getElementById('grid');
  if(!grid) return;

  const q = document.getElementById('q');
  const cat = document.getElementById('cat');
  const loadMore = document.getElementById('loadMore');

  async function loadWorks(){
    const sb = window.mmgSupabase;
    if(sb){
      const { data, error } = await sb
        .from('works')
        .select('id,title,year,category,cover_url,thumb_url,images,sort,is_published')
        .eq('is_published', true)
        .order('sort', { ascending: true })
        .limit(500);

      if(!error && Array.isArray(data) && data.length){
        const norm = data.map((x, i)=>{
          const imgs = Array.isArray(x.images) ? x.images : (Array.isArray(x.images?.items) ? x.images.items : (Array.isArray(x.images?.urls) ? x.images.urls : []));
          const main = imgs[0] || x.cover_url || '';
          const thumb = x.thumb_url || x.cover_url || main;
          return {
            id: x.id || `w_${i+1}`,
            src: main,
            thumb,
            title: x.title || `Oeuvre ${String(i+1).padStart(3,'0')}`,
            year: x.year || '',
            category: x.category || ''
          };
        }).filter(x=>x.src);
        if(norm.length) return norm;
      }
    }

    // Fallback: local JSON
    const res = await fetch('data/works.json');
    const raw = await res.json();
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
    return arr.map((x, i)=>({
      id: x.id || `w_${i+1}`,
      src: x.src,
      thumb: x.thumb || x.src,
      title: x.title || `Oeuvre ${String(i+1).padStart(3,'0')}`,
      year: x.year || '',
      category: x.category || ''
    })).filter(x=>x.src);
  }

  let all = await loadWorks();

    const pageSize = 24;
  let shown = 0;
  let current = [...all];

  // Categories (optional)
  const cats = Array.from(new Set(all.map(x=>x.category).filter(Boolean))).sort();
  if(cats.length === 0){
    // Hide category selector if empty
    if(cat) cat.style.display = 'none';
  } else {
    cats.forEach(c=>{
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      cat.appendChild(opt);
    });
  }

  function matches(item){
    const qq = (q.value||'').trim().toLowerCase();
    const cc = cat && cats.length ? cat.value : 'all';
    const text = `${item.title||''} ${item.year||''} ${item.category||''}`.toLowerCase();
    if(cc !== 'all' && item.category !== cc) return false;
    if(qq && !text.includes(qq)) return false;
    return true;
  }

  function reset(){
    current = all.filter(matches);
    shown = 0;
    grid.innerHTML = '';
    renderMore();
  }

  function renderMore(){
    const slice = current.slice(shown, shown + pageSize);
    shown += slice.length;

    const frag = document.createDocumentFragment();
    slice.forEach(item=>{
      const div = document.createElement('button');
      // Gallery-specific styling avoids cropping tall photos
      div.className = 'work work--gallery';
      div.type = 'button';
      div.innerHTML = `
        <img loading="lazy" src="${item.thumb}" alt="${item.title||''}">
        <div class="meta">
          <div style="font-weight:600">${item.title||''}</div>
          <div class="muted">${item.year||''} ${item.category? '• '+item.category : ''}</div>
        </div>`;
      div.addEventListener('click', ()=> openLightbox(item));
      frag.appendChild(div);
    });
    grid.appendChild(frag);

    loadMore.disabled = shown >= current.length;
    loadMore.style.opacity = loadMore.disabled ? .45 : 1;
  }

  // ----------------------
  // Lightbox (zoom + nav)
  // ----------------------
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lbImg');
  const lbTitle = document.getElementById('lbTitle');
  const lbCount = document.getElementById('lbCount');
  const lbCanvas = document.getElementById('lbCanvas');

  let scale = 1, x = 0, y = 0, dragging = false, sx=0, sy=0;
  let lbIndex = -1;

  function apply(){
    lbImg.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`;
  }

  function setAt(index){
    if(!current.length) return;
    lbIndex = (index + current.length) % current.length;
    const item = current[lbIndex];

    lbImg.src = item.src;
    lbTitle.textContent = item.title || '—';
    if(lbCount) lbCount.textContent = `(${lbIndex+1}/${current.length})`;

    // Reset zoom when changing image (more predictable)
    scale = 1; x = 0; y = 0;
    apply();
  }

  function openLightbox(item){
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden','false');

    // Find index in current list
    const idx = current.findIndex(x=>x.src === item.src);
    setAt(idx >= 0 ? idx : 0);
  }

  function closeLightbox(){
    lb.classList.remove('is-open');
    lb.setAttribute('aria-hidden','true');
  }

  function isOpen(){ return lb.classList.contains('is-open'); }

  // Clicks: close, zoom, nav
  document.addEventListener('click',(e)=>{
    if(e.target.closest('[data-close]') || e.target === lb) closeLightbox();

    const z = e.target.closest('[data-zoom]');
    if(z && isOpen()){
      const v = z.dataset.zoom;
      if(v==='in') scale = Math.min(6, scale*1.15);
      if(v==='out') scale = Math.max(.6, scale/1.15);
      if(v==='reset'){ scale = 1; x = 0; y = 0; }
      apply();
    }

    const navBtn = e.target.closest('[data-nav]');
    if(navBtn && isOpen()){
      setAt(lbIndex + (navBtn.dataset.nav === 'next' ? 1 : -1));
    }
  });

  // Keyboard: ESC + arrows
  window.addEventListener('keydown', (e)=>{
    if(!isOpen()) return;
    if(e.key === 'Escape') closeLightbox();
    if(e.key === 'ArrowRight') setAt(lbIndex + 1);
    if(e.key === 'ArrowLeft') setAt(lbIndex - 1);
  });

  // Drag to pan
  lbCanvas.addEventListener('mousedown',(e)=>{ if(!isOpen()) return; dragging = true; sx = e.clientX - x; sy = e.clientY - y; });
  window.addEventListener('mouseup', ()=> dragging=false);
  window.addEventListener('mousemove',(e)=>{ if(!dragging) return; x = e.clientX - sx; y = e.clientY - sy; apply(); });

  // Wheel zoom
  lbCanvas.addEventListener('wheel',(e)=>{
    if(!isOpen()) return;
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    scale = delta>0 ? Math.max(.6, scale/1.12) : Math.min(6, scale*1.12);
    apply();
  }, {passive:false});

  // Touch swipe (left/right to change)
  let tStartX = 0, tStartY = 0;
  lbCanvas.addEventListener('touchstart', (e)=>{
    if(!isOpen()) return;
    const t = e.touches[0];
    tStartX = t.clientX; tStartY = t.clientY;
  }, {passive:true});

  lbCanvas.addEventListener('touchend', (e)=>{
    if(!isOpen()) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tStartX;
    const dy = t.clientY - tStartY;
    if(Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)){
      setAt(lbIndex + (dx < 0 ? 1 : -1));
    }
  }, {passive:true});

  // Filters
  q.addEventListener('input', reset);
  if(cat) cat.addEventListener('change', reset);
  loadMore.addEventListener('click', ()=> renderMore());

  reset();
})();