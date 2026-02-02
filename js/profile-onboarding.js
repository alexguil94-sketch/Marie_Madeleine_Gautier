// js/profile-onboarding.js
// Ouvre la modale profil sur index si le pseudo n'est pas défini (une seule fois).

(() => {
  "use strict";
  if (window.__MMG_PROFILE_ONBOARD_INIT__) return;
  window.__MMG_PROFILE_ONBOARD_INIT__ = true;

  const FLAG = "mmg_profile_onboard_done_v1";

  function getSB() {
    return window.mmgSupabase || window.mmg_supabase || null;
  }

  async function run() {
    // On ne le fait que sur la home (optionnel)
    const isHome = location.pathname.endsWith("/") || location.pathname.endsWith("/index.html");
    if (!isHome) return;

    if (localStorage.getItem(FLAG) === "1") return;

    const sb = getSB();
    if (!sb?.auth) return;

    const { data } = await sb.auth.getSession();
    const user = data?.session?.user || null;
    if (!user) return;

    // Profile row
    const { data: p } = await sb
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (p?.display_name && String(p.display_name).trim()) {
      localStorage.setItem(FLAG, "1");
      return;
    }

    // Attend que MMGProfile existe
    const tryOpen = () => window.MMGProfile?.open?.();
    setTimeout(tryOpen, 250);
  }

  window.addEventListener("DOMContentLoaded", run);
})();
