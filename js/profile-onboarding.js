// js/profile-onboarding.js (v2)
// Ouvre automatiquement la modale profil sur index si pseudo/avatar manquants.
// Dépend de MMGProfile (profile-ui.js) + Supabase client.

(() => {
  "use strict";
  if (window.__MMG_PROFILE_ONBOARD_INIT__) return;
  window.__MMG_PROFILE_ONBOARD_INIT__ = true;

  const KEY = "mmg_profile_onboard_dismissed_v1";
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

  async function maybeOpen() {
    // uniquement sur index
    const isIndex =
      location.pathname.endsWith("/") ||
      location.pathname.endsWith("/index.html") ||
      location.pathname === "/";

    if (!isIndex) return;
    if (localStorage.getItem(KEY) === "1") return;

    const user = await getUser();
    if (!user) return;

    const p = await getProfile(user.id);
    const missingName = !p?.display_name || !String(p.display_name).trim();
    const missingAvatar = !p?.avatar_url;

    if (missingName || missingAvatar) {
      // petit délai pour laisser l’injection header se faire
      setTimeout(() => window.MMGProfile?.open?.(), 250);
    }
  }

  window.addEventListener("DOMContentLoaded", maybeOpen);

  // option: si tu veux un bouton "plus tard", tu peux le gérer dans UI
})();
