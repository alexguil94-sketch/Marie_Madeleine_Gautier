(async function(){
  // Guard for /admin: allow login page for signed-out users,
  // allow dashboard only for users with role=admin, otherwise show 404.
  const sb = window.mmgSupabase;
  const hard404 = () => {
    document.documentElement.innerHTML = `
      <head><meta name="robots" content="noindex,nofollow"></head>
      <body style="font-family:system-ui;background:#0b0b0b;color:#fff;padding:40px">
        <h1 style="margin:0 0 12px">404</h1>
        <p style="opacity:.8;margin:0">Not found.</p>
      </body>`;
  };

  if(!sb || !sb.auth){
    // If Supabase not configured, show page (it will display message)
    document.documentElement.classList.add('admin-ok');
    return;
  }

  const { data } = await sb.auth.getSession();
  const user = data?.session?.user || null;

  if(!user){
    // Show login form
    document.documentElement.classList.add('admin-ok');
    return;
  }

  const { data: profile, error } = await sb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if(error || !profile || profile.role !== 'admin'){
    hard404();
    return;
  }

  document.documentElement.classList.add('admin-ok');
})();