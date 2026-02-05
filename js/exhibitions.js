(function(){
  const root = document.getElementById('expoRoot');
  if(!root) return;

  const KEY = 'exhibitions.v1';
  const SEED_URLS = ['/data/exhibitions.seed.json', 'data/exhibitions.seed.json'];

  const uuid = ()=>{
    try{
      if(typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'){
        return crypto.randomUUID();
      }
    } catch {}
    return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  };

  function load(){
    const readKey = (k)=>{
      try{
        const data = JSON.parse(localStorage.getItem(k) || '[]');
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    };

    const primary = readKey(KEY);
    if(primary.length) return primary;

    // Migration: older keys (keep KEY stable for all widgets)
    const legacyKeys = ['exhibitions', 'mmg.exhibitions', 'agenda.exhibitions'];
    for(const k of legacyKeys){
      const v = readKey(k);
      if(v.length){
        try{ localStorage.setItem(KEY, JSON.stringify(v)); } catch {}
        return v;
      }
    }

    return [];
  }

  function save(list){
    localStorage.setItem(KEY, JSON.stringify(list));
    // Notify other widgets (calendar, etc.)
    try{ window.dispatchEvent(new Event('exhibitions:changed')); }catch{}
  }

  function looksLikeDemoSeed(list){
    if(!Array.isArray(list) || !list.length) return false;
    // Old demo seed uses titles like "Exposition #1" / "Exposition à venir #1"
    const demo = list.filter(x=> typeof x?.title === 'string' && /^Exposition\b.*#\d+/.test(x.title));
    return demo.length >= Math.min(8, list.length);
  }

  async function seedFromFile(){
    let lastErr = null;
    for(const url of SEED_URLS){
      try{
        const res = await fetch(url, { cache:'no-store' });
        if(!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
        const data = await res.json();
        if(!Array.isArray(data)) throw new Error('seed json must be an array');

        const seeded = data
          .map(x=>({
            id: uuid(),
            title: String(x?.title || '').trim(),
            city: String(x?.city || '').trim(),
            venue: String(x?.venue || '').trim(),
            link: String(x?.link || '').trim(),
            date: String(x?.date || '').trim(),
            status: x?.status === 'upcoming' ? 'upcoming' : 'past'
          }))
          .filter(x=> x.title && x.date && x.status);

        save(seeded);
        return;
      } catch(e){
        lastErr = e;
      }
    }
    throw lastErr || new Error('seed failed');
  }

  async function ensureSeed(){
    const list = load();
    if(Array.isArray(list) && list.length && !looksLikeDemoSeed(list)) return;

    try{
      await seedFromFile();
    } catch(e){
      console.warn('[exhibitions] seed failed', e);
    }
  }

  function displayWhen(x){
    const v = String(x?.date || '').trim();
    if(!v) return '';
    if(x?.status === 'past') return v.slice(0,4) || v;
    return v;
  }

  function rowHTML(x){
    const badge = x.status==='upcoming'
      ? (window.__t?.('expo.badgeUpcoming') ?? 'À venir')
      : (window.__t?.('expo.badgePast') ?? 'Passée');

    const meta = [
      String(x.city||'').trim(),
      displayWhen(x),
      String(x.venue||'').trim()
    ].filter(Boolean).join(' • ');

    return `
      <div class="item">
        <div>
          <div style="font-weight:600">${x.title}</div>
          ${meta ? `<div class="muted">${meta}</div>` : ''}
          ${x.link ? `<div><a class="muted" href="${x.link}" target="_blank" rel="noreferrer">${x.link}</a></div>` : ''}
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px">
          <span class="badge">${badge}</span>
          <button class="icon-btn" data-del="${x.id}">🗑</button>
        </div>
      </div>
    `;
  }

  function emptyHTML(){
    return `<p class="muted">${window.__t?.('expo.empty') ?? 'Aucun élément.'}</p>`;
  }

  function modalHTML(){
    return `
      <div class="lightbox" id="expoModal" aria-hidden="true">
        <div class="card" style="width:min(720px, calc(100% - 28px)); padding:16px">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px">
            <h3 style="margin:0" data-i18n="expo.modalTitle">Ajouter une exposition</h3>
            <button class="icon-btn" data-close>✕</button>
          </div>
          <div class="hr"></div>
          <form id="expoForm" class="cal" autocomplete="off">
            <input class="input" name="title" required data-i18n-placeholder="expo.phTitle" placeholder="Titre">
            <input class="input" name="city" required data-i18n-placeholder="expo.phCity" placeholder="Ville">
            <input class="input" name="venue" data-i18n-placeholder="expo.phVenue" placeholder="Galerie / lieu">
            <input class="input" name="link" data-i18n-placeholder="expo.phLink" placeholder="Lien (option)">
            <input class="input" name="date" type="date" required>
            <select name="status">
              <option value="upcoming" data-i18n="expo.upcoming">À venir</option>
              <option value="past" data-i18n="expo.past">Expositions passées</option>
            </select>
            <button class="btn" type="submit" data-i18n="expo.save">Enregistrer</button>
          </form>
        </div>
      </div>
    `;
  }

  function render(){
    const list = load();
    const past = list.filter(x=>x.status==='past').sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')));
    const up = list.filter(x=>x.status==='upcoming').sort((a,b)=> String(a.date||'').localeCompare(String(b.date||'')));

    root.innerHTML = `
      <div class="toolbar">
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn" data-add>${window.__t?.('expo.add') ?? 'Ajouter une expo'}</button>
          <button class="btn ghost" data-export>${window.__t?.('expo.export') ?? 'Exporter JSON'}</button>
          <label class="btn ghost" style="cursor:pointer">
            ${window.__t?.('expo.import') ?? 'Importer JSON'}
            <input type="file" accept="application/json" hidden data-import>
          </label>
        </div>
        <span class="muted">${past.length} / ${up.length}</span>
      </div>
      <div class="hr"></div>
      <div class="columns">
        <div class="card card-pad">
          <h2 style="margin-top:0" data-i18n="expo.past">Expositions passées</h2>
          <div class="list">${past.map(rowHTML).join('') || emptyHTML()}</div>
        </div>
        <div class="card card-pad">
          <h2 style="margin-top:0" data-i18n="expo.upcoming">À venir</h2>
          <div class="list">${up.map(rowHTML).join('') || emptyHTML()}</div>
        </div>
      </div>
      ${modalHTML()}
    `;

    // translate dynamic
    if(window.__t){
      document.querySelectorAll('[data-i18n]').forEach(el=> el.textContent = window.__t(el.dataset.i18n));
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el=> el.placeholder = window.__t(el.dataset.i18nPlaceholder));
    }

    bind();
  }

  function openModal(){
    const m = document.getElementById('expoModal');
    m.classList.add('is-open');
    m.setAttribute('aria-hidden','false');
  }

  function closeModal(){
    const m = document.getElementById('expoModal');
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden','true');
  }

  function bind(){
    // buttons in root
    root.querySelector('[data-add]')?.addEventListener('click', openModal);
    root.querySelector('[data-export]')?.addEventListener('click', ()=>{
      const blob = new Blob([JSON.stringify(load(), null, 2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'exhibitions.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    const file = root.querySelector('[data-import]');
    if(file){
      file.addEventListener('change', async ()=>{
        const f = file.files?.[0];
        if(!f) return;
        const txt = await f.text();
        const data = JSON.parse(txt);
        if(Array.isArray(data)) save(data);
        render();
      });
    }

    root.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.dataset.del;
        save(load().filter(x=>x.id!==id));
        render();
      });
    });

    const modal = document.getElementById('expoModal');
    modal?.addEventListener('click', (e)=>{
      if(e.target === modal) closeModal();
      if(e.target.closest('[data-close]')) closeModal();
    });

    const form = document.getElementById('expoForm');
    form?.addEventListener('submit', (ev)=>{
      ev.preventDefault();
      const fd = new FormData(form);
      const obj = Object.fromEntries(fd.entries());
      const list = load();
      list.push({
        id: uuid(),
        title: String(obj.title||'').trim(),
        city: String(obj.city||'').trim(),
        venue: String(obj.venue||'').trim(),
        link: String(obj.link||'').trim(),
        date: String(obj.date||'').trim(),
        status: obj.status === 'upcoming' ? 'upcoming' : 'past'
      });
      save(list);
      closeModal();
      render();
    });
  }

  ensureSeed().finally(render);
})();
