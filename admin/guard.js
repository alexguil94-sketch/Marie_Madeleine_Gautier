(async function(){
  const sb = window.mmgSupabase;

  const hard404 = () => {
    document.documentElement.innerHTML = `
      <head><meta name="robots" content="noindex,nofollow"></head>
      <body style="font-family:system-ui;background:#0b0b0b;color:#fff;padding:40px">
        <h1 style="margin:0 0 12px">404</h1>
        <p style="opacity:.8;margin:0">Not found.</p>
      </body>`;
  };

  const redirectToLogin = () => {
    const back = encodeURIComponent(location.pathname + location.search + location.hash);
    // ../login.html car on est dans /admin/
    location.replace(`../login.html?redirect=${back}`);
  };

  if(!sb || !sb.auth){
    hard404();
    return;
  }

  const { data } = await sb.auth.getSession();
  const user = data?.session?.user || null;

  if(!user){
    redirectToLogin();
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
// js/admin-guard.js
// Bloque /admin.html si pas connecté ou pas role=admin

(() => {
  "use strict";

  const qs = (s, r = document) => r.querySelector(s);
  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;

  const hard404 = () => {
    document.documentElement.innerHTML = `
      <head><meta name="robots" content="noindex,nofollow"></head>
      <body style="font-family:system-ui;background:#0b0b0b;color:#fff;padding:40px">
        <h1 style="margin:0 0 12px">404</h1>
        <p style="opacity:.8;margin:0">Not found.</p>
      </body>`;
  };

  const redirectLogin = () => {
    const back = encodeURIComponent(location.pathname + location.search + location.hash);
    location.replace(`/login.html?redirect=${back}`);
  };

  async function waitSB(ms = 4000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
      const sb = getSB();
      if (sb?.auth?.getSession) return sb;
      await new Promise((r) => setTimeout(r, 80));
    }
    return null;
  }

  async function run() {
    const sb = await waitSB();
    if (!sb) return hard404();

    const { data } = await sb.auth.getSession();
    const user = data?.session?.user || null;
    if (!user) return redirectLogin();

    const { data: prof, error } = await sb
      .from("profiles")
      .select("role,display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("[admin] profiles select error", error);
      return hard404();
    }

    if (prof?.role !== "admin") return hard404();

    // OK => affiche l'admin
    const app = qs("#adminApp");
    if (app) app.hidden = false;
  }

  window.addEventListener("DOMContentLoaded", run);
})();
