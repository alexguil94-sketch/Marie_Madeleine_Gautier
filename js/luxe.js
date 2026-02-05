(function(){
  function bind(){
    const header = document.querySelector('.site-header');
    const nav = document.querySelector('[data-nav]');
    const burger = document.querySelector('[data-burger]');
    const overlay = document.querySelector('[data-nav-overlay]');
    const closeBtn = document.querySelector('[data-nav-close]');
    const links = Array.from(document.querySelectorAll('.nav-drawer__links a'));

    let lastFocus = null;

    // ----- Header shadow on scroll
    function onScroll(){
      if(!header) return;
      header.classList.toggle('is-scrolled', window.scrollY > 6);
    }
    window.addEventListener('scroll', onScroll, { passive:true });
    onScroll();

    // ----- Scroll lock (keeps layout stable)
    const lockScroll = (lock)=>{
      if(!lock){
        document.body.style.paddingRight = '';
        return;
      }
      const sb = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = sb ? `${sb}px` : '';
    };

    const isOpenNow = ()=> document.body.classList.contains('nav-open');

    const setOpen = (isOpen)=>{
      if(!nav || !burger) return;

      document.body.classList.toggle('nav-open', isOpen);
      nav.classList.toggle('is-open', isOpen);

      burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      nav.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      overlay?.setAttribute('aria-hidden', isOpen ? 'false' : 'true');

      lockScroll(isOpen);

      if(isOpen){
        lastFocus = document.activeElement;
        const first = nav.querySelector('button, a, [tabindex]:not([tabindex="-1"])');
        first?.focus?.();
      } else {
        lastFocus?.focus?.();
        lastFocus = null;
      }
    };

    // Initial state
    burger?.setAttribute('aria-expanded', 'false');
    nav?.setAttribute('aria-hidden', 'true');
    overlay?.setAttribute('aria-hidden', 'true');

    // Toggle
    burger?.addEventListener('click', ()=> setOpen(!isOpenNow()));
    closeBtn?.addEventListener('click', ()=> setOpen(false));
    overlay?.addEventListener('click', ()=> setOpen(false));

    // Close on link click
    links.forEach(a=> a.addEventListener('click', ()=> setOpen(false)));

    // Keyboard: ESC + focus trap
    document.addEventListener('keydown', (e)=>{
      if(!isOpenNow()) return;

      if(e.key === 'Escape'){
        e.preventDefault();
        setOpen(false);
        return;
      }

      if(e.key === 'Tab' && nav){
        const focusables = Array.from(
          nav.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
        ).filter(el=> !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

        if(!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if(e.shiftKey && document.activeElement === first){
          e.preventDefault(); last.focus();
        } else if(!e.shiftKey && document.activeElement === last){
          e.preventDefault(); first.focus();
        }
      }
    });

    // Active link by page
    const norm = (href)=> (href||'').replace(/^\/+/, '').toLowerCase();
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    links.forEach(a => a.classList.toggle('active', norm(a.getAttribute('href')) === current));

    // ----- Drawer carousel (tiny)
    const carousel = document.querySelector('[data-nav-carousel]');
    if(carousel){
      const track = carousel.querySelector('.nav-carousel__track');
      const prev = carousel.querySelector('[data-carousel-prev]');
      const next = carousel.querySelector('[data-carousel-next]');
      const dotsWrap = carousel.querySelector('[data-carousel-dots]');
      const countEl = carousel.querySelector('[data-carousel-count]');

      const isAbort = (e)=>
        e?.name === 'AbortError' || /signal is aborted/i.test(String(e?.message || e || ''));

      const getSB = ()=> window.mmgSupabase || null;
      const getBucket = ()=> (window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || 'media');

      const waitForSB = async (timeoutMs = 6000)=>{
        if(getSB()) return getSB();

        const status = window.__MMG_SB_STATUS__;
        if(status && status !== 'loading') return null;

        return await new Promise((resolve)=>{
          let done = false;
          const onReady = ()=>{
            if(done) return;
            done = true;
            resolve(getSB());
          };

          document.addEventListener('sb:ready', onReady, { once:true });

          setTimeout(()=>{
            if(done) return;
            done = true;
            document.removeEventListener('sb:ready', onReady);
            resolve(getSB());
          }, timeoutMs);
        });
      };

      const resolveUrl = (uOrPath)=>{
        const v = String(uOrPath || '').trim();
        if(!v) return '';
        if(v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')) return v;
        if(v.startsWith('assets/')) return '/' + v;

        const sb = getSB();
        if(!sb?.storage) return v;
        const { data } = sb.storage.from(getBucket()).getPublicUrl(v);
        return data?.publicUrl || v;
      };

      const readLocalPhotos = async ()=>{
        try{
          const res = await fetch('data/site-photos.json', { cache:'no-store' });
          if(!res.ok) return [];
          const data = await res.json();
          if(!Array.isArray(data)) return [];
          return data
            .map((x)=> String(x || '').trim())
            .filter(Boolean);
        } catch(e){
          if(isAbort(e)) return [];
          return [];
        }
      };

      const addJsonImages = (set, v)=>{
        if(!v) return;
        if(typeof v === 'string'){ set.add(v); return; }
        if(Array.isArray(v)){ v.forEach((x)=> addJsonImages(set, x)); return; }
        if(typeof v === 'object' && v.url) set.add(v.url);
      };

      const readSupabasePhotos = async ()=>{
        const sb = await waitForSB(3500);
        if(!sb) return [];

        const out = new Set();
        const pageSize = 1000;

        const fetchAll = async (table, select, build, onRow)=>{
          let from = 0;
          while(true){
            const to = from + pageSize - 1;
            const q = build ? build(sb.from(table).select(select).range(from, to)) : sb.from(table).select(select).range(from, to);
            const { data, error } = await q;
            if(error){
              console.warn('[nav-carousel] fetch error', table, error);
              break;
            }
            (data || []).forEach((row)=> onRow?.(row));
            if(!data || data.length < pageSize) break;
            from += pageSize;
          }
        };

        // Works (cover + thumb + images)
        await fetchAll('works', 'cover_url,thumb_url,images', null, (w)=>{
          addJsonImages(out, w?.cover_url);
          addJsonImages(out, w?.thumb_url);
          addJsonImages(out, w?.images);
        });

        // Work images (optional: may not exist on all setups)
        await fetchAll('work_images', 'path', null, (x)=> addJsonImages(out, x?.path));

        // News (only images)
        await fetchAll('news_posts', 'media_url', (q)=> q.eq('media_type', 'image'), (p)=>{
          addJsonImages(out, p?.media_url);
        });

        // Publications (images array)
        await fetchAll('publications', 'images', null, (p)=> addJsonImages(out, p?.images));

        return Array.from(out).map(resolveUrl).filter(Boolean);
      };

      let i = 0;
      let timer = null;
      let slides = [];

      const readSlides = ()=>{
        slides = Array.from(carousel.querySelectorAll('.nav-carousel__slide'));
      };

      const setIndex = (idx)=>{
        if(!track) return;
        if(!slides.length){
          if(countEl) countEl.textContent = '';
          return;
        }

        i = (idx + slides.length) % slides.length;
        track.style.transform = `translateX(${-i * 100}%)`;

        if(countEl) countEl.textContent = `${i + 1} / ${slides.length}`;

        if(dotsWrap && !dotsWrap.hidden){
          Array.from(dotsWrap.children).forEach((d, di)=>{
            d.classList.toggle('is-active', di === i);
          });
        }
      };

      const buildDots = ()=>{
        if(!dotsWrap) return;
        const show = slides.length > 1 && slides.length <= 12;
        dotsWrap.hidden = !show;
        dotsWrap.innerHTML = '';
        if(!show) return;

        slides.forEach((_, di)=>{
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'nav-carousel__dot' + (di === 0 ? ' is-active' : '');
          b.addEventListener('click', ()=>{ setIndex(di); restart(); });
          dotsWrap.appendChild(b);
        });
      };

      const restart = ()=>{
        if(timer) clearInterval(timer);
        timer = setInterval(()=> setIndex(i + 1), 4500);
      };

      const mount = (urls)=>{
        if(!track) return;

        const uniq = [];
        const seen = new Set();
        urls.forEach((u)=>{
          const v = String(u || '').trim();
          if(!v || seen.has(v)) return;
          seen.add(v);
          uniq.push(v);
        });

        if(!uniq.length) return;

        track.innerHTML = uniq
          .map(
            (u)=>
              `<div class="nav-carousel__slide"><img src="${u}" alt="" loading="lazy" decoding="async"></div>`
          )
          .join('');

        readSlides();
        buildDots();
        setIndex(0);
        restart();
      };

      readSlides();
      buildDots();
      setIndex(0);
      restart();

      prev?.addEventListener('click', ()=>{ setIndex(i - 1); restart(); });
      next?.addEventListener('click', ()=>{ setIndex(i + 1); restart(); });

      carousel.addEventListener('mouseenter', ()=> timer && clearInterval(timer));
      carousel.addEventListener('mouseleave', restart);

      // Build the carousel with every local + Supabase photo we can access.
      (async ()=>{
        try{
          const local = await readLocalPhotos();
          if(local.length) mount(local);

          const remote = await readSupabasePhotos();
          if(remote.length){
            const merged = local.concat(remote);
            mount(merged);
          }
        } catch(e){
          if(isAbort(e)) return;
          console.warn('[nav-carousel] init error', e);
        }
      })();
    }

    // ----- Lang dropdown (clean)
    const langWrap = document.querySelector('[data-lang-wrap]');
    const langToggle = document.querySelector('[data-lang-toggle]');

    const setLangOpen = (open)=>{
      if(!langWrap || !langToggle) return;
      langWrap.classList.toggle('is-open', open);
      langToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    document.addEventListener('click', (e)=>{
      if(!langWrap || !langToggle) return;

      const inside = e.target.closest('[data-lang-wrap]');
      const hitToggle = !!e.target.closest('[data-lang-toggle]');
      const hitLang = !!e.target.closest('[data-lang]');

      if(inside && hitToggle){
        setLangOpen(!langWrap.classList.contains('is-open'));
        return;
      }
      if(inside && hitLang){
        setLangOpen(false);
        return;
      }
      if(!inside) setLangOpen(false);
    });

    document.addEventListener('keydown', (e)=>{
      if(e.key !== 'Escape') return;
      if(langWrap?.classList.contains('is-open')) setLangOpen(false);
    });
  }

  document.addEventListener('partials:loaded', bind);
})();
