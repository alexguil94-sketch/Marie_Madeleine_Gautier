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
      const slides = Array.from(carousel.querySelectorAll('.nav-carousel__slide'));
      const prev = carousel.querySelector('[data-carousel-prev]');
      const next = carousel.querySelector('[data-carousel-next]');
      const dotsWrap = carousel.querySelector('[data-carousel-dots]');

      let i = 0;
      let timer = null;

      const setIndex = (idx)=>{
        if(!track || !slides.length) return;
        i = (idx + slides.length) % slides.length;
        track.style.transform = `translateX(${-i * 100}%)`;
        if(dotsWrap){
          Array.from(dotsWrap.children).forEach((d, di)=>{
            d.classList.toggle('is-active', di === i);
          });
        }
      };

      const buildDots = ()=>{
        if(!dotsWrap) return;
        dotsWrap.innerHTML = '';
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
        timer = setInterval(()=> setIndex(i+1), 4500);
      };

      buildDots();
      setIndex(0);
      restart();

      prev?.addEventListener('click', ()=>{ setIndex(i-1); restart(); });
      next?.addEventListener('click', ()=>{ setIndex(i+1); restart(); });

      carousel.addEventListener('mouseenter', ()=> timer && clearInterval(timer));
      carousel.addEventListener('mouseleave', restart);
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
