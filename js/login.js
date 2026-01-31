(function(){
  const sb = window.mmgSupabase;
  const t = (k)=> (window.__t ? window.__t(k) : k);

  const $ = (id)=> document.getElementById(id);
  const form = $('loginForm');
  const msg = $('loginMsg');
  const btnMagic = $('btnMagic');
  const btnSignUp = $('btnSignUp');
  const btnSignOut = $('btnSignOut');

  function setMsg(text, isError=false){
    if(!msg) return;
    msg.textContent = text || '';
    msg.style.color = isError ? 'var(--danger, #ff6b6b)' : '';
  }

  function getRedirect(){
    try{
      const u = new URL(location.href);
      const r = u.searchParams.get('redirect');
      // allow only same-origin path-ish redirects
      if(r && (r.startsWith('/') || r.startsWith(location.origin))) return r;
    }catch{}
    return 'index.html';
  }

  async function refreshUI(){
    if(!sb){ setMsg('Supabase non configuré', true); return; }
    const { data } = await sb.auth.getSession();
    const user = data?.session?.user || null;
    if(btnSignOut) btnSignOut.hidden = !user;
    if(user){
      setMsg((t('auth.ok') || 'Connexion réussie…') + ' ' + (user.email || ''));
      // small delay to let user see message
      setTimeout(()=>{ location.href = getRedirect(); }, 300);
    }
  }

  if(btnSignOut){
    btnSignOut.addEventListener('click', async ()=>{
      try{ await sb?.auth?.signOut?.(); }catch{}
      setMsg('');
      btnSignOut.hidden = true;
    });
  }

  if(form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      if(!sb) return setMsg('Supabase non configuré', true);

      const fd = new FormData(form);
      const email = String(fd.get('email')||'').trim();
      const password = String(fd.get('password')||'').trim();
      if(!email) return;

      if(!password){
        return setMsg((t('auth.err')||'Erreur :') + ' ' + 'Mot de passe requis pour cette action.', true);
      }

      const { error } = await sb.auth.signInWithPassword({ email, password });
      if(error) return setMsg((t('auth.err')||'Erreur :') + ' ' + error.message, true);
      await refreshUI();
    });
  }

  if(btnMagic){
    btnMagic.addEventListener('click', async ()=>{
      if(!sb) return setMsg('Supabase non configuré', true);
      const email = String(document.querySelector('[name="email"]')?.value || '').trim();
      if(!email) return setMsg((t('auth.err')||'Erreur :') + ' ' + 'Email requis.', true);

      // Redirect back to this login page, then we will forward to ?redirect=...
      const redirectTo = location.origin + '/login.html?redirect=' + encodeURIComponent(getRedirect());
      const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: redirectTo }});
      if(error) return setMsg((t('auth.err')||'Erreur :') + ' ' + error.message, true);
      setMsg(t('auth.sent') || 'Lien envoyé. Vérifiez vos emails.');
    });
  }

  if(btnSignUp){
    btnSignUp.addEventListener('click', async ()=>{
      if(!sb) return setMsg('Supabase non configuré', true);
      const email = String(document.querySelector('[name="email"]')?.value || '').trim();
      const password = String(document.querySelector('[name="password"]')?.value || '').trim();
      if(!email || !password) return setMsg((t('auth.err')||'Erreur :') + ' ' + 'Email + mot de passe requis.', true);

      const redirectTo = location.origin + '/login.html?redirect=' + encodeURIComponent(getRedirect());
      const { error } = await sb.auth.signUp({ email, password, options:{ emailRedirectTo: redirectTo }});
      if(error) return setMsg((t('auth.err')||'Erreur :') + ' ' + error.message, true);
      setMsg('Compte créé. Confirmez via email si demandé, puis reconnectez-vous.');
    });
  }

  // If already signed in, redirect
  window.addEventListener('DOMContentLoaded', refreshUI);

})();
