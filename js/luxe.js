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

      const readFirstSitePhotoSupabase = async (slot)=>{
        const sb = await waitForSB(3500);
        if(!sb) return null;

        try{
          const { data, error } = await sb
            .from('site_photos')
            .select('path,title,alt,sort,created_at')
            .eq('slot', slot)
            .eq('is_published', true)
            .order('sort', { ascending:true, nullsFirst:false })
            .order('created_at', { ascending:false })
            .limit(1);

          if(error) return null;
          const row = (data || [])[0];
          if(!row?.path) return null;

          return {
            url: resolveUrl(row.path),
            alt: String(row.alt || row.title || '').trim()
          };
        } catch(e){
          if(isAbort(e)) return null;
          return null;
        }
      };

      // Site logos (optional overrides via site_photos)
      (async ()=>{
        const light = await readFirstSitePhotoSupabase('header_logo_light');
        const dark = await readFirstSitePhotoSupabase('header_logo_dark');

        const apply = ()=>{
          if(light?.url){
            document.querySelectorAll('[data-site-logo-light]').forEach((el)=>{
              el.setAttribute('src', light.url);
              if(light.alt) el.setAttribute('alt', light.alt);
            });
          }
          if(dark?.url){
            document.querySelectorAll('[data-site-logo-dark]').forEach((el)=>{
              el.setAttribute('src', dark.url);
              if(dark.alt) el.setAttribute('alt', dark.alt);
            });
          }
        };

        // Apply now (best effort), and again after header/footer partials are injected.
        apply();
        if(!window.__MMG_PARTIALS_LOADED__){
          document.addEventListener('partials:loaded', apply, { once:true });
        }
      })().catch(()=>{});

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

      const readCarouselPhotosSupabase = async ()=>{
        const sb = await waitForSB(3500);
        if(!sb) return [];

        try{
          const { data, error } = await sb
            .from('site_photos')
            .select('path,sort,created_at')
            .eq('slot', 'drawer_carousel')
            .eq('is_published', true)
            .order('sort', { ascending:true, nullsFirst:false })
            .order('created_at', { ascending:false })
            .limit(300);

          if(error) return [];
          return (data || [])
            .map((x)=> resolveUrl(x?.path))
            .filter(Boolean);
        } catch(e){
          if(isAbort(e)) return [];
          return [];
        }
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

      // Carrousel:
      // 1) If admin configured public.site_photos (slot=drawer_carousel) => use it.
      // 2) Otherwise fallback to local JSON + best-effort Supabase scan.
      (async ()=>{
        try{
          const curated = await readCarouselPhotosSupabase();
          if(curated.length){
            mount(curated);
            return;
          }

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

    // ----- Social links (footer/contact)
    // If admin configured public.site_social_links, update anchors with [data-social].
    (async ()=>{
      const anchors = Array.from(document.querySelectorAll('[data-social]'));
      if(!anchors.length) return;

      const isAbort = (e)=>
        e?.name === 'AbortError' || /signal is aborted/i.test(String(e?.message || e || ''));

      const getSB = ()=> window.mmgSupabase || null;

      const waitForSB = async (timeoutMs = 3500)=>{
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

      const norm = (s)=> String(s || '').trim().toLowerCase();

      try{
        const sb = await waitForSB(3500);
        if(!sb) return;

        const { data, error } = await sb
          .from('site_social_links')
          .select('platform,url,title,sort,is_published,created_at')
          .eq('is_published', true)
          .order('sort', { ascending:true, nullsFirst:false })
          .order('created_at', { ascending:false })
          .limit(200);

        if(error) return;

        const configs = (data || [])
          .map((x)=>({
            platform: norm(x?.platform),
            url: String(x?.url || '').trim(),
            title: String(x?.title || '').trim(),
            sort: Number(x?.sort),
            created_at: String(x?.created_at || '').trim()
          }))
          .filter((x)=> !!x.platform && !!x.url)
          .sort((a, b)=>{
            const as = Number.isFinite(a.sort) ? a.sort : 1000;
            const bs = Number.isFinite(b.sort) ? b.sort : 1000;
            if(as !== bs) return as - bs;
            return String(b.created_at).localeCompare(String(a.created_at));
          });

        const byPlatform = new Map(configs.map((c)=> [c.platform, c]));

        // Apply config to existing anchors: set href/label, and hide missing links.
        anchors.forEach((a)=>{
          const k = norm(a.getAttribute('data-social'));
          const cfg = byPlatform.get(k);

          // Query succeeded: hide anything not configured/published
          a.hidden = !cfg;
          if(!cfg) return;

          a.setAttribute('href', cfg.url);
          if(!a.getAttribute('target')) a.setAttribute('target', '_blank');
          if(!a.getAttribute('rel')) a.setAttribute('rel', 'noopener noreferrer');

          if(cfg.title){
            const labelEl = a.querySelector('span');
            if(labelEl){
              labelEl.textContent = cfg.title;
              labelEl.removeAttribute('data-i18n');
            }
            a.setAttribute('aria-label', cfg.title);
          }
        });

        // Reorder inside each container based on `sort` (only for anchors already in the DOM).
        const parents = new Set(anchors.map((a)=> a?.parentElement).filter(Boolean));
        parents.forEach((p)=>{
          const kids = Array.from(p.children || []).filter((el)=> el?.matches?.('[data-social]'));
          if(!kids.length) return;
          const kidByPlatform = new Map();
          kids.forEach((el)=> kidByPlatform.set(norm(el.getAttribute('data-social')), el));
          configs.forEach((c)=>{
            const el = kidByPlatform.get(c.platform);
            if(el) p.appendChild(el);
          });
        });
      } catch(e){
        if(isAbort(e)) return;
        console.warn('[social-links] init error', e);
      }
    })();
  }

  document.addEventListener('partials:loaded', bind);
})();
