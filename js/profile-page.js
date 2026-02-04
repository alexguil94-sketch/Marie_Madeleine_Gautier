// js/profile-page.js
// Page dédiée: pseudo + avatar
(() => {
  "use strict";
  if (window.__MMG_PROFILE_PAGE_INIT__) return;
  window.__MMG_PROFILE_PAGE_INIT__ = true;

  const qs = (s, r = document) => r.querySelector(s);
  const isAbort = (e) =>
    e?.name === "AbortError" || /signal is aborted/i.test(String(e?.message || e || ""));

  const getSB = () => window.mmgSupabase || null;
  const getBucket = () => (window.MMG_SUPABASE?.bucket || window.SUPABASE_BUCKET || "media");

  const waitForSB = async (timeoutMs = 6000) => {
    if (getSB()) return getSB();

    const status = window.__MMG_SB_STATUS__;
    if (status && status !== "loading") return null;

    return await new Promise((resolve) => {
      let done = false;
      const onReady = () => {
        if (done) return;
        done = true;
        resolve(getSB());
      };

      document.addEventListener("sb:ready", onReady, { once: true });

      setTimeout(() => {
        if (done) return;
        done = true;
        document.removeEventListener("sb:ready", onReady);
        resolve(getSB());
      }, timeoutMs);
    });
  };

  const resolveUrl = (uOrPath) => {
    const v = String(uOrPath || "").trim();
    if (!v) return "";
    if (v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/")) return v;

    const sb = getSB();
    if (!sb?.storage) return v;
    const { data } = sb.storage.from(getBucket()).getPublicUrl(v);
    return data?.publicUrl || v;
  };

  const loginRedirectUrl = () =>
    "/login.html?redirect=" + encodeURIComponent(location.pathname + location.search);

  async function getUser(sb) {
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  async function ensureProfileRow(sb, user) {
    if (!sb || !user) return null;

    const { data: existing } = await sb
      .from("profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", user.id)
      .maybeSingle();

    if (existing) return existing;

    const seed = { id: user.id };
    const metaName = user.user_metadata?.name;
    if (typeof metaName === "string" && metaName.trim()) seed.display_name = metaName.trim().slice(0, 32);

    const { error: insErr } = await sb.from("profiles").insert(seed);
    if (insErr) {
      // Ignore if another client created it meanwhile or if RLS blocks inserts.
    }

    const { data } = await sb
      .from("profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", user.id)
      .maybeSingle();

    return data || null;
  }

  async function uploadAvatar(sb, userId, file) {
    const bucket = getBucket();
    const ext =
      (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `avatars/${userId}/avatar.${ext}`;

    const { error } = await sb.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (error) throw error;

    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  async function init() {
    const root = qs("#profileRoot");
    if (!root) return;

    const loading = qs("#ppLoading");
    const signedOut = qs("#ppSignedOut");
    const signedIn = qs("#ppSignedIn");

    const loginLink = qs("#ppLoginLink");
    const emailEl = qs("#ppEmail");
    const nameInput = qs("#ppName");
    const avatarInput = qs("#ppAvatar");
    const avatarPreview = qs("#ppAvatarPreview");
    const removeBtn = qs("#ppRemoveAvatar");
    const saveBtn = qs("#ppSave");
    const signOutBtn = qs("#ppSignOut");
    const msg = qs("#ppMsg");

    const setMsg = (t) => { if (msg) msg.textContent = t || ""; };

    const setMode = ({ isLoading, isSignedIn, isSignedOut }) => {
      if (loading) loading.hidden = !isLoading;
      if (signedIn) signedIn.hidden = !isSignedIn;
      if (signedOut) signedOut.hidden = !isSignedOut;
    };

    if (loginLink) loginLink.href = loginRedirectUrl();

    setMode({ isLoading: true, isSignedIn: false, isSignedOut: false });

    const sb = await waitForSB();
    if (!sb?.auth) {
      setMode({ isLoading: false, isSignedIn: false, isSignedOut: true });
      setMsg("Supabase indisponible.");
      return;
    }

    const render = async () => {
      setMsg("");
      setMode({ isLoading: true, isSignedIn: false, isSignedOut: false });

      const user = await getUser(sb);
      if (!user) {
        setMode({ isLoading: false, isSignedIn: false, isSignedOut: true });
        return;
      }

      const profile = await ensureProfileRow(sb, user);

      if (emailEl) emailEl.textContent = user.email || "";
      if (nameInput) nameInput.value = profile?.display_name || "";

      const avatarUrl = resolveUrl(profile?.avatar_url || "");
      if (avatarPreview) {
        if (avatarUrl) {
          avatarPreview.src = avatarUrl;
          avatarPreview.style.display = "block";
        } else {
          avatarPreview.removeAttribute("src");
          avatarPreview.style.display = "none";
        }
      }

      if (removeBtn) removeBtn.style.display = avatarUrl ? "inline-flex" : "none";
      if (avatarInput) avatarInput.value = "";

      setMode({ isLoading: false, isSignedIn: true, isSignedOut: false });
    };

    const withBusy = async (fn) => {
      if (saveBtn) saveBtn.disabled = true;
      if (removeBtn) removeBtn.disabled = true;
      if (signOutBtn) signOutBtn.disabled = true;
      try {
        await fn();
      } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (removeBtn) removeBtn.disabled = false;
        if (signOutBtn) signOutBtn.disabled = false;
      }
    };

    avatarInput?.addEventListener("change", () => {
      const f = avatarInput.files?.[0];
      if (!f || !avatarPreview) return;
      avatarPreview.src = URL.createObjectURL(f);
      avatarPreview.style.display = "block";
      if (removeBtn) removeBtn.style.display = "inline-flex";
    });

    signOutBtn?.addEventListener("click", async () => {
      await withBusy(async () => {
        try { await sb.auth.signOut(); } catch {}
        location.href = "/login.html";
      });
    });

    removeBtn?.addEventListener("click", async () => {
      await withBusy(async () => {
        const user = await getUser(sb);
        if (!user) return;

        setMsg("Suppression…");
        const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", user.id);
        if (error) throw error;

        if (avatarPreview) {
          avatarPreview.removeAttribute("src");
          avatarPreview.style.display = "none";
        }
        if (removeBtn) removeBtn.style.display = "none";

        setMsg("Avatar retiré ✅");
        document.dispatchEvent(new CustomEvent("mmg:profile-updated"));
        await render();
      }).catch((e) => {
        console.error(e);
        setMsg(e?.message || "Erreur");
      });
    });

    saveBtn?.addEventListener("click", async () => {
      await withBusy(async () => {
        const user = await getUser(sb);
        if (!user) return;

        const displayName = (nameInput?.value || "").trim();
        if (!displayName) { setMsg("Pseudo obligatoire."); return; }

        setMsg("Enregistrement…");

        const file = avatarInput?.files?.[0] || null;
        let avatarUrl = null;

        const { data: existing } = await sb
          .from("profiles")
          .select("avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        avatarUrl = existing?.avatar_url || null;
        if (file) avatarUrl = await uploadAvatar(sb, user.id, file);

        const { error } = await sb
          .from("profiles")
          .update({ display_name: displayName.slice(0, 32), avatar_url: avatarUrl })
          .eq("id", user.id);

        if (error) throw error;

        setMsg("Profil mis à jour ✅");
        document.dispatchEvent(new CustomEvent("mmg:profile-updated"));
        await render();
      }).catch((e) => {
        console.error(e);
        setMsg(e?.message || "Erreur sauvegarde");
      });
    });

    sb.auth.onAuthStateChange(() => {
      render().catch((err) => {
        if (isAbort(err)) return;
        console.error(err);
      });
    });
    await render();
  }

  window.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => {
      if (isAbort(err)) return;
      console.error(err);
    });
  });
})();
