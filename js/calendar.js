(function(){
  const root = document.getElementById('calRoot');
  if(!root) return;

  const KEY = 'exhibitions.v1';
  function load(){ return JSON.parse(localStorage.getItem(KEY) || '[]'); }

  let view = new Date();
  view.setDate(1);

  function fmtMonth(d){
    const lang = window.__lang?.() || 'fr';
    return d.toLocaleDateString(lang==='zh-Hant' ? 'zh-Hant' : lang, {month:'long', year:'numeric'});
  }

  function render(){
    const list = load().filter(x=>x.status==='upcoming');
    const map = new Map();
    list.forEach(x=>{
      const k = x.date;
      if(!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    });

    const year = view.getFullYear();
    const month = view.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(year, month+1, 0).getDate();

    const cells = [];
    for(let i=0;i<startWeekday;i++) cells.push(null);
    for(let d=1; d<=daysInMonth; d++){
      const dt = new Date(year, month, d);
      const key = dt.toISOString().slice(0,10);
      cells.push({d, key, events: map.get(key) || []});
    }
    while(cells.length % 7 !== 0) cells.push(null);

    root.innerHTML = `
      <div class="cal">
        <div class="cal-head">
          <button class="icon-btn" data-prev>←</button>
          <h2 style="margin:0">${fmtMonth(view)}</h2>
          <button class="icon-btn" data-next>→</button>
        </div>

        <div class="cal-grid">
          ${['L','M','M','J','V','S','D'].map(x=>`<div class="muted" style="padding:6px 10px">${x}</div>`).join('')}
          ${cells.map(c=>{
            if(!c) return `<div></div>`;
            const has = c.events.length>0;
            return `
              <div class="day ${has?'has-event':''}" data-date="${c.key}">
                <div class="n">${c.d}</div>
                ${has ? `<span class="dot"></span> <span class="muted">${c.events.length}</span>` : ``}
              </div>
            `;
          }).join('')}
        </div>

        <div class="card card-pad" id="calDetails">
          <p class="muted">${window.__t?.('cal.click') ?? 'Cliquez sur une date pour voir les expositions.'}</p>
        </div>
      </div>
    `;

    root.querySelector('[data-prev]')?.addEventListener('click', ()=>{ view.setMonth(view.getMonth()-1); render(); });
    root.querySelector('[data-next]')?.addEventListener('click', ()=>{ view.setMonth(view.getMonth()+1); render(); });

    root.querySelectorAll('[data-date]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const k = el.dataset.date;
        const evs = map.get(k) || [];
        const details = root.querySelector('#calDetails');
        details.innerHTML = evs.length
          ? `<h3 style="margin-top:0">${k}</h3>` + evs.map(x=>`
              <div class="item">
                <div>
                  <div style="font-weight:600">${x.title}</div>
                  <div class="muted">${x.city}${x.venue ? ' • '+x.venue : ''}</div>
                </div>
                <span class="badge">${window.__t?.('expo.badgeUpcoming') ?? 'À venir'}</span>
              </div>`).join('')
          : `<p class="muted">${window.__t?.('cal.none') ?? 'Aucune exposition à cette date.'}</p>`;
      });
    });
  }

  window.addEventListener('exhibitions:changed', render);

  render();
})();
