// js/profile-onboarding.js
(() => {
  "use strict";
  if (window.__MMG_PROFILE_ONBOARD__) return;
  window.__MMG_PROFILE_ONBOARD__ = true;

  const isAbort = (e) =>
    e?.name === "AbortError" || /signal is aborted/i.test(String(e?.message || e || ""));

  const isIndex =
    location.pathname === "/" ||
    /\/index\.html$/i.test(location.pathname);

  if (!isIndex) return;

  const waitProfileReady = () =>
    new Promise((res) => {
      if (window.MMGProfile) return res();
      document.addEventListener("mmg:profile-ready", () => res(), { once: true });
    });

  async function run() {
    await waitProfileReady();

    // Si pas de supabase, on ne fait rien
    const sb = window.mmgSupabase;
    if (!sb?.auth) return;

    const { data } = await sb.auth.getSession();
    const user = data?.session?.user || null;

    if (!user) {
      // pas connecté => on laisse le header montrer "Se connecter"
      return;
    }

    // regarde si pseudo/avatar sont set
    const { data: prof } = await sb
      .from("profiles")
      .select("display_name,avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    const missing = !prof?.display_name || !prof?.avatar_url;
    if (missing) {
      // ouvre la modale directement
      window.MMGProfile.open();
    } else {
      // profil ok => affiche le bouton discret
      const fab = document.getElementById("pfOpen");
      if (fab) fab.hidden = false;
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    run().catch((err) => {
      if (isAbort(err)) return;
      console.error(err);
    });
  });
})();
