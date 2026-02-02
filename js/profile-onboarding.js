// js/profile-onboarding.js
// Sur index: force le choix pseudo/avatar si profil incomplet

(() => {
  "use strict";
  if (window.__MMG_PROFILE_ONBOARD_INIT__) return;
  window.__MMG_PROFILE_ONBOARD_INIT__ = true;

  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;

  async function getUser() {
    const sb = getSB();
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  async function getProfile(userId) {
    const sb = getSB();
    const { data } = await sb
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    return data || null;
  }

  async function run() {
    const sb = getSB();
    if (!sb) return;

    const user = await getUser();
    if (!user) return;

    const key = `mmg_onboarding_done_${user.id}`;
    if (localStorage.getItem(key) === "1") return;

    const profile = await getProfile(user.id);
    const missingName = !profile?.display_name || !String(profile.display_name).trim();

    // Tu peux aussi exiger l’avatar :
    // const missingAvatar = !profile?.avatar_url;
    // const must = missingName || missingAvatar;
    const must = missingName;

    if (must && window.MMGProfile?.open) {
      window.MMGProfile.open();
      localStorage.setItem(key, "1");
    }
  }

  window.addEventListener("DOMContentLoaded", run);
  document.addEventListener("partials:loaded", run);
})();
