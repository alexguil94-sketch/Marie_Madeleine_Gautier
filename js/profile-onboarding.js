/* js/profile-onboarding.js
   Index profile picker: pseudo + avatar
   - uses Supabase auth + profiles
   - stores avatar in bucket "media" under avatars/<uid>/avatar.ext
*/

(() => {
  "use strict";

  // Anti double init
  if (window.__MMG_PROFILE_ONBOARD_INITED__) return;
  window.__MMG_PROFILE_ONBOARD_INITED__ = true;

  const sb = window.mmgSupabase;
  if (!sb) {
    console.warn("[PF] Supabase client missing (window.mmgSupabase).");
    return;
  }

  const bucket = window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media";

  const $ = (id) => document.getElementById(id);

  const modal = $("pfModal");
  const btnOpen = $("pfOpen");
  const btnClose = $("pfClose");

  const signedOut = $("pfSignedOut");
  const signedIn = $("pfSignedIn");

  const elEmail = $("pfEmail");
  const inName = $("pfName");
  const inAvatar = $("pfAvatar");
  const imgPrev = $("pfAvatarPreview");

  const btnSave = $("pfSave");
  const btnRemove = $("pfRemoveAvatar");
  const btnLogout = $("pfLogout");
  const msg = $("pfMsg");
  const loginLink = $("pfLoginLink");

  if (!modal || !signedOut || !signedIn) return;

  const setMsg = (t = "") => { if (msg) msg.textContent = t; };

  const open = () => { modal.hidden = false; };
  const close = () => { modal.hidden = true; setMsg(""); };

  btnClose?.addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  btnOpen?.addEventListener("click", open);

  const getPublicUrl = (path) => {
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  };

  async function getUser() {
    const { data } = await sb.auth.getUser();
    return data?.user || null;
  }

  async function loadProfile(uid) {
    const { data, error } = await sb
      .from("profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      console.warn("[PF] load profile error:", error);
      return null;
    }

    // If no row, create minimal row (requires insert policy)
    if (!data) {
      const { error: insErr } = await sb.from("profiles").insert({ id: uid, role: "user" });
      if (insErr) console.warn("[PF] create profile error:", insErr);

      const again = await sb.from("profiles").select("id,display_name,avatar_url,role").eq("id", uid).maybeSingle();
      return again.data || null;
    }

    return data;
  }

  function renderSignedOut() {
    signedOut.hidden = false;
    signedIn.hidden = true;
    btnOpen.hidden = true;

    // redirect back to index after login
    const back = encodeURIComponent(location.pathname || "/");
    if (loginLink) loginLink.href = `./login.html?redirect=${back}`;
  }

  function renderSignedIn(user, profile) {
    signedOut.hidden = true;
    signedIn.hidden = false;
    btnOpen.hidden = false;

    if (elEmail) elEmail.textContent = user.email || "";
    if (inName) {
      const proposed = (user.email || "").split("@")[0].slice(0, 32);
      inName.value = profile?.display_name || proposed || "";
    }

    const avatar = profile?.avatar_url || "";
    if (imgPrev) {
      imgPrev.src = avatar || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect width='56' height='56' rx='18' fill='%23222'/%3E%3C/svg%3E";
    }
  }

  async function refreshUI({ autoOpenIfMissing = false } = {}) {
    const user = await getUser();
    if (!user) {
      renderSignedOut();
      return;
    }

    const profile = await loadProfile(user.id);
    renderSignedIn(user, profile);

    // Auto-open if profile incomplete
    if (autoOpenIfMissing && (!profile?.display_name || profile.display_name.trim() === "")) {
      open();
      setMsg("Choisis un pseudo pour terminer ton profil 🙂");
    }
  }

  // Preview avatar locally
  inAvatar?.addEventListener("change", () => {
    const f = inAvatar.files?.[0];
    if (!f || !imgPrev) return;
    imgPrev.src = URL.createObjectURL(f);
  });

  btnLogout?.addEventListener("click", async () => {
    try {
      await sb.auth.signOut();
    } catch {}
    close();
    await refreshUI();
  });

  btnRemove?.addEventListener("click", async () => {
    setMsg("");
    const user = await getUser();
    if (!user) return;

    const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (error) return setMsg(error.message || "Erreur avatar");

    if (imgPrev) {
      imgPrev.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect width='56' height='56' rx='18' fill='%23222'/%3E%3C/svg%3E";
    }
    setMsg("Avatar retiré ✅");
  });

  btnSave?.addEventListener("click", async () => {
    setMsg("");

    const user = await getUser();
    if (!user) return setMsg("Connecte-toi d’abord.");

    const display_name = String(inName?.value || "").trim().slice(0, 32);
    if (!display_name) return setMsg("Choisis un pseudo.");

    try {
      // Keep current avatar unless new upload
      const profile = await loadProfile(user.id);
      let avatar_url = profile?.avatar_url || null;

      const file = inAvatar?.files?.[0];
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        const path = `avatars/${user.id}/avatar.${ext}`;

        const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });
        if (upErr) throw upErr;

        avatar_url = getPublicUrl(path);
      }

      const { error } = await sb
        .from("profiles")
        .update({ display_name, avatar_url })
        .eq("id", user.id);

      if (error) throw error;

      setMsg("Profil mis à jour ✅");
      close();
      await refreshUI();
    } catch (e) {
      console.error(e);
      setMsg(e?.message || "Erreur profil");
    }
  });

  // React to OAuth redirects / session changes
  sb.auth.onAuthStateChange(async () => {
    await refreshUI();
  });

  // Boot
  window.addEventListener("DOMContentLoaded", async () => {
    await refreshUI({ autoOpenIfMissing: true });
  });
})();
