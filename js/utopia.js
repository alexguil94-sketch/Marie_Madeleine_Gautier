(function(){
  const root = document.getElementById('utopiaRoot');
  if(!root) return;

  const steps = [
    { key:'country', titleKey:'utopia.stepCountry', choices:[
      {id:'utopie', labelKey:'utopia.c1'}, {id:'harmonia', labelKey:'utopia.c2'}, {id:'serenite', labelKey:'utopia.c3'}
    ]},
    { key:'gov', titleKey:'utopia.stepGov', choices:[
      {id:'direct', labelKey:'utopia.g1'}, {id:'consensus', labelKey:'utopia.g2'}, {id:'merit', labelKey:'utopia.g3'}
    ]},
    { key:'eco', titleKey:'utopia.stepEco', choices:[
      {id:'sharing', labelKey:'utopia.e1'}, {id:'circular', labelKey:'utopia.e2'}, {id:'resilient', labelKey:'utopia.e3'}
    ]},
    { key:'edu', titleKey:'utopia.stepEdu', choices:[
      {id:'lifelong', labelKey:'utopia.ed1'}, {id:'practical', labelKey:'utopia.ed2'}, {id:'holistic', labelKey:'utopia.ed3'}
    ]},
    { key:'env', titleKey:'utopia.stepEnv', choices:[
      {id:'zero', labelKey:'utopia.en1'}, {id:'renew', labelKey:'utopia.en2'}, {id:'regen', labelKey:'utopia.en3'}
    ]},
  ];

  let at = 0;
  const picked = {};

  function render(){
    const s = steps[at];
    if(!s){
      const summary = steps.map(st=>{
        const choice = st.choices.find(c=>c.id===picked[st.key]);
        return `${window.__t(st.titleKey)}: ${window.__t(choice.labelKey)}`;
      }).join('\n');

      root.innerHTML = `
        <div class="card card-pad">
          <h2 style="margin-top:0">${window.__t('utopia.resultTitle')}</h2>
          <pre style="white-space:pre-wrap; background:rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.12); padding:12px; border-radius:14px">${summary}</pre>
          <div style="display:flex; gap:10px; flex-wrap:wrap">
            <button class="btn" data-copy>${window.__t('utopia.copy')}</button>
            <button class="btn ghost" data-reset>${window.__t('utopia.reset')}</button>
          </div>
        </div>
      `;

      root.querySelector('[data-copy]').onclick = async ()=>{
        await navigator.clipboard.writeText(summary);
      };
      root.querySelector('[data-reset]').onclick = ()=>{
        at = 0;
        for(const k in picked) delete picked[k];
        render();
      };
      return;
    }

    root.innerHTML = `
      <div class="card card-pad">
        <h2 style="margin-top:0">${window.__t(s.titleKey)}</h2>
        <div class="columns">
          ${s.choices.map(c=>`
            <button class="card card-pad" style="text-align:left; cursor:pointer" data-pick="${c.id}">
              <div class="kicker">${window.__t('utopia.choice')}</div>
              <div style="font-size:18px; font-family:'Cinzel', 'Playfair Display', Georgia, serif">${window.__t(c.labelKey)}</div>
              <p class="muted" style="margin-bottom:0">${window.__t('utopia.tap')}</p>
            </button>
          `).join('')}
        </div>
        <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap; align-items:center">
          ${at>0 ? `<button class="btn ghost" data-back>← ${window.__t('utopia.back')}</button>` : ''}
          <span class="muted">${window.__t('utopia.progress')} ${at+1}/${steps.length}</span>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-pick]').forEach(b=>{
      b.onclick = ()=>{
        picked[s.key] = b.dataset.pick;
        at++;
        render();
      };
    });

    const back = root.querySelector('[data-back]');
    if(back) back.onclick = ()=>{ at = Math.max(0, at-1); render(); };
  }

  render();
})();
