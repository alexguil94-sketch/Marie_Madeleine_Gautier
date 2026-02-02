// js/profile-onboarding.js
// Ouvre automatiquement la modale profil sur index si profil incomplet
(() => {
  "use strict";
  if (window.__MMG_PROFILE_ONBOARD_INIT__) return;
  window.__MMG_PROFILE_ONBOARD_INIT__ = true;

  const KEY = "mmg_profile_onboard_done_v1";

  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;

  async function getUser() {
    const sb = getSB();
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  async function getProfile(userId) {
    const sb = getSB();
    if (!sb) return null;
    const { data } = await sb.from("profiles").select("display_name,avatar_url").eq("id", userId).maybeSingle();
    return data || null;
  }

  async function run() {
    // seulement sur la home
    if (!location.pathname.endsWith("/") && !location.pathname.endsWith("/index.html") && !location.pathname.endsWith("index.html")) {
      return;
    }

    // évite de spam
    if (localStorage.getItem(KEY) === "1") return;

    const user = await getUser();
    if (!user) return; // pas connecté -> on ne force pas

    const profile = await getProfile(user.id);
    const incomplete = !profile?.display_name || !profile?.avatar_url;

    if (incomplete && window.MMGProfile?.open) {
      window.MMGProfile.open();
    }

    // on marque "fait" seulement si profil complet
    if (!incomplete) localStorage.setItem(KEY, "1");
  }

  window.addEventListener("DOMContentLoaded", run);
  document.addEventListener("partials:loaded", run);
})();
